// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hybrid, otsu } from "./binarize";
import { applyH, homographyFromCorners, homographyFromPairs, invert3, mul3, piecewiseMap, ransacHomography, solveLinear, xorshift, type Pair } from "./geometry";
import type { GrayPlane } from "./image";
import { sampleGrid } from "./sample";

const near = (a: readonly number[], b: readonly number[], tolerance: number): boolean => a.every((v, i) => Math.abs(v - b[i]!) <= tolerance);

describe("homographies", () => {
  it("solves a linear system and inverts a 3×3 matrix", () => {
    expect(solveLinear([[2, 1], [1, 3]], [5, 10])).toEqual([1, 3]);
    expect(solveLinear([[1, 2], [2, 4]], [3, 6])).toBeNull();
    const H = [1.2, 0.1, 30, -0.05, 0.9, 20, 0.0004, -0.0002, 1];
    const I = mul3(H, invert3(H)!);
    expect(near(I.map((v) => v / I[8]!), [1, 0, 0, 0, 1, 0, 0, 0, 1], 1e-9)).toBe(true);
  });

  it("maps four corners exactly and round-trips through the inverse", () => {
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [[10, 12], [95, 8], [102, 99], [7, 90]];
    const H = homographyFromCorners(21, 21, corners)!;
    for (const [[u, v], [x, y]] of [[[0, 0], corners[0]], [[21, 0], corners[1]], [[21, 21], corners[2]], [[0, 21], corners[3]]] as const) expect(near(applyH(H, u, v), [x, y], 1e-6)).toBe(true);
    const back = invert3(H)!;
    expect(near(applyH(back, ...applyH(H, 7.5, 13.25)), [7.5, 13.25], 1e-6)).toBe(true);
  });

  it("recovers a known homography from noisy pairs by least squares, and with outliers by RANSAC in a fixed order", () => {
    const G = [1.2, 0.1, 30, -0.05, 0.9, 20, 0.0004, -0.0002, 1];
    const pairs: Pair[] = [];
    for (let i = 0; i < 12; i++) {
      const u = (i * 37) % 100, v = (i * 53) % 100, [x, y] = applyH(G, u, v);
      pairs.push({ u, v, x: x + ((i % 3) - 1) * 0.1, y: y - ((i % 2) - 0.5) * 0.1 });
    }
    const error = (H: number[]): number => Math.max(...[0, 25, 50, 75, 100].flatMap((u) => [0, 25, 50, 75, 100].map((v) => { const a = applyH(G, u, v), b = applyH(H, u, v); return Math.hypot(a[0] - b[0], a[1] - b[1]); })));
    expect(error(homographyFromPairs(pairs)!)).toBeLessThan(0.3);
    const withOutliers = [...pairs, { u: 50, v: 50, x: 5, y: 5 }, { u: 10, v: 90, x: 300, y: 1 }, { u: 80, v: 20, x: 0, y: 200 }];
    expect(error(homographyFromPairs(withOutliers)!)).toBeGreaterThan(5);
    const R = ransacHomography(withOutliers, 1.0)!;
    expect(error(R)).toBeLessThan(0.3);
    expect(ransacHomography(withOutliers, 1.0)).toEqual(R);
    expect(homographyFromPairs(pairs.slice(0, 3))).toBeNull();
  });

  it("draws the same sequence from a seed", () => {
    const a = xorshift(7), b = xorshift(7), c = xorshift(8);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("maps through the cell that holds the point, and extrapolates past the first and last node", () => {
    // a bent surface: 4 px per module up to u = 14.5, 6 px per module beyond (continuous at the node)
    const cornerAt = (u: number, v: number): [number, number] => [u <= 14.5 ? 4 * u : 58 + 6 * (u - 14.5), 4 * v];
    const map = piecewiseMap([6.5, 14.5, 22.5], [6.5, 14.5, 22.5], cornerAt);
    expect(near(map(8, 8), [32, 32], 1e-6)).toBe(true);
    expect(near(map(20, 8), [91, 32], 1e-6)).toBe(true);
    expect(near(map(0, 0), [0, 0], 1e-6)).toBe(true);
    expect(near(map(29, 29), [145, 116], 1e-6)).toBe(true);
    // a true homography is reproduced in every cell
    const G = [1.2, 0.1, 30, -0.05, 0.9, 20, 0.0004, -0.0002, 1];
    const exact = piecewiseMap([6.5, 22.5, 38.5], [6.5, 22.5, 38.5], (u, v) => applyH(G, u, v));
    for (const [u, v] of [[3.5, 3.5], [20, 30], [44, 44]] as const) expect(near(exact(u, v), applyH(G, u, v), 1e-6)).toBe(true);
  });
});

describe("sampleGrid", () => {
  const checker = (size: number, module: number): GrayPlane => {
    const data = new Uint8Array(size * size * module * module);
    for (let y = 0; y < size * module; y++) for (let x = 0; x < size * module; x++) data[y * size * module + x] = (Math.floor(x / module) + Math.floor(y / module)) % 2 === 0 ? 30 : 225;
    return { width: size * module, height: size * module, data };
  };
  it("reads a checkerboard exactly; a clean module sits half the local range from the threshold (confidence 0.5)", () => {
    // 4 px modules on a 40 px plane: every 8 px hybrid block holds 2 dark and 2 light modules, so its threshold is the midpoint 127.5
    const gray = checker(10, 4), bin = hybrid(gray);
    const H = homographyFromCorners(10, 10, [[0, 0], [40, 0], [40, 40], [0, 40]])!;
    const grid = sampleGrid(gray, bin, (u, v) => applyH(H, u, v), 10, 10)!;
    for (let v = 0; v < 10; v++) for (let u = 0; u < 10; u++) expect(grid.get(u, v)).toBe((u + v) % 2 === 0);
    expect(Math.min(...grid.confidence)).toBeGreaterThan(0.45);
    expect(Math.max(...grid.confidence)).toBeLessThanOrEqual(0.5);
    // a faint board under a global threshold: the same bits, far less confidence (the spec's erasure candidates)
    const faint: GrayPlane = { ...gray, data: gray.data.map((v) => 110 + Math.round((v - 128) / 16)) };
    const soft = sampleGrid(faint, otsu(faint), (u, v) => applyH(H, u, v), 10, 10)!;
    for (let v = 0; v < 10; v++) for (let u = 0; u < 10; u++) expect(soft.get(u, v)).toBe((u + v) % 2 === 0);
    expect(Math.max(...soft.confidence)).toBeLessThan(0.15);
  });

  it("returns null when a module centre falls outside the plane", () => {
    const gray = checker(10, 4), bin = hybrid(gray);
    const H = homographyFromCorners(10, 10, [[20, 20], [60, 20], [60, 60], [20, 60]])!;
    expect(sampleGrid(gray, bin, (u, v) => applyH(H, u, v), 10, 10)).toBeNull();
  });
});
