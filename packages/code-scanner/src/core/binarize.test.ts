// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BINARIZERS, CASCADE_COST, edge, hybrid, LazyBitPlane, otsu, otsuThreshold, sauvola, wolf, type Binarization } from "./binarize";
import type { GrayPlane } from "./image";

const plane = (width: number, height: number, fill: (x: number, y: number) => number): GrayPlane => {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = Math.max(0, Math.min(255, Math.round(fill(x, y))));
  return { width, height, data };
};
/** A checkerboard of 8 px cells (dark 40, light 220), lit from the right by a gradient of `strength`. */
const board = (strength: number) => plane(96, 96, (x, y) => (((x >> 3) + (y >> 3)) % 2 === 0 ? 40 : 220) * (1 - (strength * x) / 96));
const truth = (x: number, y: number) => ((x >> 3) + (y >> 3)) % 2 === 0;
function agreement(b: Binarization, fill: (x: number, y: number) => boolean): number {
  let same = 0;
  for (let y = 0; y < b.plane.height; y++) for (let x = 0; x < b.plane.width; x++) if (b.plane.get(x, y) === fill(x, y)) same++;
  return same / (b.plane.width * b.plane.height);
}
/** Noise with a seed (xorshift32), so the test never flakes. */
function noisy(width: number, height: number, base: number, amplitude: number, seed: number): GrayPlane {
  let s = seed >>> 0 || 1;
  return plane(width, height, () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return base + (s / 4294967296 - 0.5) * 2 * amplitude;
  });
}

describe("Otsu", () => {
  it("puts the threshold between two modes", () => {
    const t = otsuThreshold(plane(32, 32, (x) => (x < 16 ? 50 : 200)));
    expect(t).toBeGreaterThanOrEqual(50);
    expect(t).toBeLessThan(200);
    const b = otsu(board(0));
    expect([b.id, agreement(b, truth), b.contrastAt(3, 3)]).toEqual(["otsu", 1, 255]);
  });
});

describe("hybrid", () => {
  it("binarizes a clean board exactly, with per-block thresholds between the two values", () => {
    const b = hybrid(board(0));
    expect([b.id, agreement(b, truth)]).toEqual(["hybrid", 1]);
    expect(b.thresholdAt(20, 20)).toBeGreaterThan(40);
    expect(b.thresholdAt(20, 20)).toBeLessThan(220);
    expect(b.contrastAt(20, 20)).toBe(180);
  });

  it("does not turn a flat, slightly noisy plane into speckle (minimum block contrast 24)", () => {
    const light = hybrid(noisy(64, 64, 200, 8, 3));
    let dark = 0;
    for (let i = 0; i < 64 * 64; i++) if (light.plane.get(i % 64, Math.floor(i / 64))) dark++;
    expect(dark).toBe(0);
    const darkPlane = hybrid(noisy(64, 64, 40, 8, 4));
    let lit = 0;
    for (let i = 0; i < 64 * 64; i++) if (!darkPlane.plane.get(i % 64, Math.floor(i / 64))) lit++;
    expect(lit).toBe(0);
  });

  it("gives the same bits lazily, without a bits array", () => {
    const eager = hybrid(board(0.4)), lazy = hybrid(board(0.4), 8, true);
    expect(lazy.plane).toBeInstanceOf(LazyBitPlane);
    expect(agreement(lazy, (x, y) => eager.plane.get(x, y))).toBe(1);
  });
});

describe("Sauvola and Wolf–Jolion", () => {
  it("recover a board under a strong lighting gradient, where Otsu fails", () => {
    const lit = board(0.75);
    expect(agreement(otsu(lit), truth)).toBeLessThan(0.9);
    expect(agreement(sauvola(lit, 8), truth)).toBeGreaterThan(0.97);
    expect(agreement(wolf(lit, 8), truth)).toBeGreaterThan(0.97);
    expect(agreement(hybrid(lit), truth)).toBeGreaterThan(0.97);
  });

  it("clamp the window to 15…63 px around three module sizes, and name themselves", () => {
    expect([sauvola(board(0), 2).id, wolf(board(0), 2).id]).toEqual(["sauvola", "wolf"]);
    // a tiny module gives the smallest window: thresholds still vary across the board
    const s = sauvola(board(0.5), 1);
    expect(s.thresholdAt(4, 4)).not.toBe(s.thresholdAt(90, 4));
  });
});

describe("edge", () => {
  it("marks about the perimeter of a square once, nothing inside or far outside", () => {
    const sq = plane(64, 64, (x, y) => (x >= 16 && x < 48 && y >= 16 && y < 48 ? 30 : 230));
    const e = edge(sq);
    let marked = 0, inside = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (e.plane.get(x, y)) { marked++; if (x > 20 && x < 44 && y > 20 && y < 44) inside++; }
    // a step edge has equal Sobel magnitudes on both of its pixels: the perimeter (128) is marked once or twice
    expect(marked).toBeGreaterThan(100);
    expect(marked).toBeLessThan(320);
    expect(inside).toBe(0);
    expect(e.id).toBe("edge");
  });
});

it("lists every binarizer with its cascade cost", () => {
  expect(Object.keys(BINARIZERS).sort()).toEqual(["edge", "hybrid", "otsu", "sauvola", "wolf"]);
  expect(CASCADE_COST).toEqual({ hybrid: 1, sauvola: 2, wolf: 2, otsu: 0.5, edge: 3 });
  for (const id of Object.keys(BINARIZERS) as (keyof typeof BINARIZERS)[]) expect(BINARIZERS[id](board(0), 8, false).id).toBe(id);
});
