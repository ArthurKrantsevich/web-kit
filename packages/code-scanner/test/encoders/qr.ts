// Test encoders for QR, Micro QR and rMQR: byte-identical to zxing-cpp's writer for the same content and mask. Not
// shipped (spec §12: the generator is another tool); the future qr-generator will start from this file.
import { gf256Qr, rsEncode } from "../../src/core/gf";
import { countBits, modeBits, terminatorBits } from "../../src/qr/bitstream";
import { BitMatrix, blockStructure, interleave, layoutOf, microFormatPositions, placementOrder, qrFormatPositions, qrVersionPositions, rmqrFormatPositions, type Kind, type Layout } from "../../src/qr/layout";
import { ALPHANUMERIC, MICRO_MASKS, MICRO_SYMBOLS, microFormatBits, QR_MASKS, qrAlignmentPositions, qrFormatBits, qrVersionBits, RMQR_ALIGN_COLUMNS, RMQR_MASK, rmqrFormatBits, type Level, type MaskFn } from "../../src/qr/tables";
import { BitWriter } from "./bits";

export type EncodeSegment =
  | { mode: "numeric" | "alphanumeric"; text: string }
  | { mode: "byte" | "kanji"; bytes: Uint8Array }
  | { mode: "eci"; eci: number }
  | { mode: "fnc1-first" }
  | { mode: "fnc1-second"; indicator: number }
  | { mode: "structured-append"; index: number; total: number; parity: number };

const MODE_VALUE: Readonly<Record<Kind, Readonly<Record<string, number>>>> = {
  qr: { numeric: 1, alphanumeric: 2, byte: 4, kanji: 8, eci: 7, "fnc1-first": 5, "fnc1-second": 9, "structured-append": 3 },
  micro: { numeric: 0, alphanumeric: 1, byte: 2, kanji: 3 },
  rmqr: { numeric: 1, alphanumeric: 2, byte: 3, kanji: 4, "fnc1-first": 5, "fnc1-second": 6, eci: 7 },
};

let sjis: Map<string, number> | null = null;
/** Shift JIS bytes of a text, from TextDecoder run backwards over the double-byte range; null when a character has none. */
export function toShiftJis(text: string): Uint8Array | null {
  if (sjis === null) {
    sjis = new Map();
    const decoder = new TextDecoder("shift_jis");
    for (let hi = 0x81; hi <= 0xea; hi++) {
      if (hi > 0x9f && hi < 0xe0) continue;
      for (let lo = 0x40; lo <= 0xfc; lo++) {
        if (lo === 0x7f) continue;
        const s = decoder.decode(Uint8Array.from([hi, lo]));
        if (s.length === 1 && s !== "�" && !sjis.has(s)) sjis.set(s, (hi << 8) | lo);
      }
    }
  }
  const out: number[] = [];
  for (const ch of text) {
    const v = sjis.get(ch);
    if (v === undefined) return null;
    out.push(v >> 8, v & 0xff);
  }
  return Uint8Array.from(out);
}
const isKanjiRange = (b: Uint8Array): boolean => {
  for (let i = 0; i < b.length; i += 2) { const c = (b[i]! << 8) | b[i + 1]!; if (!((c >= 0x8140 && c <= 0x9ffc) || (c >= 0xe040 && c <= 0xebbf))) return false; }
  return true;
};

/** One segment in the densest mode that holds the whole text. */
export function segmentsFor(text: string): EncodeSegment[] {
  if (/^[0-9]+$/.test(text)) return [{ mode: "numeric", text }];
  if ([...text].every((c) => ALPHANUMERIC.includes(c))) return [{ mode: "alphanumeric", text }];
  const kanji = toShiftJis(text);
  if (kanji && kanji.length === [...text].length * 2 && isKanjiRange(kanji)) return [{ mode: "kanji", bytes: kanji }];
  return [{ mode: "byte", bytes: new TextEncoder().encode(text) }];
}

function writeSegment(w: BitWriter, kind: Kind, version: number, seg: EncodeSegment): boolean {
  if (!(kind === "micro" && version === 1)) {
    const value = MODE_VALUE[kind][seg.mode];
    if (value === undefined) return false;
    w.put(value, modeBits(kind, version));
  } else if (seg.mode !== "numeric") return false;
  switch (seg.mode) {
    case "eci":
      if (seg.eci < 128) w.put(seg.eci, 8); else if (seg.eci < 16384) w.put(0x8000 | seg.eci, 16); else w.put(0xc00000 | seg.eci, 24);
      return true;
    case "fnc1-first": return true;
    case "fnc1-second": w.put(seg.indicator, 8); return true;
    case "structured-append": w.put(seg.index, 4); w.put(seg.total - 1, 4); w.put(seg.parity, 8); return true;
    case "numeric": {
      const cb = countBits(kind, version, "numeric");
      if (cb === 0 || seg.text.length >= 1 << cb) return false;
      w.put(seg.text.length, cb);
      for (let i = 0; i < seg.text.length; i += 3) { const part = seg.text.slice(i, i + 3); w.put(Number(part), [0, 4, 7, 10][part.length]!); }
      return true;
    }
    case "alphanumeric": {
      const cb = countBits(kind, version, "alphanumeric");
      if (cb === 0 || seg.text.length >= 1 << cb) return false;
      w.put(seg.text.length, cb);
      for (let i = 0; i < seg.text.length; i += 2) {
        const a = ALPHANUMERIC.indexOf(seg.text[i]!);
        if (i + 1 < seg.text.length) w.put(a * 45 + ALPHANUMERIC.indexOf(seg.text[i + 1]!), 11); else w.put(a, 6);
      }
      return true;
    }
    case "byte": {
      const cb = countBits(kind, version, "byte");
      if (cb === 0 || seg.bytes.length >= 1 << cb) return false;
      w.put(seg.bytes.length, cb);
      for (const b of seg.bytes) w.put(b, 8);
      return true;
    }
    case "kanji": {
      const cb = countBits(kind, version, "kanji"), n = seg.bytes.length / 2;
      if (cb === 0 || n >= 1 << cb) return false;
      w.put(n, cb);
      for (let i = 0; i < seg.bytes.length; i += 2) {
        let c = (seg.bytes[i]! << 8) | seg.bytes[i + 1]!;
        c -= c < 0xa000 ? 0x8140 : 0xc140;
        w.put((c >> 8) * 0xc0 + (c & 0xff), 13);
      }
      return true;
    }
  }
}

/** The data codewords (terminator, zero fill, EC 11 padding), or null when the segments do not fit. */
export function encodeData(kind: Kind, version: number, level: Level, segments: readonly EncodeSegment[]): Uint8Array | null {
  const s = blockStructure(kind, version, level), capacity = s.data * 8 - (kind === "micro" && version % 2 === 1 ? 4 : 0);
  const w = new BitWriter();
  for (const seg of segments) if (!writeSegment(w, kind, version, seg)) return null;
  if (w.length > capacity) return null;
  w.put(0, Math.min(terminatorBits(kind, version), capacity - w.length));
  if (w.length % 8 !== 0 && w.length < capacity) w.put(0, Math.min(8 - (w.length % 8), capacity - w.length));
  let k = 0;
  while (w.length + 8 <= capacity) w.put(k++ % 2 === 0 ? 0xec : 0x11, 8);
  while (w.length < capacity) w.put(0, 1);
  return w.toBytes(capacity);
}

/** The smallest version of a kind and level that holds the segments, or null. */
export function smallestVersion(kind: Kind, level: Level, segments: readonly EncodeSegment[]): number | null {
  const versions = kind === "qr" ? 40 : kind === "micro" ? 4 : 32;
  for (let v = 1; v <= versions; v++) {
    if (kind === "micro" && !MICRO_SYMBOLS.some((m) => m.version === v && m.level === level)) continue;
    if (encodeData(kind, v, level, segments) !== null) return v;
  }
  return null;
}

export interface Encoded {
  matrix: BitMatrix;
  mask: number;
  kind: Kind;
  version: number;
  level: Level;
}

function drawFunctionPatterns(kind: Kind, version: number, layout: Layout, m: BitMatrix): void {
  const finder = (x0: number, y0: number): void => {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const xx = x0 + x, yy = y0 + y;
      if (xx < 0 || yy < 0 || xx >= m.width || yy >= m.height) continue;
      const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      m.set(xx, yy, d !== 2 && d !== 4);
    }
  };
  if (kind === "qr") {
    const size = m.width;
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    for (let i = 8; i < size - 8; i++) { m.set(i, 6, i % 2 === 0); m.set(6, i, i % 2 === 0); }
    const positions = qrAlignmentPositions(version);
    for (const cy of positions) for (const cx of positions) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    m.set(8, size - 8, true); // the dark module
  } else if (kind === "micro") {
    finder(0, 0);
    for (let i = 8; i < m.width; i++) { m.set(i, 0, i % 2 === 0); m.set(0, i, i % 2 === 0); }
  } else {
    const w = m.width, h = m.height;
    for (let x = 0; x < w; x++) { m.set(x, 0, x % 2 === 0); m.set(x, h - 1, x % 2 === 0); }
    for (let y = 0; y < h; y++) { m.set(0, y, y % 2 === 0); m.set(w - 1, y, y % 2 === 0); }
    // corner finder patterns first: in R9 the separator row (7) crosses the bottom-left one, and the separator wins
    m.set(w - 2, 0, true); m.set(w - 1, 0, true); m.set(w - 1, 1, true); m.set(w - 2, 1, false);
    m.set(0, h - 2, true); m.set(0, h - 1, true); m.set(1, h - 1, true); m.set(1, h - 2, false);
    finder(0, 0);
    for (let y = h - 5; y < h; y++) for (let x = w - 5; x < w; x++) m.set(x, y, Math.max(Math.abs(x - (w - 3)), Math.abs(y - (h - 3))) !== 1);
    for (const ax of RMQR_ALIGN_COLUMNS[w]!) {
      for (let y = 0; y < h; y++) m.set(ax, y, y % 2 === 0);
      for (let d = -1; d <= 1; d++) for (let r = 0; r < 3; r++) { const dark = !(d === 0 && r === 1); m.set(ax + d, r, dark); m.set(ax + d, h - 1 - r, dark); }
    }
  }
  void layout;
}

function drawFormat(kind: Kind, version: number, level: Level, mask: number, m: BitMatrix): void {
  if (kind === "qr") {
    const bits = qrFormatBits(level, mask);
    for (const copy of qrFormatPositions(m.width)) copy.forEach(([x, y], i) => m.set(x, y, ((bits >> (14 - i)) & 1) === 1));
    if (version >= 7) { const vb = qrVersionBits(version); for (const copy of qrVersionPositions(m.width)) copy.forEach(([x, y], i) => m.set(x, y, ((vb >> (17 - i)) & 1) === 1)); }
  } else if (kind === "micro") {
    const bits = microFormatBits(MICRO_SYMBOLS.findIndex((s) => s.version === version && s.level === level), mask);
    microFormatPositions().forEach(([x, y], i) => m.set(x, y, ((bits >> (14 - i)) & 1) === 1));
  } else {
    const [left, right] = rmqrFormatPositions(m.width, m.height), lb = rmqrFormatBits(level === "H" ? "H" : "M", version, "left"), rb = rmqrFormatBits(level === "H" ? "H" : "M", version, "right");
    left.forEach(([x, y], i) => m.set(x, y, ((lb >> i) & 1) === 1));
    right.forEach(([x, y], i) => m.set(x, y, ((rb >> i) & 1) === 1));
  }
}

/** ISO/IEC 18004 §7.8.3 mask penalty: N1 = 3, N2 = 3, N3 = 40, N4 = 10. */
export function penalty(m: BitMatrix): number {
  const s = m.width;
  let score = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < s; a++) {
      let run = 0, last: boolean | null = null;
      for (let b = 0; b < s; b++) {
        const v = pass === 0 ? m.get(b, a) : m.get(a, b);
        if (v === last) run++; else { if (run >= 5) score += run - 2; run = 1; last = v; }
      }
      if (run >= 5) score += run - 2;
    }
  }
  for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) { const v = m.get(x, y); if (v === m.get(x + 1, y) && v === m.get(x, y + 1) && v === m.get(x + 1, y + 1)) score += 3; }
  const pattern = [true, false, true, true, true, false, true];
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < s; a++) {
      for (let b = 0; b + 7 <= s; b++) {
        let ok = true;
        for (let k = 0; k < 7 && ok; k++) ok = (pass === 0 ? m.get(b + k, a) : m.get(a, b + k)) === pattern[k];
        if (!ok) continue;
        const light = (from: number): boolean => { for (let k = 0; k < 4; k++) { const i = from + k; if (i < 0 || i >= s || (pass === 0 ? m.get(i, a) : m.get(a, i))) return false; } return true; };
        if (light(b - 4) || light(b + 7)) score += 40;
      }
    }
  }
  let dark = 0;
  for (let i = 0; i < m.bits.length; i++) dark += m.bits[i]!;
  score += Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s)) * 10;
  return score;
}

/** A complete symbol; the mask by the lowest penalty when not given (rMQR has one). Null when the data does not fit. */
export function encodeSymbol(kind: Kind, version: number, level: Level, segments: readonly EncodeSegment[], mask: number | null = null): Encoded | null {
  const data = encodeData(kind, version, level, segments);
  if (data === null) return null;
  const s = blockStructure(kind, version, level), blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;
  for (const n of s.sizes) { const d = [...data.subarray(offset, offset + n)]; offset += n; blocks.push({ data: d, ec: rsEncode(gf256Qr(), d, s.ecPerBlock).slice(n) }); }
  const stream = interleave(blocks), layout = layoutOf(kind, version), order = placementOrder(layout);
  const base = new BitMatrix(layout.width, layout.height);
  drawFunctionPatterns(kind, version, layout, base);
  const bits: number[] = [];
  for (const cw of stream) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  // M1 and M3: the 4-bit final data codeword contributes its top nibble only
  if (kind === "micro" && version % 2 === 1) bits.splice((s.data - 1) * 8 + 4, 4);
  const masks: readonly MaskFn[] = kind === "qr" ? QR_MASKS : kind === "micro" ? MICRO_MASKS : [RMQR_MASK];
  const candidates = mask === null ? masks.map((_, i) => i) : [mask];
  let best: Encoded | null = null, bestScore = Infinity;
  for (const mi of candidates) {
    const m = new BitMatrix(layout.width, layout.height, base.bits.slice());
    order.forEach(([x, y], i) => m.set(x, y, ((bits[i] ?? 0) ^ (masks[mi]!(x, y) ? 1 : 0)) === 1));
    drawFormat(kind, version, level, mi, m);
    const score = candidates.length === 1 ? 0 : penalty(m);
    if (score < bestScore) { bestScore = score; best = { matrix: m, mask: mi, kind, version, level }; }
  }
  return best;
}
