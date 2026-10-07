// @vitest-environment node
import { describe, expect, it } from "vitest";
import { asImage, blur, compose, cylinder, damage, gradientLight, invert, noise, rasterize } from "../../bench/distort";
import { encodeSymbol, segmentsFor } from "../../test/encoders/qr";
import { ScanContext } from "../core/context";
import { hybrid } from "../core/binarize";
import type { GrayPlane } from "../core/image";
import { scan } from "../core/scan";
import type { ScanOptions, ScanResult } from "../core/types";
import { qrFamily } from "./family";
import { confirmFinder, findAlignmentPattern, findFinderPatterns } from "./finder";
import { dimensionCandidates, finderTriples, predictedThirdFinders, timingAgreement } from "./locate";
import { finderCorners } from "./single";

const qr = (text: string, version = 2, level: "L" | "M" | "Q" | "H" = "M") => encodeSymbol("qr", version, level, segmentsFor(text))!.matrix;
const options = (extra: Partial<ScanOptions> = {}): ScanOptions => ({ decoders: [qrFamily], deadlineMs: 3000, ...extra });
const first = (results: ScanResult[]): string | null => results[0]?.text ?? null;

describe("finder patterns", () => {
  it("finds the three finders of an upright and of a rotated QR with a rotation-free module size", () => {
    for (const rotate of [0, 30, 45]) {
      const r = rasterize(qr("finders"), { module: 6, rotate });
      const patterns = findFinderPatterns(hybrid(r).plane, { tolerance: 0.5, areaTolerance: 0.4, totalTolerance: 0.4 });
      expect([rotate, patterns.length]).toEqual([rotate, 3]);
      for (const p of patterns) expect(Math.abs(p.module - 6)).toBeLessThan(0.6);
      // every centre is 3.5 modules inside a corner of the symbol
      for (const p of patterns) expect(r.corners.some((c) => Math.abs(Math.hypot(p.x - c[0], p.y - c[1]) - 3.5 * 6 * Math.SQRT2) < 4)).toBe(true);
    }
  });

  it("groups them into one ordered triple with the right dimension candidates, and finds the alignment pattern", () => {
    const r = rasterize(qr("triple", 3), { module: 5, rotate: 20 });
    const bin = hybrid(r), patterns = findFinderPatterns(bin.plane, { tolerance: 0.5, areaTolerance: 0.4, totalTolerance: 0.4 });
    const triples = finderTriples(patterns, { angleTolerance: 0.15, ratioLimit: 1.6, plane: bin.plane });
    expect(triples).toHaveLength(1);
    const t = triples[0]!;
    expect(timingAgreement(bin.plane, t.tl, t.tr, t.bl, 29)).toBeGreaterThan(0.9);
    expect(timingAgreement(bin.plane, t.tl, t.bl, t.tr, 29)).toBeGreaterThan(0.9);
    // tl is the corner with the right angle: tr is reached clockwise from bl
    expect((t.tr.x - t.tl.x) * (t.bl.y - t.tl.y) - (t.tr.y - t.tl.y) * (t.bl.x - t.tl.x)).toBeGreaterThan(0);
    expect(dimensionCandidates(t)[0]).toBe(29);
    expect(dimensionCandidates({ ...t, legModules: 170 })).toEqual([177, 173]);
    const unit = (x: number, y: number): [number, number] => { const l = Math.hypot(x, y); return [x / l, y / l]; };
    const axes: [[number, number], [number, number]] = [unit(t.tr.x - t.tl.x, t.tr.y - t.tl.y), unit(t.bl.x - t.tl.x, t.bl.y - t.tl.y)];
    // the bottom-right alignment pattern sits at module (22.5, 22.5)
    const a = (u: number, v: number) => [t.tl.x + axes[0][0] * (u - 3.5) * 5 + axes[1][0] * (v - 3.5) * 5, t.tl.y + axes[0][1] * (u - 3.5) * 5 + axes[1][1] * (v - 3.5) * 5] as const;
    const [ex, ey] = a(22.5, 22.5), found = findAlignmentPattern(bin.plane, ex + 3, ey - 2, 20, 5, axes)!;
    expect(Math.hypot(found[0] - ex, found[1] - ey)).toBeLessThan(1.5);
    expect(findAlignmentPattern(bin.plane, ...a(15, 15), 6, 5, axes)).toBeNull();
  });

  it("rejects a triple of finders from three different codes by their missing timing patterns, and confirms a predicted finder by its rings", () => {
    const a = rasterize(qr("a", 1), { module: 4 }), b = rasterize(qr("b", 1), { module: 4 }), c = rasterize(qr("c", 1), { module: 4 });
    const sheet = compose(520, 520, [{ plane: a, x: 0, y: 0 }, { plane: b, x: 300, y: 0 }, { plane: c, x: 0, y: 300 }]);
    const bin = hybrid(sheet), patterns = findFinderPatterns(bin.plane, { tolerance: 0.5, areaTolerance: 0.4, totalTolerance: 0.4 });
    expect(patterns).toHaveLength(9);
    const loose = finderTriples(patterns, { angleTolerance: 0.15, ratioLimit: 1.6 });
    const strict = finderTriples(patterns, { angleTolerance: 0.15, ratioLimit: 1.6, plane: bin.plane });
    expect(loose.length).toBeGreaterThan(3);
    expect(strict).toHaveLength(3);
    for (const t of strict) expect(Math.abs(t.legModules - 14)).toBeLessThan(1);
    // a finder predicted from two others is confirmed where it is, not where it is not
    const [tl, tr, bl] = [strict[0]!.tl, strict[0]!.tr, strict[0]!.bl];
    const predicted = predictedThirdFinders(tl, tr).find((p) => Math.hypot(p[0] - bl.x, p[1] - bl.y) < 4)!;
    const confirmed = confirmFinder(bin.plane, predicted[0] + 1, predicted[1] - 1, 4)!;
    expect(Math.hypot(confirmed.x - bl.x, confirmed.y - bl.y)).toBeLessThan(1.5);
    expect(Math.abs(confirmed.module - 4)).toBeLessThan(0.8);
    // the white between the codes holds no finder
    expect(confirmFinder(bin.plane, 260, 60, 4)).toBeNull();
  });

  it("finds a single finder's four corners", () => {
    const r = rasterize(encodeSymbol("micro", 2, "L", segmentsFor("AB12"))!.matrix, { module: 6, rotate: 15 });
    const bin = hybrid(r), p = findFinderPatterns(bin.plane, { tolerance: 0.5, areaTolerance: 0.4, totalTolerance: 0.4 })[0]!;
    const corners = finderCorners(bin.plane, p)!;
    expect(corners).toHaveLength(4);
    // the finder is the symbol's top-left 7×7: one corner is the symbol's corner, the others 7 modules along its edges
    const d = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
    expect(Math.min(...corners.map((c) => d(c, r.corners[0]!)))).toBeLessThan(2.5);
    for (let i = 0; i < 4; i++) expect(Math.abs(d(corners[i]!, corners[(i + 1) % 4]!) - 42)).toBeLessThan(3);
  });
});

describe("qrFamily on rendered QR codes", () => {
  it("decodes QR rotated by any angle at modules from 2 to 8 px", () => {
    for (const module of [2, 3, 4, 6, 8]) for (const rotate of [0, 15, 30, 45, 90, 135, 200, 290]) {
      const text = `rot${rotate}m${module}`;
      const results = scan(asImage(rasterize(qr(text), { module, rotate })), options({ tryHarder: module < 3 }));
      expect([module, rotate, first(results)]).toEqual([module, rotate, text]);
      // the orientation is the angle of the symbol's top edge in the image (y down, so a quarter turn clockwise is 90)
      if (rotate === 0 && module === 6) expect(results[0]!.orientation).toBe(0);
      if (rotate === 90 && module === 6) expect(results[0]!.orientation).toBe(90);
    }
  });

  it("decodes under perspective up to 60 degrees with tryHarder, and reports the symbol's corners and orientation", () => {
    // tilt 0.4 is about 53°, 0.5 about 60°; 60° is reached at some rotations (decision 27)
    const cases: [number, number[]][] = [[0.1, [0, 33, 240, 280]], [0.25, [0, 33, 240, 280]], [0.4, [0, 33, 240, 280]], [0.5, [0, 33]]];
    for (const [tilt, rotations] of cases) for (const rotate of rotations) {
      const text = `tilt${tilt}`, r = rasterize(qr(text, 3), { module: 6, rotate, tilt });
      const results = scan(asImage(r), options({ tryHarder: tilt >= 0.4 }));
      expect([tilt, rotate, first(results)]).toEqual([tilt, rotate, text]);
      const points = results[0]!.points;
      for (let i = 0; i < 4; i++) expect([tilt, rotate, i, Math.hypot(points[i]![0] - r.corners[i]![0], points[i]![1] - r.corners[i]![1]) < 10]).toEqual([tilt, rotate, i, true]);
    }
    const r = rasterize(qr("orient", 2), { module: 6, rotate: 30 });
    const result = scan(asImage(r), options())[0]!;
    expect(Math.abs(result.orientation - 30)).toBeLessThanOrEqual(2);
  });

  it("decodes blurred and noisy symbols, dense versions, a lighting gradient, inverted and mirrored codes", () => {
    for (const sigma of [0.8, 1.5, 2.2]) expect([sigma, first(scan(asImage(blur(rasterize(qr(`blur${sigma}`), { module: 6 }), sigma)), options()))]).toEqual([sigma, `blur${sigma}`]);
    for (const sigma of [10, 25, 40]) expect([sigma, first(scan(asImage(noise(rasterize(qr(`noise${sigma}`), { module: 5 }), sigma, 7)), options()))]).toEqual([sigma, `noise${sigma}`]);
    for (const [v, level] of [[1, "L"], [5, "Q"], [10, "H"], [20, "M"], [40, "L"]] as const) {
      const text = "x".repeat(v * 6);
      expect([v, first(scan(asImage(rasterize(qr(text, v, level), { module: 3 })), options()))]).toEqual([v, text]);
    }
    const lit = scan(asImage(gradientLight(rasterize(qr("gradient", 3), { module: 5 }), 0.6)), options({ tryHarder: true }));
    expect(first(lit)).toBe("gradient");
    const inverted = scan(asImage(invert(rasterize(qr("inverted"), { module: 5 }))), options());
    expect([first(inverted), inverted[0]?.inverted]).toEqual(["inverted", true]);
    const mirrored = scan(asImage(rasterize(qr("mirror").transposed(), { module: 5 })), options());
    expect([first(mirrored), mirrored[0]?.mirrored]).toEqual(["mirror", true]);
  });

  it("reads a code on a cylinder of 1.5 widths through the piecewise grid, and 10 % of damage through erasures", () => {
    for (const v of [10, 20]) {
      const text = `cyl${v}` + "x".repeat(v * 3), m = qr(text, v), p = rasterize(m, { module: 4, quiet: 6 });
      expect([v, first(scan(asImage(cylinder(p, 1.5 * (m.width + 12) * 4)), options({ tryHarder: true })))]).toEqual([v, text]);
    }
    const p = rasterize(qr("damaged", 5, "H"), { module: 6 });
    const result = scan(asImage(damage(p, p.corners, 0.1, 11)), options({ tryHarder: true }))[0]!;
    expect([result.text, result.ecc.corrected > 0, result.confidence >= 0.5]).toEqual(["damaged", true, true]);
  });

  it("finds every code with multiple and the largest one without, and merges a code found twice", () => {
    const small = rasterize(qr("small", 1), { module: 4 }), big = rasterize(qr("big", 5), { module: 6 });
    const sheet = compose(680, 420, [{ plane: small, x: 10, y: 100 }, { plane: big, x: 240, y: 10 }]);
    expect(scan(asImage(sheet), options({ multiple: true })).map((r) => r.text).sort()).toEqual(["big", "small"]);
    expect(scan(asImage(sheet), options()).map((r) => r.text)).toEqual(["big"]);
    // a QR nested in a QR (its quiet zone painted over the outer one's data): the outer wins without multiple
    const inner = rasterize(qr("inner", 1), { module: 3, quiet: 2 });
    const outer = rasterize(qr("outer", 10), { module: 7, quiet: 4 });
    const nested = compose(outer.width, outer.height, [{ plane: outer, x: 0, y: 0 }, { plane: inner, x: Math.round(outer.width / 2 - inner.width / 2), y: Math.round(outer.height / 2 - inner.height / 2), opaque: true }]);
    expect(scan(asImage(nested), options({ tryHarder: true })).map((r) => r.text)).toEqual(["outer"]);
    expect(scan(asImage(nested), options({ tryHarder: true, multiple: true })).map((r) => r.text).sort()).toEqual(["inner", "outer"]);
  });

  it("is deterministic and keeps the deadline on a 12 MP noise frame", () => {
    const p = blur(rasterize(qr("same"), { module: 4, rotate: 20 }), 1);
    expect(JSON.stringify(scan(asImage(p), options()))).toBe(JSON.stringify(scan(asImage(p), options())));
    const W = 4000, H = 3000, data = new Uint8Array(W * H);
    let s = 5;
    for (let i = 0; i < data.length; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; data[i] = s & 255; }
    const t0 = performance.now(), results = scan({ width: W, height: H, data, format: "gray" }, { decoders: [qrFamily], tryHarder: true });
    expect([results, performance.now() - t0 < 550]).toEqual([[], true]);
  }, 20_000);

  it("decodes a 1080p frame with one clean QR within the budget's guard (median under 80 ms)", () => {
    const frame = asImage(rasterize(qr("https://example.com/frame", 4), { module: 8, width: 1920, height: 1080 }));
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now(), results = scan(frame, { decoders: [qrFamily], deadlineMs: 1000 });
      times.push(performance.now() - t0);
      expect(first(results)).toBe("https://example.com/frame");
    }
    times.sort((a, b) => a - b);
    expect(times[3]).toBeLessThan(80);
  }, 20_000);

  it("reports nothing on 500 generated images without codes", () => {
    let s = 11;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    let positives = 0;
    for (let i = 0; i < 500; i++) {
      const w = 160 + Math.floor(rnd() * 200), h = 120 + Math.floor(rnd() * 160), data = new Uint8Array(w * h), kind = i % 5;
      for (let k = 0; k < data.length; k++) {
        const x = k % w, y = Math.floor(k / w);
        data[k] = kind === 0 ? (rnd() < 0.5 ? 0 : 255) : kind === 1 ? ((x >> 3) % 2 === 0 ? 30 : 220) : kind === 2 ? (((x >> 4) + (y >> 4)) % 2 === 0 ? 20 : 230) : kind === 3 ? (y % 12 < 2 || x % 9 === 0 ? 40 : 235) : Math.floor(rnd() * 256);
      }
      if (scan({ width: w, height: h, data, format: "gray" }, { decoders: [qrFamily], tryHarder: true, deadlineMs: 300 }).length > 0) positives++;
    }
    expect(positives).toBe(0);
  }, 120_000);

  it("samples under the edge pass against a gray threshold, never against the Sobel magnitude", () => {
    // dark 90 would read light against a Sobel-magnitude threshold on a step of 120, so the decode can only succeed on a gray binarization
    const r = rasterize(qr("edge"), { module: 5, dark: 90, light: 210 });
    const ctx = new ScanContext(asImage(r), options({ tryHarder: true }));
    const edge = { id: "edge", inverted: false, flat: false } as const;
    ctx.pass = edge;
    let candidates = qrFamily.locate(ctx);
    if (candidates.length === 0) {
      // the edge map holds outlines, not 1:1:3:1:1 runs: take the candidate from the hybrid pass and decode it under the edge pass
      ctx.pass = { id: "hybrid", inverted: false, flat: false };
      candidates = qrFamily.locate(ctx);
      ctx.pass = edge;
    }
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(qrFamily.decode(ctx, candidates[0]!)?.text).toBe("edge");
    expect(ctx.binarize(0, "edge", false, false).thresholdAt(0, 0)).toBeLessThan(90);
    expect(ctx.log.some((e) => (e as { sampled?: string }).sampled === "hybrid")).toBe(true);
  });
});

describe("qrFamily on Micro QR and rMQR", () => {
  it("decodes every Micro QR version at three rotations with its version and level", () => {
    for (const [v, level, text] of [[1, "L", "123"], [2, "L", "AB12"], [3, "M", "Hi!"], [4, "Q", "HELLO"]] as const) for (const rotate of [0, 20, 100]) {
      const m = encodeSymbol("micro", v, level, segmentsFor(text))!.matrix;
      const r = scan(asImage(rasterize(m, { module: 6, rotate })), options())[0];
      expect([v, rotate, r?.text, r?.symbology, r?.symbol.version, r?.ecc.level]).toEqual([v, rotate, text, "micro-qr", `M${v}`, level]);
    }
  });

  it("decodes rMQR from R7x43 to R17x139 at three rotations", () => {
    for (const [v, level, text] of [[1, "M", "123"], [11, "M", "ok"], [12, "H", "RMQR"], [22, "M", "rMQR ok"], [32, "H", "wide"]] as const) for (const rotate of [0, 10, 180]) {
      const m = encodeSymbol("rmqr", v, level, segmentsFor(text))!.matrix;
      const r = scan(asImage(rasterize(m, { module: 5, rotate })), options())[0];
      expect([v, rotate, r?.text, r?.symbology, r?.symbol.cols, r?.symbol.rows]).toEqual([v, rotate, text, "rmqr", m.width, m.height]);
    }
  });

  it("reads a horizontally flipped rMQR as mirrored, through the reflected finder orientations", () => {
    const flipH = (p: GrayPlane): GrayPlane => {
      const data = new Uint8Array(p.data.length);
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) data[y * p.width + x] = p.data[y * p.width + (p.width - 1 - x)]!;
      return { width: p.width, height: p.height, data };
    };
    const m = encodeSymbol("rmqr", 12, "H", segmentsFor("RMQR"))!.matrix, r = rasterize(m, { module: 5, rotate: 10 });
    const upright = scan(asImage(r), options())[0], mirrored = scan(asImage(flipH(r)), options())[0];
    expect([upright?.text, upright?.mirrored]).toEqual(["RMQR", false]);
    expect([mirrored?.text, mirrored?.symbology, mirrored?.mirrored, mirrored?.symbol.cols, mirrored?.symbol.rows]).toEqual(["RMQR", "rmqr", true, m.width, m.height]);
  });

  it("logs its passes in the context for tests", () => {
    const ctx = new ScanContext(asImage(rasterize(qr("log"), { module: 5 })), options());
    ctx.pass = { id: "hybrid", inverted: false, flat: false };
    const candidates = qrFamily.locate(ctx);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(qrFamily.decode(ctx, candidates[0]!)?.text).toBe("log");
    expect(ctx.log.length).toBeGreaterThanOrEqual(2);
  });
});
