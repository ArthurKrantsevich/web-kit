// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CASCADE, ScanContext } from "./context";
import { geometryOf, iou, scan } from "./scan";
import { charsetOf, decodeBytes } from "./text";
import type { Candidate, Pass, ScanImage, ScanResult, SymbologyDecoder } from "./types";

const gray = (width: number, height: number, fill: (x: number, y: number) => number = () => 200): ScanImage => {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fill(x, y);
  return { width, height, data, format: "gray" };
};
const result = (text: string, x: number, confidence = 0.9): ScanResult => ({
  symbology: "qr", text, bytes: new TextEncoder().encode(text), segments: [], eci: null, charset: "iso-8859-1", gs1: false, structuredAppend: null,
  points: [[x, 0], [x + 100, 0], [x + 100, 100], [x, 100]], orientation: 0, mirrored: false, inverted: false, symbol: { rows: 21, cols: 21, version: 1 },
  ecc: { level: "M", capacity: 10, corrected: 0, erasures: 0 }, confidence,
});
/** A decoder that reports the passes it saw and answers `answers[pass index]` candidates with their results. */
type FakeDecoder = SymbologyDecoder & { passes: Pass[]; decodes: number };
function fakeDecoder(answers: Record<string, ScanResult[]>, slowMs = 0): FakeDecoder {
  const passes: Pass[] = [];
  const decoder: FakeDecoder = {
    id: "qr-family", family: "2d", passes, decodes: 0,
    locate(ctx: ScanContext): Candidate[] {
      passes.push({ ...ctx.pass });
      const key = `${ctx.pass.id}${ctx.pass.inverted ? "-inv" : ""}${ctx.pass.flat ? "-flat" : ""}`;
      return (answers[key] ?? []).map((r) => ({ level: ctx.startLevel, module: 4, corners: r.points, detail: r }));
    },
    decode(_ctx: ScanContext, candidate: Candidate): ScanResult | null {
      decoder.decodes++;
      const until = performance.now() + slowMs;
      while (performance.now() < until) { /* busy */ }
      return candidate.detail as ScanResult;
    },
  };
  return decoder;
}

describe("ScanContext", () => {
  it("builds the pyramid down to a long side under 320 px, starts at the first level of 1280 px or less, and caches binarizations", () => {
    const ctx = new ScanContext(gray(2000, 1000), { decoders: [] });
    expect(ctx.levels.map((l) => [l.gray.width, l.gray.height, l.scale])).toEqual([[2000, 1000, 1], [1000, 500, 2], [500, 250, 4], [250, 125, 8]]);
    expect(ctx.startLevel).toBe(1);
    const a = ctx.binarize(1, "hybrid", false, false), b = ctx.binarize(1, "hybrid", false, false);
    expect(a).toBe(b);
    expect(ctx.binarize(1, "hybrid", true, false)).not.toBe(a);
    expect(ctx.binarize(0, "otsu", false, false).scale).toBe(1);
    expect(ctx.binarize(-1, "otsu", false, false).gray.width).toBe(4000);
    expect(ctx.binarize(-1, "otsu", false, false).scale).toBe(0.5);
  });

  it("caches by module hint only for the binarizers whose window depends on it, and shares the upscaled level between flat and plain", () => {
    const ctx = new ScanContext(gray(400, 400), { decoders: [] });
    expect(ctx.binarize(1, "sauvola", false, false, 5)).not.toBe(ctx.binarize(1, "sauvola", false, false, 15));
    expect(ctx.binarize(1, "wolf", false, false, 5)).not.toBe(ctx.binarize(1, "wolf", false, false, 15));
    expect(ctx.binarize(1, "hybrid", false, false, 5)).toBe(ctx.binarize(1, "hybrid", false, false, 15));
    expect(ctx.binarize(1, "otsu", false, false, 5)).toBe(ctx.binarize(1, "otsu", false, false, 15));
    expect(ctx.binarize(-1, "otsu", false, true)).toBe(ctx.binarize(-1, "otsu", false, false));
  });

  it("answers whether a binarization is cached with the same key normalization binarize uses", () => {
    const ctx = new ScanContext(gray(400, 400), { decoders: [] });
    expect(ctx.cached(0, "hybrid", false, false)).toBe(false);
    ctx.binarize(0, "hybrid", false, false, 5, false);
    // the hint counts only for Sauvola and Wolf, and is rounded; level −1 is never flat; lazy defaults off the start level
    expect([ctx.cached(0, "hybrid", false, false, 9), ctx.cached(0, "hybrid", true, false), ctx.cached(0, "hybrid", false, true), ctx.cached(0, "hybrid", false, false, 5, true)]).toEqual([true, false, false, false]);
    ctx.binarize(0, "sauvola", false, false, 5, false);
    expect([ctx.cached(0, "sauvola", false, false, 5.3), ctx.cached(0, "sauvola", false, false, 7)]).toEqual([true, false]);
    ctx.binarize(-1, "wolf", false, false, 6);
    expect([ctx.cached(-1, "wolf", false, true, 6), ctx.cached(-1, "wolf", false, true, 6, false)]).toEqual([true, false]);
  });

  it("crops to the region of interest and remembers its offset", () => {
    const ctx = new ScanContext(gray(400, 300), { decoders: [], roi: { x: 100, y: 50, width: 200, height: 100 } });
    expect([ctx.levels[0]!.gray.width, ctx.levels[0]!.gray.height, ctx.offset]).toEqual([200, 100, [100, 50]]);
  });

  it("stretches the contrast, inverts the gray for an inverted pass, and tells uneven lighting from the quarters", () => {
    const ctx = new ScanContext(gray(100, 100, (x) => (x < 50 ? 20 : 240)), { decoders: [] });
    expect(ctx.unevenLighting()).toBe(true);
    const plain = ctx.binarize(0, "otsu", false, false), inverted = ctx.binarize(0, "otsu", true, false);
    // 20…240 is stretched to 0…255 by the LUT; the inverted pass sees 255 − that
    expect([plain.gray.data[0], plain.gray.data[99], inverted.gray.data[0]]).toEqual([0, 255, 255]);
    expect([plain.plane.get(0, 0), inverted.plane.get(0, 0)]).toEqual([true, false]);
    expect(new ScanContext(gray(100, 100), { decoders: [] }).unevenLighting()).toBe(false);
  });

  it("converts RGBA, and throws on a buffer that does not fit", () => {
    const ok = new ScanContext({ width: 2, height: 1, data: new Uint8ClampedArray([255, 255, 255, 0, 0, 0, 0, 255]), format: "rgba" }, { decoders: [] });
    expect([...ok.levels[0]!.gray.data]).toEqual([255, 0]);
    expect(() => new ScanContext({ width: 2, height: 2, data: new Uint8ClampedArray(7), format: "rgba" }, { decoders: [] })).toThrow(RangeError);
  });
});

describe("scan", () => {
  it("returns [] for no decoders, and runs the cascade in the spec's order, inverted after plain, the hard passes only with tryHarder", () => {
    expect(scan(gray(64, 64), { decoders: [] })).toEqual([]);
    const plain = fakeDecoder({});
    scan(gray(64, 64), { decoders: [plain], deadlineMs: 5000 });
    expect(plain.passes.map((p) => `${p.id}${p.inverted ? "-inv" : ""}`)).toEqual(["hybrid", "sauvola", "otsu", "hybrid-inv", "sauvola-inv", "otsu-inv"]);
    expect(plain.passes.every((p) => !p.flat)).toBe(true);
    const hard = fakeDecoder({});
    scan(gray(64, 64), { decoders: [hard], tryHarder: true, deadlineMs: 5000 });
    expect(hard.passes.filter((p) => !p.flat).map((p) => `${p.id}${p.inverted ? "-inv" : ""}`)).toEqual([...CASCADE.map((p) => `${p.id}${p.inverted ? "-inv" : ""}`)]);
    // with tryHarder the lighting-corrected planes follow the plain ones
    expect(hard.passes.filter((p) => p.flat).length).toBe(CASCADE.length);
  });

  it("tries the flattened plane first when the lighting is uneven", () => {
    const decoder = fakeDecoder({});
    scan(gray(100, 100, (x) => (x < 50 ? 20 : 240)), { decoders: [decoder], deadlineMs: 5000 });
    expect(decoder.passes[0]!.flat).toBe(true);
    expect(decoder.passes.some((p) => !p.flat)).toBe(true);
  });

  it("stops at the first result without multiple, and collects every result with it, deduplicated by symbology, bytes and overlap", () => {
    const one = fakeDecoder({ hybrid: [result("A", 0), result("B", 300)], sauvola: [result("C", 600)] });
    expect(scan(gray(64, 64), { decoders: [one], deadlineMs: 5000 }).map((r) => r.text)).toEqual(["A"]);
    expect(one.passes).toHaveLength(1);
    const all = fakeDecoder({ hybrid: [result("A", 0, 0.6), result("B", 300)], sauvola: [result("A", 10, 0.9), result("C", 600)] });
    const results = scan(gray(64, 64), { decoders: [all], multiple: true, deadlineMs: 5000 });
    expect(results.map((r) => [r.text, r.confidence])).toEqual([["A", 0.9], ["B", 0.9], ["C", 0.9]]);
    // the same bytes far apart are two codes
    const twice = fakeDecoder({ hybrid: [result("A", 0), result("A", 500)] });
    expect(scan(gray(64, 64), { decoders: [twice], multiple: true, deadlineMs: 5000 })).toHaveLength(2);
  });

  it("merges results of one symbology and bytes whose boxes overlap by more than 0.3 IoU, keeping the more confident", () => {
    expect(iou([[0, 0], [100, 0], [100, 100], [0, 100]], [[50, 0], [150, 0], [150, 100], [50, 100]])).toBeCloseTo(1 / 3, 5);
    expect(iou([[0, 0], [100, 0], [100, 100], [0, 100]], [[200, 0], [300, 0], [300, 100], [200, 100]])).toBe(0);
    const decoder = fakeDecoder({ hybrid: [result("A", 0, 0.7)], otsu: [result("A", 20, 0.8)] });
    const results = scan(gray(64, 64), { decoders: [decoder], multiple: true, deadlineMs: 5000 });
    expect(results.map((r) => [r.text, r.confidence, r.points[0]])).toEqual([["A", 0.8, [20, 0]]]);
  });

  it("keeps the deadline between steps, and does not start a pass the previous one says cannot finish", () => {
    const slow = fakeDecoder({ hybrid: [result("A", 0), result("B", 300), result("C", 600)], sauvola: [result("D", 900)] }, 30);
    const t0 = performance.now();
    const results = scan(gray(64, 64), { decoders: [slow], multiple: true, deadlineMs: 40 });
    expect(performance.now() - t0).toBeLessThan(120);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThan(4);
    expect(slow.passes.length).toBeLessThan(6);
    // each pass of this decoder takes about 30 ms: with 70 ms the second pass starts, the third does not
    const steady = fakeDecoder({ hybrid: [result("A", 0)], sauvola: [result("B", 300)], otsu: [result("C", 600)] }, 30);
    scan(gray(64, 64), { decoders: [steady], multiple: true, deadlineMs: 70 });
    expect(steady.passes.length).toBe(2);
  });

  it("asks locators before the decoders, defaults the deadline to 40 ms or 500 ms, and is deterministic", () => {
    const seen: string[] = [];
    const decoder = fakeDecoder({});
    decoder.locate = (ctx) => { seen.push("decoder"); return [{ level: ctx.startLevel, module: 4, corners: [], detail: result("L", 0) }]; };
    const locator = { id: "test", locate: (ctx: ScanContext) => { seen.push("locator"); return [{ level: ctx.startLevel, module: 4, corners: [], detail: result("L", 0) }]; } };
    const out = scan(gray(64, 64), { decoders: [decoder], locators: [locator], deadlineMs: 5000 });
    expect([out.map((r) => r.text), seen.slice(0, 2)]).toEqual([["L"], ["locator", "decoder"]]);
    const fast = new ScanContext(gray(8, 8), { decoders: [] }), hard = new ScanContext(gray(8, 8), { decoders: [], tryHarder: true });
    expect(fast.deadline - performance.now()).toBeLessThanOrEqual(40);
    expect(hard.deadline - performance.now()).toBeGreaterThan(400);
    const image = gray(64, 64, (x, y) => (x * 7 + y * 13) % 256);
    const a = fakeDecoder({ otsu: [result("S", 0)] }), b = fakeDecoder({ otsu: [result("S", 0)] });
    expect(JSON.stringify(scan(image, { decoders: [a] }))).toBe(JSON.stringify(scan(image, { decoders: [b] })));
  });
});

describe("geometryOf", () => {
  it("maps the symbol's corners back to the input image through the level's scale and the ROI offset, and reads the orientation from the top edge", () => {
    const map = (u: number, v: number): [number, number] => [10 + u * 2, 20 + v * 2];
    expect(geometryOf(map, 21, 21, 2, [5, 5])).toEqual({ points: [[25, 45], [109, 45], [109, 129], [25, 129]], orientation: 0 });
    const turned = (u: number, v: number): [number, number] => [100 - v * 3, u * 3];
    expect(geometryOf(turned, 21, 21, 1, [0, 0]).orientation).toBe(90);
    const upsideDown = (u: number, v: number): [number, number] => [100 - u, 100 - v];
    expect(geometryOf(upsideDown, 21, 21, 1, [0, 0]).orientation).toBe(180);
  });
});

describe("text", () => {
  it("chooses a charset for bytes without ECI: ASCII, valid UTF-8, Shift JIS pairs, else ISO-8859-1", () => {
    expect(charsetOf(new TextEncoder().encode("plain"))).toBe("us-ascii");
    expect(charsetOf(new TextEncoder().encode("Ж✓"))).toBe("utf-8");
    expect(charsetOf(new Uint8Array([0x93, 0x5f, 0x96, 0xe1]))).toBe("shift_jis");
    expect(charsetOf(new Uint8Array([0xe9, 0x74, 0xe9]))).toBe("iso-8859-1");
    // 93 5F = 点, 96 E1 = 貰 in the WHATWG Shift JIS table
    expect(decodeBytes(new Uint8Array([0x93, 0x5f, 0x96, 0xe1]), "shift_jis")).toBe("点貰");
    expect(decodeBytes(new Uint8Array([0xff]), "utf-8")).toBeNull();
    expect(decodeBytes(new Uint8Array([0xe9]), "iso-8859-1")).toBe("é");
  });
});
