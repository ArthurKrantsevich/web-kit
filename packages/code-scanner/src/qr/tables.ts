import { bchEncode } from "../core/bch";

export type Level = "L" | "M" | "Q" | "H";

/** ISO/IEC 18004 Table 9: error-correction codewords per block, versions 1…40. */
export const QR_EC_PER_BLOCK: Readonly<Record<Level, readonly number[]>> = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
/** ISO/IEC 18004 Table 9: number of error-correction blocks. */
export const QR_BLOCKS: Readonly<Record<Level, readonly number[]>> = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};
/** Format information: L 01, M 00, Q 11, H 10. */
export const QR_LEVEL_BITS: Readonly<Record<Level, number>> = { L: 1, M: 0, Q: 3, H: 2 };
export const QR_LEVEL_FROM_BITS: readonly Level[] = ["M", "L", "H", "Q"];

/** Modules available for data and error correction (ISO/IEC 18004 Table 1, as a formula). */
export function qrRawModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const n = Math.floor(version / 7) + 2;
    result -= (25 * n - 10) * n - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}
export function qrTotalCodewords(version: number): number {
  return qrRawModules(version) >> 3;
}
/** Alignment pattern centre coordinates (ISO/IEC 18004 Annex E), as a formula checked against the table in tests. */
export function qrAlignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2, size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.floor((version * 4 + n * 2 + 1) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7, i = 0; i < n - 1; i++, pos -= step) out.splice(1, 0, pos);
  return out;
}

export type MaskFn = (x: number, y: number) => boolean;
/** The eight data mask patterns (ISO/IEC 18004 Table 10; x = column, y = row). */
export const QR_MASKS: readonly MaskFn[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
/** Micro QR's four masks (indicator 00…11) are QR masks 1, 4, 6 and 7. */
export const MICRO_MASKS: readonly MaskFn[] = [QR_MASKS[1]!, QR_MASKS[4]!, QR_MASKS[6]!, QR_MASKS[7]!];
/** rMQR's single mask: (⌊y/2⌋ + ⌊x/3⌋) mod 2 = 0. */
export const RMQR_MASK: MaskFn = QR_MASKS[4]!;

export interface MicroSymbol {
  version: number;
  level: Level;
  total: number;
  data: number;
}
/** Micro QR symbols by their symbol number (the format information's top three data bits). M1 has detection only. */
export const MICRO_SYMBOLS: readonly MicroSymbol[] = [
  { version: 1, level: "L", total: 5, data: 3 },
  { version: 2, level: "L", total: 10, data: 5 }, { version: 2, level: "M", total: 10, data: 4 },
  { version: 3, level: "L", total: 17, data: 11 }, { version: 3, level: "M", total: 17, data: 9 },
  { version: 4, level: "L", total: 24, data: 16 }, { version: 4, level: "M", total: 24, data: 14 }, { version: 4, level: "Q", total: 24, data: 10 },
];

/** rMQR versions 1…32 (ISO/IEC 23941): R7, R9, R11, R13, R15, R17 by widths 27, 43, 59, 77, 99, 139 where they exist. */
export const RMQR_HEIGHTS: readonly number[] = [7, 7, 7, 7, 7, 9, 9, 9, 9, 9, 11, 11, 11, 11, 11, 11, 13, 13, 13, 13, 13, 13, 15, 15, 15, 15, 15, 17, 17, 17, 17, 17];
export const RMQR_WIDTHS: readonly number[] = [43, 59, 77, 99, 139, 43, 59, 77, 99, 139, 27, 43, 59, 77, 99, 139, 27, 43, 59, 77, 99, 139, 43, 59, 77, 99, 139, 43, 59, 77, 99, 139];
export const RMQR_TOTAL: readonly number[] = [13, 21, 32, 44, 68, 21, 33, 49, 66, 99, 15, 31, 47, 67, 89, 132, 21, 41, 60, 85, 113, 166, 51, 74, 103, 136, 199, 61, 88, 122, 160, 232];
export const RMQR_DATA: Readonly<Record<"M" | "H", readonly number[]>> = {
  M: [6, 12, 20, 28, 44, 12, 21, 31, 42, 63, 7, 19, 31, 43, 57, 84, 12, 27, 38, 53, 73, 106, 33, 48, 67, 88, 127, 39, 56, 78, 100, 152],
  H: [3, 7, 10, 14, 24, 7, 11, 17, 22, 33, 5, 11, 15, 23, 29, 42, 7, 13, 20, 29, 35, 54, 15, 26, 31, 48, 69, 21, 28, 38, 56, 76],
};
export const RMQR_BLOCKS: Readonly<Record<"M" | "H", readonly number[]>> = {
  M: [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 3, 1, 1, 2, 2, 3, 1, 2, 2, 3, 4],
  H: [1, 1, 1, 1, 2, 1, 1, 2, 2, 3, 1, 1, 2, 2, 2, 3, 1, 1, 2, 2, 3, 4, 2, 2, 3, 4, 5, 2, 2, 3, 4, 6],
};
export type DataMode = "numeric" | "alphanumeric" | "byte" | "kanji";
/** rMQR character-count indicator lengths per version. */
export const RMQR_CCI: Readonly<Record<DataMode, readonly number[]>> = {
  numeric: [4, 5, 6, 7, 7, 5, 6, 7, 7, 8, 4, 6, 7, 7, 8, 8, 5, 6, 7, 7, 8, 8, 7, 7, 8, 8, 9, 7, 8, 8, 8, 9],
  alphanumeric: [3, 5, 5, 6, 6, 5, 5, 6, 6, 7, 4, 5, 6, 6, 7, 7, 5, 6, 6, 7, 7, 8, 6, 7, 7, 7, 8, 6, 7, 7, 8, 8],
  byte: [3, 4, 5, 5, 6, 4, 5, 5, 6, 6, 3, 5, 5, 6, 6, 7, 4, 5, 6, 6, 7, 7, 6, 6, 7, 7, 7, 6, 6, 7, 7, 8],
  kanji: [2, 3, 4, 5, 5, 3, 4, 5, 5, 6, 2, 4, 5, 5, 6, 6, 3, 5, 5, 6, 6, 7, 5, 5, 6, 6, 7, 5, 6, 6, 6, 7],
};
/** rMQR alignment (vertical timing) columns by width. */
export const RMQR_ALIGN_COLUMNS: Readonly<Record<number, readonly number[]>> = { 27: [], 43: [21], 59: [19, 39], 77: [25, 51], 99: [23, 49, 75], 139: [27, 55, 83, 111] };

export const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export const qrFormatBits = (level: Level, mask: number): number => bchEncode((QR_LEVEL_BITS[level] << 3) | mask, 5, 15, 0x537) ^ 0x5412;
export const qrVersionBits = (version: number): number => bchEncode(version, 6, 18, 0x1f25);
export const microFormatBits = (symbolNumber: number, mask: number): number => bchEncode((symbolNumber << 2) | mask, 5, 15, 0x537) ^ 0x4445;
export const rmqrFormatBits = (level: "M" | "H", version: number, side: "left" | "right"): number =>
  bchEncode(((level === "H" ? 1 : 0) << 5) | (version - 1), 6, 18, 0x1f25) ^ (side === "left" ? 0x1fab2 : 0x20a7b);
