import { bchDecode } from "../core/bch";
import { gf256Qr } from "../core/gf";
import { rsDecode } from "../core/rs";
import type { EccInfo, SymbolInfo } from "../core/types";
import { parseBitStream, type Parsed } from "./bitstream";
import { BitMatrix, blockStructure, deinterleave, layoutOf, microFormatPositions, placementOrder, qrFormatPositions, rmqrFormatPositions, type BlockStructure, type Kind, type Layout } from "./layout";
import { MICRO_MASKS, MICRO_SYMBOLS, QR_LEVEL_FROM_BITS, QR_MASKS, RMQR_HEIGHTS, RMQR_MASK, RMQR_WIDTHS, type Level, type MaskFn } from "./tables";

export interface MatrixResult extends Parsed {
  kind: Kind;
  version: number;
  level: Level;
  mirrored: boolean;
  ecc: EccInfo;
  symbol: SymbolInfo;
}

const readBits = (m: BitMatrix, positions: readonly [number, number][]): number => positions.reduce((v, [x, y]) => (v << 1) | (m.get(x, y) ? 1 : 0), 0);
const readBitsLsb = (m: BitMatrix, positions: readonly [number, number][]): number => positions.reduce((v, [x, y], i) => v | ((m.get(x, y) ? 1 : 0) << i), 0);

/** Format hypotheses of a QR matrix from both copies: nearest first, distance ≤ 3, a tie's second value included. */
function qrFormats(m: BitMatrix): { level: Level; mask: number }[] {
  const [one, two] = qrFormatPositions(m.width), seen = new Map<number, number>();
  for (const bits of [readBits(m, one), readBits(m, two)]) {
    const d = bchDecode(bits, 5, 15, 0x537, 0x5412, 3);
    if (!d) continue;
    for (const data of [d.data, d.second]) if (data !== null && !seen.has(data)) seen.set(data, d.distance);
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([data]) => ({ level: QR_LEVEL_FROM_BITS[data >> 3]!, mask: data & 7 }));
}

/**
 * The version is the matrix size: the version information (v ≥ 7) could only agree or, damaged, mislead. Read against
 * another size, the layout, the format positions and the confidence array would all be wrong, so it is never consulted.
 */
const qrVersion = (m: BitMatrix): number => (m.width - 17) / 4;

/** Codewords (and the least module confidence in each) read in placement order with the mask removed. */
function readCodewords(layout: Layout, m: BitMatrix, confidence: Float32Array | null, mask: MaskFn, structure: BlockStructure): { codewords: Uint8Array; conf: Float32Array } | null {
  const order = placementOrder(layout), total = structure.total, halfLast = layout.kind === "micro" && layout.version % 2 === 1;
  const codewords = new Uint8Array(total), conf = new Float32Array(total).fill(1);
  let index = 0, bitsIn = 0, value = 0, c = 1;
  for (const [x, y] of order) {
    if (index >= total) break;
    value = (value << 1) | ((m.get(x, y) ? 1 : 0) ^ (mask(x, y) ? 1 : 0));
    bitsIn++;
    if (confidence) c = Math.min(c, confidence[y * m.width + x]!);
    const want = halfLast && index === structure.data - 1 ? 4 : 8;
    if (bitsIn === want) {
      // the 4-bit final data codeword of M1 and M3 is the top nibble of its Reed–Solomon symbol
      codewords[index] = want === 4 ? value << 4 : value;
      conf[index] = c;
      index++; bitsIn = 0; value = 0; c = 1;
    }
  }
  return index === total ? { codewords, conf } : null;
}

/**
 * Reed–Solomon over every block: first without erasures (up to t errors), then with the codewords under 0.15
 * confidence as erasures, least confident first, two at a time; with erasures two check symbols always stay for
 * detection (2e + s ≤ 2t − 2), since a guess that spends every check symbol would always "correct" into something.
 */
function correctBlocks(structure: BlockStructure, codewords: Uint8Array, conf: Float32Array, soft: boolean): { data: Uint8Array; corrected: number; erasures: number } | null {
  const gf = gf256Qr(), data: number[] = [], t = structure.ecPerBlock >> 1;
  let corrected = 0, erasures = 0;
  for (const b of deinterleave(structure)) {
    const idx = [...b.data, ...b.ec], word = idx.map((i) => codewords[i]!);
    const doubtful = soft ? idx.map((_, k) => k).filter((k) => conf[idx[k]!]! < 0.15).sort((p, q) => conf[idx[p]!]! - conf[idx[q]!]!) : [];
    let ok: { trial: number[]; corrected: number; erasures: number } | null = null;
    for (let s = 0; s <= Math.min(doubtful.length, structure.ecPerBlock - 2) && ok === null; s += 2) {
      const trial = word.slice(), res = rsDecode(gf, trial, structure.ecPerBlock, doubtful.slice(0, s));
      if (res && (s === 0 ? res.corrected <= t : 2 * res.corrected + res.erasures <= structure.ecPerBlock - 2)) ok = { trial, ...res };
    }
    if (ok === null) return null;
    corrected += ok.corrected;
    erasures += ok.erasures;
    for (let k = 0; k < b.n; k++) data.push(ok.trial[k]!);
  }
  return { data: Uint8Array.from(data), corrected, erasures };
}

function finish(kind: Kind, version: number, level: Level, m: BitMatrix, confidence: Float32Array | null, mask: MaskFn, mirrored: boolean): MatrixResult | null {
  const structure = blockStructure(kind, version, level), read = readCodewords(layoutOf(kind, version), m, confidence, mask, structure);
  if (!read) return null;
  const fixed = correctBlocks(structure, read.codewords, read.conf, confidence !== null);
  if (!fixed) return null;
  const dataBits = structure.data * 8 - (kind === "micro" && version % 2 === 1 ? 4 : 0);
  const parsed = parseBitStream(kind, version, fixed.data, dataBits);
  if (!parsed) return null;
  const symbolVersion = kind === "qr" ? version : kind === "micro" ? `M${version}` : `R${RMQR_HEIGHTS[version - 1]}x${RMQR_WIDTHS[version - 1]}`;
  return { ...parsed, kind, version, level, mirrored, ecc: { level, capacity: structure.ecPerBlock * structure.blocks, corrected: fixed.corrected, erasures: fixed.erasures }, symbol: { rows: m.height, cols: m.width, version: symbolVersion } };
}

function transposeConfidence(confidence: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(confidence.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[x * height + y] = confidence[y * width + x]!;
  return out;
}

/** A QR Code matrix: both format copies, mirrored (transposed) as the second hypothesis. */
export function decodeQrMatrix(matrix: BitMatrix, confidence: Float32Array | null = null): MatrixResult | null {
  if (matrix.width !== matrix.height || (matrix.width - 17) % 4 !== 0 || matrix.width < 21 || matrix.width > 177) return null;
  for (const mirrored of [false, true]) {
    const m = mirrored ? matrix.transposed() : matrix, conf = mirrored && confidence ? transposeConfidence(confidence, matrix.width, matrix.height) : confidence;
    const version = qrVersion(m);
    for (const { level, mask } of qrFormats(m)) {
      const r = finish("qr", version, level, m, conf, QR_MASKS[mask]!, mirrored);
      if (r) return r;
    }
  }
  return null;
}

/** A Micro QR matrix (11, 13, 15 or 17 modules). */
export function decodeMicroMatrix(matrix: BitMatrix, confidence: Float32Array | null = null): MatrixResult | null {
  if (matrix.width !== matrix.height || ![11, 13, 15, 17].includes(matrix.width)) return null;
  const version = (matrix.width - 9) / 2;
  for (const mirrored of [false, true]) {
    const m = mirrored ? matrix.transposed() : matrix, conf = mirrored && confidence ? transposeConfidence(confidence, matrix.width, matrix.height) : confidence;
    const d = bchDecode(readBits(m, microFormatPositions()), 5, 15, 0x537, 0x4445, 3);
    if (!d) continue;
    for (const data of [d.data, d.second]) {
      if (data === null) continue;
      const symbol = MICRO_SYMBOLS[data >> 2];
      if (!symbol || symbol.version !== version) continue;
      const r = finish("micro", version, symbol.level, m, conf, MICRO_MASKS[data & 3]!, mirrored);
      if (r) return r;
    }
  }
  return null;
}

/** An rMQR matrix (one of the 32 sizes; a mirrored rMQR has the other shape, so the caller transposes). */
export function decodeRmqrMatrix(matrix: BitMatrix, confidence: Float32Array | null = null): MatrixResult | null {
  const version = RMQR_WIDTHS.findIndex((w, i) => w === matrix.width && RMQR_HEIGHTS[i] === matrix.height) + 1;
  if (version === 0) return null;
  const [left, right] = rmqrFormatPositions(matrix.width, matrix.height), seen = new Map<number, number>();
  for (const [positions, xor] of [[left, 0x1fab2], [right, 0x20a7b]] as const) {
    const d = bchDecode(readBitsLsb(matrix, positions), 6, 18, 0x1f25, xor, 3);
    if (d) for (const data of [d.data, d.second]) if (data !== null && !seen.has(data)) seen.set(data, d.distance);
  }
  for (const [data] of [...seen.entries()].sort((a, b) => a[1] - b[1])) {
    if ((data & 31) + 1 !== version) continue;
    const r = finish("rmqr", version, data >> 5 ? "H" : "M", matrix, confidence, RMQR_MASK, false);
    if (r) return r;
  }
  return null;
}

/** By shape: a square under 21 modules is Micro QR, a square is QR, anything else rMQR. */
export function decodeFamilyMatrix(matrix: BitMatrix, confidence: Float32Array | null = null): MatrixResult | null {
  if (matrix.width === matrix.height) return matrix.width < 21 ? decodeMicroMatrix(matrix, confidence) : decodeQrMatrix(matrix, confidence);
  return decodeRmqrMatrix(matrix, confidence);
}
