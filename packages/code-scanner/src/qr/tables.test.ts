// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rgbaFromMatrix, zxing } from "../../test/zxing";
import { bchDecode } from "../core/bch";
import { gf256Qr } from "../core/gf";
import { rsDecode } from "../core/rs";
import type { Point } from "../core/types";
import { type BitMatrix, blockStructure, deinterleave, interleave, layoutOf, microFormatPositions, placementOrder, qrFormatPositions, qrLayout, qrVersionPositions, rmqrFormatPositions, rmqrLayout, type Kind } from "./layout";
import { MICRO_MASKS, MICRO_SYMBOLS, microFormatBits, QR_BLOCKS, QR_EC_PER_BLOCK, qrAlignmentPositions, qrFormatBits, qrTotalCodewords, qrVersionBits, RMQR_ALIGN_COLUMNS, RMQR_BLOCKS, RMQR_DATA, RMQR_HEIGHTS, RMQR_MASK, RMQR_TOTAL, RMQR_WIDTHS, rmqrFormatBits, type Level, type MaskFn } from "./tables";

/** The bits at `points` as a number, the first point the most significant bit unless `lsbFirst`. */
const readBits = (m: BitMatrix, points: Point[], lsbFirst = false): number => {
  let v = 0;
  const order = lsbFirst ? [...points].reverse() : points;
  for (const [x, y] of order) v = (v << 1) | (m.get(x, y) ? 1 : 0);
  return v;
};
/** The symbol's codewords: bits along the placement order, unmasked, eight to a codeword. */
const codewordsOf = (m: BitMatrix, kind: Kind, version: number, mask: MaskFn, total: number): number[] => {
  const out: number[] = [];
  let acc = 0, n = 0;
  for (const [x, y] of placementOrder(layoutOf(kind, version))) {
    acc = (acc << 1) | ((m.get(x, y) ? 1 : 0) ^ (mask(x, y) ? 1 : 0));
    if (++n === 8) { out.push(acc); acc = 0; n = 0; if (out.length === total) break; }
  }
  return out;
};

/** ISO/IEC 18004 Annex E, versions 2…40, as ZXing writes it out. */
const ALIGNMENT_TABLE = [
  [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62],
  [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
  [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
];

describe("QR tables", () => {
  it("places alignment patterns as ISO/IEC 18004 Annex E", () => {
    expect(qrAlignmentPositions(1)).toEqual([]);
    for (let v = 2; v <= 40; v++) expect([v, qrAlignmentPositions(v)]).toEqual([v, ALIGNMENT_TABLE[v - 2]]);
  });

  it("has consistent codeword counts: data = total − ec·blocks, all positive, 1-M 16 + 10, 40-L 2956 + 750", () => {
    for (let v = 1; v <= 40; v++) for (const level of ["L", "M", "Q", "H"] as Level[]) {
      const total = qrTotalCodewords(v), ec = QR_EC_PER_BLOCK[level][v - 1]!, blocks = QR_BLOCKS[level][v - 1]!;
      expect([v, level, total - ec * blocks > 0]).toEqual([v, level, true]);
      const s = blockStructure("qr", v, level);
      expect(s.sizes.reduce((a, b) => a + b, 0)).toBe(s.data);
    }
    expect(blockStructure("qr", 1, "M")).toEqual({ total: 26, data: 16, blocks: 1, ecPerBlock: 10, sizes: [16] });
    expect(blockStructure("qr", 40, "L")).toEqual({ total: 3706, data: 2956, blocks: 25, ecPerBlock: 30, sizes: [...Array(19).fill(118), ...Array(6).fill(119)] });
    expect(blockStructure("qr", 5, "Q")).toEqual({ total: 134, data: 62, blocks: 4, ecPerBlock: 18, sizes: [15, 15, 16, 16] });
  });

  it("places exactly total·8 + remainder data modules in every layout, the remainder under 8", () => {
    const check = (kind: Kind, version: number) => {
      const layout = layoutOf(kind, version), modules = placementOrder(layout).length;
      // M1 and M3 end their data with a 4-bit codeword (ISO/IEC 18004 Table 2): 36 and 132 modules, not 40 and 136
      const bits = layout.total * 8 - (kind === "micro" && version % 2 === 1 ? 4 : 0);
      expect([kind, version, modules - bits >= 0, modules - bits < 8]).toEqual([kind, version, true, true]);
    };
    for (let v = 1; v <= 40; v++) check("qr", v);
    for (let v = 1; v <= 4; v++) check("micro", v);
    for (let v = 1; v <= 32; v++) check("rmqr", v);
    // ISO: version 2 has 7 remainder bits, version 7 none
    expect(placementOrder(qrLayout(2)).length - 44 * 8).toBe(7);
    expect(placementOrder(qrLayout(7)).length - 196 * 8).toBe(0);
  });

  it("encodes format and version information with the ISO examples and masks", () => {
    expect(qrFormatBits("M", 5)).toBe(0x40ce);
    expect(qrVersionBits(7)).toBe(0b000111110010010100);
    expect(qrFormatPositions(21)[0]).toHaveLength(15);
    expect(qrFormatPositions(21)[1][0]).toEqual([8, 20]);
    expect(qrVersionPositions(45)[0][0]).toEqual([36, 5]);
    expect(microFormatPositions()[0]).toEqual([1, 8]);
    expect(rmqrFormatPositions(43, 7)[0][0]).toEqual([8, 1]);
    expect(rmqrFormatPositions(43, 7)[1][17]).toEqual([40, 1]);
  });

  it("interleaves and de-interleaves blocks the same way", () => {
    const s = blockStructure("qr", 5, "Q"); // 4 blocks: 15, 15, 16, 16 data + 18 ec
    const blocks = s.sizes.map((n, b) => ({ data: Array.from({ length: n }, (_, i) => b * 100 + i), ec: Array.from({ length: s.ecPerBlock }, (_, i) => 1000 + b * 100 + i) }));
    const stream = interleave(blocks);
    expect(stream).toHaveLength(134);
    expect(stream.slice(0, 5)).toEqual([0, 100, 200, 300, 1]);
    const back = deinterleave(s);
    for (let b = 0; b < 4; b++) {
      expect(back[b]!.data.map((i) => stream[i])).toEqual(blocks[b]!.data);
      expect(back[b]!.ec.map((i) => stream[i])).toEqual(blocks[b]!.ec);
    }
  });
});

describe("Micro QR and rMQR tables", () => {
  it("lists the eight Micro QR symbols and the 32 rMQR sizes with consistent counts", () => {
    expect(MICRO_SYMBOLS.map((s) => `M${s.version}-${s.level}:${s.data}/${s.total}`)).toEqual(["M1-L:3/5", "M2-L:5/10", "M2-M:4/10", "M3-L:11/17", "M3-M:9/17", "M4-L:16/24", "M4-M:14/24", "M4-Q:10/24"]);
    expect(RMQR_HEIGHTS).toHaveLength(32);
    expect(RMQR_WIDTHS).toHaveLength(32);
    for (let v = 1; v <= 32; v++) {
      for (const level of ["M", "H"] as const) {
        const ec = RMQR_TOTAL[v - 1]! - RMQR_DATA[level][v - 1]!;
        expect([v, level, ec % RMQR_BLOCKS[level][v - 1]!]).toEqual([v, level, 0]);
      }
      const layout = rmqrLayout(v);
      expect([layout.width, layout.height]).toEqual([RMQR_WIDTHS[v - 1], RMQR_HEIGHTS[v - 1]]);
      expect(RMQR_ALIGN_COLUMNS[layout.width]).toBeDefined();
    }
    expect(blockStructure("rmqr", 32, "H")).toEqual({ total: 232, data: 76, blocks: 6, ecPerBlock: 26, sizes: [12, 12, 13, 13, 13, 13] });
  });
});

describe("zxing-wasm in Node", () => {
  it("writes a 1-M QR of 01234567 as the ISO/IEC 18004 Annex I symbol and reads it back from RGBA", async () => {
    const zx = await zxing();
    const matrix = (await zx.write("01234567", "QRCode", "version=1,ecLevel=M,dataMask=2"))!;
    expect([matrix.width, matrix.height]).toEqual([21, 21]);
    // row 0 of the Annex I figure: finder, 0 0 1 0 1 1 0, finder
    expect([...Array(21)].map((_, x) => (matrix.get(x, 0) ? "1" : "0")).join("")).toBe("111111100101101111111");
    const read = await zx.read(rgbaFromMatrix(matrix, 4, 4));
    expect(read.map((r) => [r.text, r.format, r.version, r.ecLevel])).toEqual([["01234567", "QRCode", "1", "M"]]);
  });

  it("writes Micro QR and rMQR format information where and as microFormatBits and rmqrFormatBits say", async () => {
    const zx = await zxing();
    // M2-L is symbol number 1; its four masks are the format's low two bits
    for (const mask of [0, 3]) {
      const m = (await zx.write("1A", "MicroQRCode", `version=2,ecLevel=L,dataMask=${mask}`))!;
      expect([m.width, readBits(m, microFormatPositions())]).toEqual([13, microFormatBits(1, mask)]);
    }
    // R11x43 is version 12; the two copies carry different masks and are read least significant bit first
    const r = (await zx.write("R11", "RMQRCode", "version=12,ecLevel=M"))!;
    const [left, right] = rmqrFormatPositions(r.width, r.height);
    expect([r.width, r.height]).toEqual([43, 11]);
    expect(readBits(r, left, true)).toBe(rmqrFormatBits("M", 12, "left"));
    expect(readBits(r, right, true)).toBe(rmqrFormatBits("M", 12, "right"));
    expect(readBits(r, left, true)).not.toBe(readBits(r, right, true));
  });

  it("reads every block of zxing's M4-L and R11x43-M symbols as a valid Reed-Solomon codeword through placementOrder and deinterleave", async () => {
    const zx = await zxing();
    const gf = gf256Qr();
    const blocksOf = (cw: number[], kind: Kind, version: number, level: Level) => {
      const s = blockStructure(kind, version, level);
      expect(cw).toHaveLength(s.total);
      return deinterleave(s).map((b) => rsDecode(gf, [...b.data.map((i) => cw[i]!), ...b.ec.map((i) => cw[i]!)], s.ecPerBlock));
    };
    const micro = (await zx.write("MICRO QR 4", "MicroQRCode", "version=4,ecLevel=L"))!;
    const format = bchDecode(readBits(micro, microFormatPositions()), 5, 15, 0x537, 0x4445, 0)!;
    expect(format.data >> 2).toBe(MICRO_SYMBOLS.findIndex((s) => s.version === 4 && s.level === "L"));
    expect(blocksOf(codewordsOf(micro, "micro", 4, MICRO_MASKS[format.data & 3]!, 24), "micro", 4, "L")).toEqual([{ corrected: 0, erasures: 0 }]);
    const rmqr = (await zx.write("rMQR R11x43", "RMQRCode", "version=12,ecLevel=M"))!;
    expect(blocksOf(codewordsOf(rmqr, "rmqr", 12, RMQR_MASK, 31), "rmqr", 12, "M")).toEqual([{ corrected: 0, erasures: 0 }]);
    // and a symbol with more than one block: R17x139-H has six
    const big = (await zx.write("rMQR R17x139", "RMQRCode", "version=32,ecLevel=H"))!;
    expect(blocksOf(codewordsOf(big, "rmqr", 32, RMQR_MASK, 232), "rmqr", 32, "H")).toEqual(Array(6).fill({ corrected: 0, erasures: 0 }));
  });
});
