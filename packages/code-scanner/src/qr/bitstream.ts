import { charsetOf, decodeBytes, ECI_CHARSETS } from "../core/text";
import type { Segment, StructuredAppend } from "../core/types";
import type { Kind } from "./layout";
import { ALPHANUMERIC, RMQR_CCI, type DataMode } from "./tables";

export type Mode = DataMode | "eci" | "fnc1-first" | "fnc1-second" | "structured-append" | "terminator";

/** Character-count indicator length; 0 when the mode does not exist in that symbol. */
export function countBits(kind: Kind, version: number, mode: DataMode): number {
  if (kind === "qr") {
    const g = version <= 9 ? 0 : version <= 26 ? 1 : 2;
    return { numeric: [10, 12, 14], alphanumeric: [9, 11, 13], byte: [8, 16, 16], kanji: [8, 10, 12] }[mode][g]!;
  }
  if (kind === "micro") return { numeric: [3, 4, 5, 6], alphanumeric: [0, 3, 4, 5], byte: [0, 0, 4, 5], kanji: [0, 0, 3, 4] }[mode][version - 1]!;
  return RMQR_CCI[mode][version - 1]!;
}
export function modeBits(kind: Kind, version: number): number {
  return kind === "qr" ? 4 : kind === "micro" ? version - 1 : 3;
}
const QR_MODES: Readonly<Record<number, Mode>> = { 1: "numeric", 2: "alphanumeric", 4: "byte", 8: "kanji", 7: "eci", 5: "fnc1-first", 9: "fnc1-second", 3: "structured-append", 0: "terminator" };
const MICRO_MODES: readonly Mode[] = ["numeric", "alphanumeric", "byte", "kanji"];
const RMQR_MODES: readonly Mode[] = ["terminator", "numeric", "alphanumeric", "byte", "kanji", "fnc1-first", "fnc1-second", "eci"];
export function modeOf(kind: Kind, version: number, value: number): Mode | null {
  if (kind === "qr") return QR_MODES[value] ?? null;
  if (kind === "micro") return version === 1 ? "numeric" : MICRO_MODES[value] ?? null;
  return RMQR_MODES[value] ?? null;
}
/** The terminator: 4 zero bits (QR), 3 (rMQR), 3 + 2·(version − 1) (Micro QR). */
export const terminatorBits = (kind: Kind, version: number): number => (kind === "qr" ? 4 : kind === "micro" ? 1 + 2 * version : 3);

class BitReader {
  private pos = 0;
  constructor(private readonly bits: Uint8Array) {}
  get available(): number { return this.bits.length - this.pos; }
  read(count: number): number { let v = 0; for (let i = 0; i < count; i++) v = (v << 1) | this.bits[this.pos++]!; return v; }
  peek(count: number): number { let v = 0; for (let i = 0; i < count; i++) v = (v << 1) | (this.bits[this.pos + i] ?? 0); return v; }
}

export interface Parsed {
  segments: Segment[];
  eci: number | null;
  gs1: boolean;
  fnc1Second: number | null;
  structuredAppend: StructuredAppend | null;
  bytes: Uint8Array;
  text: string;
  charset: string;
}

/**
 * Parses `dataBits` bits of the data codewords into segments. Null when the stream is malformed: an unknown mode, a
 * segment past the end, an impossible digit group or alphanumeric value. A terminator is a run of zero bits of the
 * terminator's length, or whatever zero bits are left; what follows it is not checked (decision 4).
 */
export function parseBitStream(kind: Kind, version: number, dataCodewords: Uint8Array, dataBits: number): Parsed | null {
  const bits = new Uint8Array(dataBits);
  for (let i = 0; i < dataBits; i++) bits[i] = (dataCodewords[i >> 3]! >> (7 - (i & 7))) & 1;
  const r = new BitReader(bits), segments: Segment[] = [], mb = modeBits(kind, version);
  let eci: number | null = null, gs1 = false, structuredAppend: StructuredAppend | null = null, fnc1Second: number | null = null;
  while (r.available >= mb) {
    const tb = Math.min(terminatorBits(kind, version), r.available);
    if (r.peek(tb) === 0) break;
    const mode = kind === "micro" && version === 1 ? "numeric" : modeOf(kind, version, r.read(mb));
    if (mode === null || mode === "terminator") return null;
    if (mode === "eci") {
      if (r.available < 8) return null;
      const first = r.read(8);
      if (first < 0x80) eci = first;
      else if ((first & 0xc0) === 0x80) { if (r.available < 8) return null; eci = ((first & 0x3f) << 8) | r.read(8); }
      else if ((first & 0xe0) === 0xc0) { if (r.available < 16) return null; eci = ((first & 0x1f) << 16) | r.read(16); }
      else return null;
      continue;
    }
    if (mode === "fnc1-first") { gs1 = true; continue; }
    if (mode === "fnc1-second") { if (r.available < 8) return null; fnc1Second = r.read(8); continue; }
    if (mode === "structured-append") {
      if (r.available < 16) return null;
      structuredAppend = { index: r.read(4), total: r.read(4) + 1, parity: r.read(8) };
      continue;
    }
    const cb = countBits(kind, version, mode);
    if (cb === 0 || r.available < cb) return null;
    const count = r.read(cb), out: number[] = [];
    if (mode === "numeric") {
      let left = count;
      while (left >= 3) { if (r.available < 10) return null; const v = r.read(10); if (v >= 1000) return null; out.push(48 + Math.floor(v / 100), 48 + (Math.floor(v / 10) % 10), 48 + (v % 10)); left -= 3; }
      if (left === 2) { if (r.available < 7) return null; const v = r.read(7); if (v >= 100) return null; out.push(48 + Math.floor(v / 10), 48 + (v % 10)); }
      else if (left === 1) { if (r.available < 4) return null; const v = r.read(4); if (v >= 10) return null; out.push(48 + v); }
    } else if (mode === "alphanumeric") {
      let left = count;
      const put = (v: number): boolean => { if (v >= 45) return false; out.push(ALPHANUMERIC.charCodeAt(v)); return true; };
      while (left >= 2) { if (r.available < 11) return null; const v = r.read(11); if (!put(Math.floor(v / 45)) || !put(v % 45)) return null; left -= 2; }
      if (left === 1) { if (r.available < 6 || !put(r.read(6))) return null; }
    } else if (mode === "byte") {
      if (r.available < 8 * count) return null;
      for (let i = 0; i < count; i++) out.push(r.read(8));
    } else {
      if (r.available < 13 * count) return null;
      for (let i = 0; i < count; i++) {
        const v = r.read(13);
        let c = (Math.floor(v / 0xc0) << 8) | (v % 0xc0);
        c += c < 0x1f00 ? 0x8140 : 0xc140;
        out.push(c >> 8, c & 0xff);
      }
    }
    segments.push({ mode, bytes: Uint8Array.from(out), eci });
  }
  if (segments.length === 0 && !gs1 && fnc1Second === null) return null;
  const assembled = assembleText(segments, gs1);
  // FNC1 in the second position: the application indicator (two digits, or a letter as its code + 100) leads the text
  if (fnc1Second !== null) assembled.text = (fnc1Second < 100 ? String(fnc1Second).padStart(2, "0") : String.fromCharCode(fnc1Second - 100)) + assembled.text;
  return { segments, eci, gs1, fnc1Second, structuredAppend, ...assembled };
}

/**
 * Text and raw bytes of the segments: numeric and alphanumeric are ASCII (with GS1's % → GS, %% → % when `gs1`), Kanji
 * is Shift JIS, a byte segment follows its ECI or, without one, the charset of all ECI-less byte segments together.
 */
export function assembleText(segments: readonly Segment[], gs1: boolean): { bytes: Uint8Array; text: string; charset: string } {
  const all: number[] = [];
  for (const s of segments) all.push(...s.bytes);
  const plain: number[] = [];
  for (const s of segments) if (s.mode === "byte" && s.eci === null) plain.push(...s.bytes);
  const fallback = plain.length > 0 ? charsetOf(Uint8Array.from(plain)) : "us-ascii";
  let text = "", charset = "iso-8859-1";
  for (const s of segments) {
    if (s.mode === "kanji") { text += decodeBytes(s.bytes, "shift_jis") ?? ""; charset = "shift_jis"; continue; }
    if (s.mode === "byte") {
      const label = s.eci === null ? fallback : (ECI_CHARSETS[s.eci] ?? "iso-8859-1");
      text += decodeBytes(s.bytes, label) ?? decodeBytes(s.bytes, "iso-8859-1") ?? "";
      if (label !== "us-ascii") charset = label;
      continue;
    }
    let t = String.fromCharCode(...s.bytes);
    if (gs1 && s.mode === "alphanumeric") t = t.replace(/%%|%/g, (m) => (m === "%%" ? "%" : "\u001d"));
    text += t;
  }
  return { bytes: Uint8Array.from(all), text, charset };
}
