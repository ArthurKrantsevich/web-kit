import type { Point } from "../core/types";
import { MICRO_SYMBOLS, QR_BLOCKS, QR_EC_PER_BLOCK, qrAlignmentPositions, qrTotalCodewords, RMQR_ALIGN_COLUMNS, RMQR_BLOCKS, RMQR_DATA, RMQR_HEIGHTS, RMQR_TOTAL, RMQR_WIDTHS, type Level } from "./tables";

/** A module matrix: 1 = dark. */
export class BitMatrix {
  readonly width: number;
  readonly height: number;
  readonly bits: Uint8Array;
  constructor(width: number, height: number, bits?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.bits = bits ?? new Uint8Array(width * height);
  }
  get(x: number, y: number): boolean {
    return this.bits[y * this.width + x] === 1;
  }
  set(x: number, y: number, dark: boolean = true): void {
    this.bits[y * this.width + x] = dark ? 1 : 0;
  }
  /** Rows become columns: a mirrored symbol seen as its upright form. */
  transposed(): BitMatrix {
    const m = new BitMatrix(this.height, this.width);
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) if (this.get(x, y)) m.set(y, x);
    return m;
  }
}

export type Kind = "qr" | "micro" | "rmqr";

/** A symbol's geometry: where the function patterns are, how many codewords it holds, where placement starts. */
export interface Layout {
  kind: Kind;
  version: number;
  width: number;
  height: number;
  /** 1 where a module belongs to a function pattern or format/version information. */
  fn: BitMatrix;
  total: number;
  /** The column the two-column strips skip (QR's vertical timing pattern), or −1. */
  skipColumn: number;
  /** The right column of the first strip. */
  firstColumn: number;
}

export function qrLayout(version: number): Layout {
  const size = version * 4 + 17, fn = new BitMatrix(size, size);
  const box = (x0: number, y0: number, w: number, h: number): void => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < size && y < size) fn.set(x, y); };
  box(0, 0, 9, 9);
  box(size - 8, 0, 8, 9);
  box(0, size - 8, 9, 8);
  for (let i = 8; i < size - 8; i++) { fn.set(i, 6); fn.set(6, i); }
  const positions = qrAlignmentPositions(version);
  for (const cy of positions) for (const cx of positions) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
    box(cx - 2, cy - 2, 5, 5);
  }
  if (version >= 7) { box(size - 11, 0, 3, 6); box(0, size - 11, 6, 3); }
  return { kind: "qr", version, width: size, height: size, fn, total: qrTotalCodewords(version), skipColumn: 6, firstColumn: size - 1 };
}

export function microLayout(version: number): Layout {
  const size = 9 + 2 * version, fn = new BitMatrix(size, size);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) fn.set(x, y);
  for (let i = 9; i < size; i++) { fn.set(i, 0); fn.set(0, i); }
  return { kind: "micro", version, width: size, height: size, fn, total: MICRO_SYMBOLS.find((s) => s.version === version)!.total, skipColumn: -1, firstColumn: size - 1 };
}

export function rmqrLayout(version: number): Layout {
  const w = RMQR_WIDTHS[version - 1]!, h = RMQR_HEIGHTS[version - 1]!, fn = new BitMatrix(w, h);
  const set = (x: number, y: number): void => { if (x >= 0 && y >= 0 && x < w && y < h) fn.set(x, y); };
  for (let y = 0; y < 7; y++) for (let x = 0; x < 8; x++) set(x, y); // finder and its separator column
  if (h > 7) for (let x = 0; x < 8; x++) set(x, 7); // separator row
  for (let y = h - 5; y < h; y++) for (let x = w - 5; x < w; x++) set(x, y); // finder sub-pattern
  set(w - 2, 0); set(w - 1, 0); set(w - 1, 1); set(w - 2, 1); // corner finder patterns, 2×2
  set(0, h - 2); set(0, h - 1); set(1, h - 1); set(1, h - 2);
  for (let x = 0; x < w; x++) { set(x, 0); set(x, h - 1); } // timing patterns on every edge
  for (let y = 0; y < h; y++) { set(0, y); set(w - 1, y); }
  for (const ax of RMQR_ALIGN_COLUMNS[w]!) {
    for (let y = 0; y < h; y++) set(ax, y);
    for (let d = -1; d <= 1; d++) for (let r = 0; r < 3; r++) { set(ax + d, r); set(ax + d, h - 1 - r); }
  }
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { set(8 + j, 1 + i); set(w - 8 + j, h - 6 + i); } // format information
  for (let i = 1; i <= 3; i++) { set(11, i); set(w - 6 + i, h - 6); }
  return { kind: "rmqr", version, width: w, height: h, fn, total: RMQR_TOTAL[version - 1]!, skipColumn: -1, firstColumn: w - 2 };
}

export function layoutOf(kind: Kind, version: number): Layout {
  return kind === "qr" ? qrLayout(version) : kind === "micro" ? microLayout(version) : rmqrLayout(version);
}

/** The data modules in placement order: two-column strips from the right, zig-zag up and down, function modules skipped. */
export function placementOrder(layout: Layout): Point[] {
  const out: Point[] = [];
  let up = true;
  for (let x = layout.firstColumn; x > 0; x -= 2) {
    if (x === layout.skipColumn) x--;
    for (let r = 0; r < layout.height; r++) {
      const y = up ? layout.height - 1 - r : r;
      for (let c = 0; c < 2; c++) { const xx = x - c; if (!layout.fn.get(xx, y)) out.push([xx, y]); }
    }
    up = !up;
  }
  return out;
}

export interface BlockStructure {
  total: number;
  data: number;
  blocks: number;
  ecPerBlock: number;
  /** Data codewords per block; the longer blocks come last. */
  sizes: number[];
}

export function blockStructure(kind: Kind, version: number, level: Level): BlockStructure {
  let total: number, data: number, blocks: number;
  if (kind === "qr") {
    total = qrTotalCodewords(version);
    blocks = QR_BLOCKS[level][version - 1]!;
    data = total - QR_EC_PER_BLOCK[level][version - 1]! * blocks;
  } else if (kind === "micro") {
    const s = MICRO_SYMBOLS.find((e) => e.version === version && e.level === level)!;
    total = s.total; data = s.data; blocks = 1;
  } else {
    const l = level === "H" ? "H" : "M";
    total = RMQR_TOTAL[version - 1]!; data = RMQR_DATA[l][version - 1]!; blocks = RMQR_BLOCKS[l][version - 1]!;
  }
  const ecPerBlock = (total - data) / blocks, short = Math.floor(data / blocks), longs = data % blocks;
  return { total, data, blocks, ecPerBlock, sizes: Array.from({ length: blocks }, (_, b) => short + (b >= blocks - longs ? 1 : 0)) };
}

/** The transmission order: data codewords column by column over the blocks, then the check codewords the same way. */
export function interleave(blocks: readonly { data: readonly number[]; ec: readonly number[] }[]): number[] {
  const out: number[] = [], maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]!);
  const ec = blocks[0]!.ec.length;
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ec[i]!);
  return out;
}

/** For each block, the indices (into the transmission order) of its data and check codewords. */
export function deinterleave(structure: BlockStructure): { n: number; data: number[]; ec: number[] }[] {
  const blocks = structure.sizes.map((n) => ({ n, data: [] as number[], ec: [] as number[] }));
  let k = 0;
  const maxData = Math.max(...structure.sizes);
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.n) b.data.push(k++);
  for (let i = 0; i < structure.ecPerBlock; i++) for (const b of blocks) b.ec.push(k++);
  return blocks;
}

/** QR format information, bits 14…0: around the top-left finder, and split between the other two. */
export function qrFormatPositions(size: number): [Point[], Point[]] {
  const one: Point[] = [], two: Point[] = [];
  for (let x = 0; x < 6; x++) one.push([x, 8]);
  one.push([7, 8], [8, 8], [8, 7]);
  for (let y = 5; y >= 0; y--) one.push([8, y]);
  for (let y = size - 1; y >= size - 7; y--) two.push([8, y]);
  for (let x = size - 8; x < size; x++) two.push([x, 8]);
  return [one, two];
}
/** QR version information (versions 7+), bits 17…0, two copies. */
export function qrVersionPositions(size: number): [Point[], Point[]] {
  const one: Point[] = [], two: Point[] = [];
  for (let j = 5; j >= 0; j--) for (let i = 2; i >= 0; i--) { one.push([size - 11 + i, j]); two.push([j, size - 11 + i]); }
  return [one, two];
}
/** Micro QR format information, bits 14…0: row 8 columns 1…8, then column 8 rows 7…1. */
export function microFormatPositions(): Point[] {
  const out: Point[] = [];
  for (let x = 1; x <= 8; x++) out.push([x, 8]);
  for (let y = 7; y >= 1; y--) out.push([8, y]);
  return out;
}
/** rMQR format information, bits 0…17 (least significant first): by the finder, and by the finder sub-pattern. */
export function rmqrFormatPositions(w: number, h: number): [Point[], Point[]] {
  const left: Point[] = [], right: Point[] = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) { left[j * 5 + i] = [8 + j, 1 + i]; right[j * 5 + i] = [w - 8 + j, h - 6 + i]; }
  for (let i = 1; i <= 3; i++) { left[14 + i] = [11, i]; right[14 + i] = [w - 6 + i, h - 6]; }
  return [left, right];
}
