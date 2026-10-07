// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zxing } from "../../test/zxing";
import { assembleText, countBits, modeOf, parseBitStream, terminatorBits } from "./bitstream";
import { decodeFamilyMatrix, decodeMicroMatrix, decodeQrMatrix, decodeRmqrMatrix } from "./decode-matrix";
import { BitMatrix, placementOrder, qrLayout, qrVersionPositions } from "./layout";
import { MICRO_SYMBOLS, qrVersionBits, RMQR_HEIGHTS, RMQR_WIDTHS, type Level } from "./tables";

const TEXTS = ["01234567", "HELLO", "Ж✓", "点茗", "ab"];
// zxing-cpp's writer refuses a text that does not fit, so the smallest symbols get the shortest texts
const fits = (v: number, level: Level): string => (v === 1 && level !== "L" ? "01234567" : TEXTS[(v + level.charCodeAt(0)) % TEXTS.length]!);
/** A hand-written bit stream ("0"/"1", spaces ignored) as data codewords, zero-padded to whole bytes. */
const codewords = (bits: string): Uint8Array => {
  const s = bits.replace(/\s/g, ""), out = new Uint8Array(Math.ceil(s.length / 8));
  for (let i = 0; i < s.length; i++) if (s[i] === "1") out[i >> 3]! |= 0x80 >> (i & 7);
  return out;
};
/** A seeded xorshift32 in [0, 1). */
const seeded = (seed: number): (() => number) => {
  let s = seed;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
};

describe("the bit stream", () => {
  it("knows the mode and count lengths of the three symbologies", () => {
    expect([countBits("qr", 1, "numeric"), countBits("qr", 10, "byte"), countBits("qr", 27, "kanji")]).toEqual([10, 16, 12]);
    expect([countBits("micro", 1, "numeric"), countBits("micro", 2, "alphanumeric"), countBits("micro", 2, "byte"), countBits("micro", 4, "kanji")]).toEqual([3, 3, 0, 4]);
    expect([countBits("rmqr", 1, "numeric"), countBits("rmqr", 32, "byte")]).toEqual([4, 8]);
    expect([modeOf("qr", 1, 0b0111), modeOf("qr", 1, 0b0101), modeOf("qr", 1, 0b0011), modeOf("qr", 1, 0b1111)]).toEqual(["eci", "fnc1-first", "structured-append", null]);
    expect([modeOf("micro", 1, 0), modeOf("micro", 3, 2), modeOf("rmqr", 5, 0b111), modeOf("rmqr", 5, 0b100)]).toEqual(["numeric", "byte", "eci", "kanji"]);
    expect([terminatorBits("qr", 5), terminatorBits("micro", 1), terminatorBits("micro", 4), terminatorBits("rmqr", 9)]).toEqual([4, 3, 9, 3]);
  });

  it("parses the ISO/IEC 18004 Annex I data codewords, and refuses a count past the end or a bad digit group", () => {
    const annex = Uint8Array.from([0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]);
    const parsed = parseBitStream("qr", 1, annex, 128)!;
    expect([parsed.text, parsed.charset, parsed.segments.map((s) => s.mode), parsed.eci, parsed.gs1]).toEqual(["01234567", "iso-8859-1", ["numeric"], null, false]);
    // count 200 numeric digits in a 1-M symbol: not enough bits
    expect(parseBitStream("qr", 1, Uint8Array.from([0x13, 0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 128)).toBeNull();
    // numeric, count 3, then a 10-bit digit group of value 1000 (1111101000)
    expect(parseBitStream("qr", 1, Uint8Array.from([0x10, 0x0f, 0xe8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 128)).toBeNull();
  });

  it("parses structured append and FNC1 in the second position from hand-built streams, and refuses FNC1 without data", () => {
    // structured append: index 2 of 4, parity 0xaa; then numeric "123"; terminator
    const sa = parseBitStream("qr", 1, codewords("0011 0010 0011 10101010 0001 0000000011 0001111011 0000"), 48)!;
    expect([sa.text, sa.structuredAppend, sa.gs1, sa.fnc1Second]).toEqual(["123", { index: 2, total: 4, parity: 0xaa }, false, null]);
    // FNC1 second position, application indicator 37 (two digits), then alphanumeric "AB" (10·45 + 11 = 461)
    const two = parseBitStream("qr", 1, codewords("1001 00100101 0010 000000010 00111001101 0000"), 40)!;
    expect([two.text, two.fnc1Second, two.gs1, two.segments.length]).toEqual(["37AB", 37, false, 1]);
    // a letter indicator is its code + 100: 165 → "A"
    expect(parseBitStream("qr", 1, codewords("1001 10100101 0010 000000010 00111001101 0000"), 40)?.text).toBe("AAB");
    // FNC1 first position, then the terminator: no data segment, not a message
    expect(parseBitStream("qr", 1, codewords("0101 0000"), 8)).toBeNull();
    expect(parseBitStream("qr", 1, codewords("1001 00100101 0000"), 16)).toBeNull();
  });

  it("assembles text by charset: Kanji as Shift JIS, GS1's % as GS, bytes by ECI or by sniffing", () => {
    const kanji = assembleText([{ mode: "kanji", bytes: Uint8Array.from([0x93, 0x5f, 0xe4, 0xaa]), eci: null }], false);
    expect([kanji.text, kanji.charset]).toEqual(["点茗", "shift_jis"]);
    const gs1 = assembleText([{ mode: "alphanumeric", bytes: new TextEncoder().encode("01%%ABC%12"), eci: null }], true);
    expect(gs1.text).toBe("01%ABC\u001d12");
    const utf8 = assembleText([{ mode: "byte", bytes: new TextEncoder().encode("Ж✓"), eci: null }], false);
    expect([utf8.text, utf8.charset]).toEqual(["Ж✓", "utf-8"]);
    const latin = assembleText([{ mode: "byte", bytes: Uint8Array.from([0xe9]), eci: 3 }], false);
    expect([latin.text, latin.charset]).toEqual(["é", "iso-8859-1"]);
    const unknownEci = assembleText([{ mode: "byte", bytes: Uint8Array.from([0x41, 0xe9]), eci: 899 }], false);
    expect([unknownEci.text, unknownEci.charset, [...unknownEci.bytes]]).toEqual(["Aé", "iso-8859-1", [0x41, 0xe9]]);
  });
});

describe("decodeQrMatrix against zxing-cpp's writer", () => {
  it("decodes every version and level zxing writes, with the level, version and text", async () => {
    const zx = await zxing();
    for (let v = 1; v <= 40; v++) for (const level of ["L", "M", "Q", "H"] as Level[]) {
      const text = fits(v, level), matrix = await zx.write(text, "QRCode", `version=${v},ecLevel=${level}`);
      expect([v, level, matrix !== null]).toEqual([v, level, true]);
      const r = decodeQrMatrix(matrix!);
      expect([v, level, r?.text, r?.level, r?.version, r?.ecc.corrected, r?.mirrored]).toEqual([v, level, text, level, v, 0, false]);
    }
  }, 60_000);

  it("reads a mirrored (transposed) symbol and flags it, and decodeFamilyMatrix picks the decoder by shape", async () => {
    const zx = await zxing();
    const matrix = (await zx.write("MIRROR", "QRCode", "version=2,ecLevel=Q"))!;
    const r = decodeQrMatrix(matrix.transposed());
    expect([r?.text, r?.mirrored]).toEqual(["MIRROR", true]);
    expect(decodeFamilyMatrix(matrix)?.kind).toBe("qr");
    expect(decodeFamilyMatrix((await zx.write("12", "MicroQRCode", "version=2,ecLevel=L"))!)?.kind).toBe("micro");
    expect(decodeFamilyMatrix((await zx.write("12", "RMQRCode", "version=1,ecLevel=M"))!)?.kind).toBe("rmqr");
  });

  it("takes the version from the matrix size: a v10 symbol whose first version-information block reads as version 20 still decodes", async () => {
    const zx = await zxing();
    const m = (await zx.write("VERSION", "QRCode", "version=10,ecLevel=M"))!;
    // overwrite the first copy with version 20's codeword: at least 7 modules differ (the BCH(18,6) distance)
    const [first] = qrVersionPositions(m.width), fake = qrVersionBits(20);
    let flipped = 0;
    first.forEach(([x, y], i) => { const bit = ((fake >> (17 - i)) & 1) === 1; if (m.get(x, y) !== bit) flipped++; m.set(x, y, bit); });
    expect(flipped).toBeGreaterThanOrEqual(7);
    const r = decodeQrMatrix(m, new Float32Array(m.width * m.height).fill(0.5));
    expect([r?.text, r?.version, r?.ecc.corrected]).toEqual(["VERSION", 10, 0]);
  });

  it("reads ECI and FNC1 (GS1) written by zxing", async () => {
    const zx = await zxing();
    const eci = decodeQrMatrix((await zx.write("Ж✓", "QRCode", "version=2,ecLevel=M,eci=26"))!)!;
    expect([eci.text, eci.eci, eci.charset]).toEqual(["Ж✓", 26, "utf-8"]);
    const gs1 = decodeQrMatrix((await zx.write("[01]04912345678904", "QRCode", "version=2,ecLevel=M,gs1"))!)!;
    expect([gs1.text, gs1.gs1]).toEqual(["0104912345678904", true]);
  });

  it("reads the ISO/IEC 18004 Annex I symbol: 01234567, 1-M, mask 2", async () => {
    const zx = await zxing();
    const r = decodeQrMatrix((await zx.write("01234567", "QRCode", "version=1,ecLevel=M,dataMask=2"))!)!;
    expect([r.text, r.level, r.ecc]).toEqual(["01234567", "M", { level: "M", capacity: 10, corrected: 0, erasures: 0 }]);
    expect(r.symbol).toEqual({ rows: 21, cols: 21, version: 1 });
  });

  it("corrects damaged modules, and with low confidence treats them as erasures: 8 broken codewords of 1-M read, 9 do not", async () => {
    const zx = await zxing();
    const clean = (await zx.write("ERASE", "QRCode", "version=1,ecLevel=M"))!;
    const order = placementOrder(qrLayout(1));
    const broken = (n: number, soft: boolean) => {
      const m = new BitMatrix(21, 21, clean.bits.slice()), conf = new Float32Array(21 * 21).fill(0.5);
      for (let k = 0; k < n; k++) { const [x, y] = order[(2 * k + 1) * 8 + 3]!; m.set(x, y, !m.get(x, y)); conf[y * 21 + x] = 0.05; }
      return decodeQrMatrix(m, soft ? conf : undefined);
    };
    expect([broken(5, false)?.text, broken(5, false)?.ecc.corrected]).toEqual(["ERASE", 5]);
    expect(broken(6, false)).toBeNull();
    expect([broken(8, true)?.text, broken(8, true)?.ecc.erasures]).toEqual(["ERASE", 8]);
    expect(broken(9, true)).toBeNull();
  });

  it("accepts padding that is not EC 11 (an encoder in ZXing's corpus pads with 0x14), but refuses a random matrix of every size", () => {
    // 1-L data for "TEST": alphanumeric, count 4, then the terminator, then 0x4a 0x14… as qrcode-6/15.png has it
    const data = Uint8Array.from([0x20, 0x25, 0x27, 0xa1, 0x20, 0x4a, 0x14, 0x14, 0x14, 0x14, 0x02, 0x14, 0x14, 0x14, 0x0a, 0x14, 0x14, 0x0f, 0x14]);
    expect(parseBitStream("qr", 1, data, 19 * 8)?.text).toBe("TEST");
    const rnd = seeded(12345);
    for (const size of [11, 13, 15, 17, 21, 25, 29, 45, 77, 177]) {
      for (let trial = 0; trial < 20; trial++) {
        const m = new BitMatrix(size, size);
        for (let i = 0; i < m.bits.length; i++) m.bits[i] = rnd() < 0.5 ? 1 : 0;
        expect([size, trial, decodeFamilyMatrix(m)]).toEqual([size, trial, null]);
      }
    }
    for (let v = 1; v <= 32; v += 7) {
      const m = new BitMatrix(RMQR_WIDTHS[v - 1]!, RMQR_HEIGHTS[v - 1]!);
      for (let i = 0; i < m.bits.length; i++) m.bits[i] = rnd() < 0.5 ? 1 : 0;
      expect(decodeRmqrMatrix(m)).toBeNull();
    }
  });

  it("refuses a random matrix of every size with low random confidences too, where the erasure hypotheses run", () => {
    const rnd = seeded(67890);
    const noise = (w: number, h: number): [BitMatrix, Float32Array] => {
      const m = new BitMatrix(w, h), conf = new Float32Array(w * h);
      for (let i = 0; i < m.bits.length; i++) { m.bits[i] = rnd() < 0.5 ? 1 : 0; conf[i] = rnd() * 0.3; }
      return [m, conf];
    };
    for (const size of [11, 13, 15, 17, 21, 25, 29, 45, 77, 177]) {
      for (let trial = 0; trial < 20; trial++) {
        const [m, conf] = noise(size, size);
        expect([size, trial, decodeFamilyMatrix(m, conf)]).toEqual([size, trial, null]);
      }
    }
    for (let v = 1; v <= 32; v++) {
      const [m, conf] = noise(RMQR_WIDTHS[v - 1]!, RMQR_HEIGHTS[v - 1]!);
      expect([v, decodeRmqrMatrix(m, conf)]).toEqual([v, null]);
    }
  });
});

describe("Micro QR and rMQR against zxing-cpp's writer", () => {
  it("decodes the eight Micro QR symbols, M1 and M3 with their 4-bit final codeword", async () => {
    const zx = await zxing();
    for (const s of MICRO_SYMBOLS) {
      const text = s.version === 1 ? "12345" : s.version === 2 ? "AB12" : s.version === 3 ? (s.level === "L" ? "ABCDEFGHIJKLMN" : "ABCDEFGHIJ") : "Hello";
      const matrix = await zx.write(text, "MicroQRCode", `version=${s.version}${s.version > 1 ? `,ecLevel=${s.level}` : ""}`);
      const r = decodeMicroMatrix(matrix!);
      expect([s.version, s.level, r?.text, r?.version, r?.level, r?.symbol.version]).toEqual([s.version, s.level, text, s.version, s.level, `M${s.version}`]);
      const mirrored = decodeMicroMatrix(matrix!.transposed());
      expect([s.version, mirrored?.text, mirrored?.mirrored]).toEqual([s.version, text, true]);
    }
  });

  it("decodes all 32 rMQR sizes at both levels", async () => {
    const zx = await zxing();
    for (let v = 1; v <= 32; v++) for (const level of ["M", "H"] as const) {
      const text = v === 1 && level === "H" ? "ok" : v % 3 === 0 ? "1234" : v % 3 === 1 ? "RMQR" : "ok";
      const matrix = await zx.write(text, "RMQRCode", `version=${v},ecLevel=${level}`);
      const r = decodeRmqrMatrix(matrix!);
      expect([v, level, r?.text, r?.level, r?.version, r?.symbol]).toEqual([v, level, text, level, v, { rows: RMQR_HEIGHTS[v - 1], cols: RMQR_WIDTHS[v - 1], version: `R${RMQR_HEIGHTS[v - 1]}x${RMQR_WIDTHS[v - 1]}` }]);
    }
  }, 60_000);
});
