// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyLut, bilinear, contrastLut, crop, downsample2, flattenLighting, integral, quarterSpread, toGray, upscale2, type GrayPlane } from "./image";

const plane = (width: number, height: number, fill: (x: number, y: number) => number): GrayPlane => {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fill(x, y);
  return { width, height, data };
};

describe("toGray", () => {
  it("converts RGBA with BT.601 integer weights and ignores alpha", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 128, 200, 100, 50, 255]);
    const gray = toGray({ width: 4, height: 1, data: rgba, format: "rgba" });
    expect([...gray.data]).toEqual([(77 * 255) >> 8, (150 * 255) >> 8, (29 * 255) >> 8, (77 * 200 + 150 * 100 + 29 * 50) >> 8]);
  });

  it("takes a gray buffer as it is, and throws on a buffer that does not fit the size", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
    expect(toGray({ width: 3, height: 2, data, format: "gray" }).data).toBe(data);
    expect(() => toGray({ width: 3, height: 2, data: new Uint8Array(5), format: "gray" })).toThrow(RangeError);
    expect(() => toGray({ width: 2, height: 2, data: new Uint8ClampedArray(12), format: "rgba" })).toThrow(/16 bytes/);
  });

  it("crops a region, clamped to the plane", () => {
    const p = plane(6, 4, (x, y) => y * 6 + x);
    const c = crop(p, { x: 4, y: 2, width: 10, height: 10 });
    expect([c.width, c.height, [...c.data]]).toEqual([2, 2, [16, 17, 22, 23]]);
  });
});

describe("the pyramid", () => {
  it("halves a plane with 2×2 means, dropping an odd last row or column", () => {
    const p = plane(5, 3, (x, y) => (x + y) * 10);
    const half = downsample2(p);
    expect([half.width, half.height, [...half.data]]).toEqual([2, 1, [10, 30]]);
  });

  it("doubles a plane: a constant stays constant, a ramp stays monotonic and keeps its ends", () => {
    const flat = upscale2(plane(4, 4, () => 77));
    expect([flat.width, flat.height, new Set(flat.data).size]).toEqual([8, 8, 1]);
    const ramp = upscale2(plane(8, 2, (x) => x * 30));
    const row = [...ramp.data.subarray(0, 16)];
    for (let i = 1; i < row.length; i++) expect(row[i]).toBeGreaterThanOrEqual(row[i - 1]!);
    // Catmull–Rom overshoots a little where the edge clamps: the ends stay within 6 of the ramp's values
    expect(row[0]).toBeLessThanOrEqual(6);
    expect(Math.abs(row[15]! - 210)).toBeLessThanOrEqual(6);
  });

  it("samples bilinearly between pixel centres and clamps outside", () => {
    const p = plane(3, 1, (x) => x * 100);
    expect(bilinear(p, 0.5, 0.5)).toBe(0);
    expect(bilinear(p, 1.0, 0.5)).toBe(50);
    expect(bilinear(p, 2.5, 0.5)).toBe(200);
    expect(bilinear(p, -3, 9)).toBe(0);
    expect(bilinear(p, 30, 0.5)).toBe(200);
  });
});

describe("integral images", () => {
  it("gives box sums and sums of squares equal to brute force", () => {
    const p = plane(7, 5, (x, y) => (x * 31 + y * 17) % 256);
    const I = integral(p);
    for (const [x0, y0, x1, y1] of [[0, 0, 7, 5], [2, 1, 5, 4], [3, 3, 4, 4], [0, 4, 7, 5]] as const) {
      let s = 0, q = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += p.data[y * 7 + x]!; q += p.data[y * 7 + x]! ** 2; }
      expect([I.sum(x0, y0, x1, y1), I.sumSq(x0, y0, x1, y1)]).toEqual([s, q]);
    }
  });
});

describe("lighting", () => {
  it("stretches between the 1st and 99th percentiles, and leaves a full-range plane alone", () => {
    const narrow = plane(64, 64, (x, y) => 100 + ((x * 7 + y * 3) % 50));
    const lut = contrastLut(narrow)!;
    expect(lut).not.toBeNull();
    expect(lut[100]).toBeLessThanOrEqual(2);
    expect(lut[149]).toBeGreaterThanOrEqual(253);
    expect(lut[125]).toBeGreaterThan(110);
    expect(lut[125]).toBeLessThan(145);
    const stretched = applyLut(narrow, lut);
    expect(Math.max(...stretched.data) - Math.min(...stretched.data)).toBeGreaterThan(240);
    expect(contrastLut(plane(64, 64, (x) => (x * 4) % 256))).toBeNull();
  });

  it("measures uneven lighting as the spread of the quarters' means", () => {
    expect(quarterSpread(plane(128, 128, (x) => (x * 255) / 127))).toBeGreaterThan(0.4);
    expect(quarterSpread(plane(128, 128, (x, y) => (((x >> 4) + (y >> 4)) % 2 === 0 ? 40 : 220)))).toBeLessThan(0.05);
  });

  it("flattens a lighting gradient: a lit checkerboard's quarters come out alike and its cells stay apart", () => {
    const lit = plane(128, 128, (x, y) => (((x >> 4) + (y >> 4)) % 2 === 0 ? 40 : 220) * (1 - (0.7 * x) / 128));
    const flat = flattenLighting(lit);
    expect(quarterSpread(flat)).toBeLessThan(quarterSpread(lit) / 2);
    // on the dim right side a dark cell (x = 100, column 6) is still far below a light cell (x = 120, column 7)
    expect(lit.data[8 * 128 + 120]! - lit.data[8 * 128 + 100]!).toBeLessThan(80);
    expect(flat.data[8 * 128 + 120]! - flat.data[8 * 128 + 100]!).toBeGreaterThan(150);
  });
});
