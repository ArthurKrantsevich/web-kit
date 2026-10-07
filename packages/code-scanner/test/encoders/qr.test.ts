// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodeMicroMatrix, decodeQrMatrix, decodeRmqrMatrix } from "../../src/qr/decode-matrix";
import { MICRO_SYMBOLS, RMQR_HEIGHTS, RMQR_WIDTHS, type Level } from "../../src/qr/tables";
import { rgbaFromMatrix, zxing } from "../zxing";
import { encodeSymbol, penalty, segmentsFor, smallestVersion, toShiftJis } from "./qr";

const same = (a: { bits: Uint8Array }, b: { bits: Uint8Array }): boolean => a.bits.length === b.bits.length && a.bits.every((v, i) => v === b.bits[i]);

describe("segments", () => {
  it("picks the densest mode and converts Kanji to Shift JIS", () => {
    expect(segmentsFor("0123")).toEqual([{ mode: "numeric", text: "0123" }]);
    expect(segmentsFor("HELLO WORLD")).toEqual([{ mode: "alphanumeric", text: "HELLO WORLD" }]);
    expect(segmentsFor("点茗")).toEqual([{ mode: "kanji", bytes: Uint8Array.from([0x93, 0x5f, 0xe4, 0xaa]) }]);
    expect(segmentsFor("hello")).toEqual([{ mode: "byte", bytes: new TextEncoder().encode("hello") }]);
    expect(toShiftJis("✓")).toBeNull();
    expect(toShiftJis("Ж")).toEqual(Uint8Array.from([0x84, 0x47])); // JIS X 0208 row 7 holds Cyrillic
    expect(smallestVersion("qr", "M", segmentsFor("https://arthurkrantsevich.github.io/web-kit/"))).toBe(4);
    expect(smallestVersion("qr", "L", segmentsFor("1".repeat(7090)))).toBeNull();
    expect(smallestVersion("qr", "L", segmentsFor("1".repeat(7089)))).toBe(40);
  });
});

describe("the encoder against zxing-cpp's writer", () => {
  it("makes byte-identical QR matrices for the same text, version, level and mask", async () => {
    const zx = await zxing();
    for (const [v, level, mask, text] of [[1, "L", 0, "HELLO"], [2, "H", 3, "HELLO"], [5, "Q", 7, "01234567"], [7, "L", 2, "点茗点茗点茗点茗"], [10, "M", 5, "web-kit"], [20, "H", 1, "A".repeat(100)], [40, "L", 6, "1".repeat(300)]] as const) {
      const theirs = (await zx.write(text, "QRCode", `version=${v},ecLevel=${level},dataMask=${mask}`))!;
      const ours = encodeSymbol("qr", v, level, segmentsFor(text), mask)!;
      expect([v, level, mask, same(theirs, ours.matrix)]).toEqual([v, level, mask, true]);
    }
  });

  it("makes byte-identical Micro QR matrices for every symbol and mask", async () => {
    const zx = await zxing();
    for (const s of MICRO_SYMBOLS) for (let mask = 0; mask < 4; mask++) {
      const text = s.version === 1 ? "123" : "AB1";
      const theirs = (await zx.write(text, "MicroQRCode", `version=${s.version}${s.version > 1 ? `,ecLevel=${s.level}` : ""},dataMask=${mask}`))!;
      const ours = encodeSymbol("micro", s.version, s.level, segmentsFor(text), mask)!;
      expect([s.version, s.level, mask, same(theirs, ours.matrix)]).toEqual([s.version, s.level, mask, true]);
    }
  });

  it("makes byte-identical rMQR matrices for all 32 sizes at both levels", async () => {
    const zx = await zxing();
    for (let v = 1; v <= 32; v++) for (const level of ["M", "H"] as const) {
      const theirs = (await zx.write("ok", "RMQRCode", `version=${v},ecLevel=${level}`))!;
      const ours = encodeSymbol("rmqr", v, level, segmentsFor("ok"))!;
      expect([v, level, same(theirs, ours.matrix)]).toEqual([v, level, true]);
    }
  }, 60_000);

  it("picks the mask with the lowest penalty, and round-trips every version and level through our decoder", () => {
    const texts = ["01234567", "HELLO WORLD", "https://example.com/path?q=1", "Ж✓ ünïcode", "点茗", "1".repeat(100), "A".repeat(60)];
    for (let v = 1; v <= 40; v += v < 10 ? 1 : 3) for (const level of ["L", "M", "Q", "H"] as Level[]) {
      for (const text of texts) {
        const enc = encodeSymbol("qr", v, level, segmentsFor(text));
        if (!enc) continue; // the text does not fit this symbol
        const r = decodeQrMatrix(enc.matrix);
        expect([v, level, text.slice(0, 8), r?.text, r?.level, r?.version]).toEqual([v, level, text.slice(0, 8), text, level, v]);
        for (let mask = 0; mask < 8; mask++) expect(penalty(encodeSymbol("qr", v, level, segmentsFor(text), mask)!.matrix)).toBeGreaterThanOrEqual(penalty(enc.matrix));
      }
    }
  }, 60_000);

  it("round-trips Micro QR and rMQR through our decoders", () => {
    for (const s of MICRO_SYMBOLS) for (const text of ["1234", "12345", "AB12", "Hi!", "点", "HELLO", "1234567890"]) {
      const enc = encodeSymbol("micro", s.version, s.level, segmentsFor(text));
      if (!enc) continue;
      expect([s.version, s.level, text, decodeMicroMatrix(enc.matrix)?.text]).toEqual([s.version, s.level, text, text]);
    }
    for (let v = 1; v <= 32; v++) for (const level of ["M", "H"] as const) for (const text of ["12345", "RMQR", "rMQR ok", "点茗"]) {
      const enc = encodeSymbol("rmqr", v, level, segmentsFor(text));
      if (!enc) continue;
      const r = decodeRmqrMatrix(enc.matrix);
      expect([v, level, text, r?.text, r?.symbol.version]).toEqual([v, level, text, text, `R${RMQR_HEIGHTS[v - 1]}x${RMQR_WIDTHS[v - 1]}`]);
    }
  });

  it("writes ECI, FNC1 and structured append that zxing-cpp reads", async () => {
    const zx = await zxing();
    const cases = [
      { segments: [{ mode: "eci", eci: 26 }, { mode: "byte", bytes: new TextEncoder().encode("Ж✓") }] as const, text: "Ж✓", check: (r: { hasECI: boolean }) => r.hasECI },
      { segments: [{ mode: "fnc1-first" }, { mode: "numeric", text: "0104912345678904" }] as const, text: "(01)04912345678904", check: (r: { symbologyIdentifier: string }) => r.symbologyIdentifier === "]Q3" },
      { segments: [{ mode: "structured-append", index: 1, total: 3, parity: 0x5a }, { mode: "byte", bytes: new TextEncoder().encode("part") }] as const, text: "part", check: (r: { sequenceIndex: number; sequenceSize: number }) => r.sequenceIndex === 1 && r.sequenceSize === 3 },
      { segments: [{ mode: "fnc1-second", indicator: 42 }, { mode: "alphanumeric", text: "ABC" }] as const, text: "42ABC", check: (r: { symbologyIdentifier: string }) => r.symbologyIdentifier.startsWith("]Q5") },
    ];
    for (const { segments, text, check } of cases) {
      const enc = encodeSymbol("qr", 3, "M", [...segments])!;
      const read = await zx.read(rgbaFromMatrix(enc.matrix, 4, 4), { textMode: "HRI" }); // HRI: GS1 AIs in parentheses
      expect([segments[0].mode, read.length, read[0]?.text, read[0] ? check(read[0]) : null]).toEqual([segments[0].mode, 1, text, true]);
      const ours = decodeQrMatrix(enc.matrix)!;
      expect(ours.text.replace(/\u001d/g, "")).toBe(segments[0].mode === "fnc1-first" ? "0104912345678904" : text);
    }
  });
});
