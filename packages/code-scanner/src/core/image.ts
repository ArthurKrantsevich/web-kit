import type { Roi, ScanImage } from "./types";

/** A luminance plane, one byte per pixel, row by row. */
export interface GrayPlane {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Luminance of an image: `(77·R + 150·G + 29·B) >> 8` (BT.601), alpha ignored. A gray buffer is used as it is. */
export function toGray(image: ScanImage): GrayPlane {
  const { width, height, data, format } = image;
  const expected = width * height * (format === "rgba" ? 4 : 1);
  if (data.length !== expected) throw new RangeError(`A ${format} buffer of ${width}×${height} needs ${expected} bytes, got ${data.length}`);
  if (format === "gray") return { width, height, data: data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.length) };
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (77 * data[j]! + 150 * data[j + 1]! + 29 * data[j + 2]!) >> 8;
  return { width, height, data: out };
}

/** The part of a plane inside a region, clamped to the plane. */
export function crop(plane: GrayPlane, roi: Roi): GrayPlane {
  const x0 = Math.max(0, Math.floor(roi.x)), y0 = Math.max(0, Math.floor(roi.y));
  const x1 = Math.min(plane.width, Math.ceil(roi.x + roi.width)), y1 = Math.min(plane.height, Math.ceil(roi.y + roi.height));
  const width = Math.max(0, x1 - x0), height = Math.max(0, y1 - y0), out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) out.set(plane.data.subarray((y0 + y) * plane.width + x0, (y0 + y) * plane.width + x1), y * width);
  return { width, height, data: out };
}

/** The next pyramid level: every pixel the mean of a 2×2 block (an odd last row or column is dropped). */
export function downsample2(plane: GrayPlane): GrayPlane {
  const w = plane.width >> 1, h = plane.height >> 1, out = new Uint8Array(w * h), src = plane.data, sw = plane.width;
  for (let y = 0; y < h; y++) {
    const r0 = 2 * y * sw, r1 = r0 + sw;
    for (let x = 0; x < w; x++) {
      const i = 2 * x;
      out[y * w + x] = (src[r0 + i]! + src[r0 + i + 1]! + src[r1 + i]! + src[r1 + i + 1]! + 2) >> 2;
    }
  }
  return { width: w, height: h, data: out };
}

function cubic(t: number): number {
  const a = Math.abs(t);
  return a < 1 ? 1.5 * a * a * a - 2.5 * a * a + 1 : a < 2 ? -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2 : 0;
}

/** Catmull–Rom bicubic value at (x, y) in pixel-index coordinates (pixel k at k), clamped at the edges. */
export function bicubic(plane: GrayPlane, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let sum = 0, weight = 0;
  for (let j = -1; j <= 2; j++) {
    const yy = Math.min(plane.height - 1, Math.max(0, y0 + j)), wy = cubic(y - (y0 + j));
    for (let i = -1; i <= 2; i++) {
      const xx = Math.min(plane.width - 1, Math.max(0, x0 + i)), w = wy * cubic(x - (x0 + i));
      sum += w * plane.data[yy * plane.width + xx]!;
      weight += w;
    }
  }
  return sum / weight;
}

/** Twice the size by bicubic interpolation, for symbols whose modules are under 2.5 px (tryHarder). */
export function upscale2(plane: GrayPlane): GrayPlane {
  const w = plane.width * 2, h = plane.height * 2, out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = Math.max(0, Math.min(255, Math.round(bicubic(plane, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5))));
  return { width: w, height: h, data: out };
}

/** Bilinear value at a point in pixel coordinates (pixel k spans [k, k + 1), its centre at k + 0.5); clamped outside. */
export function bilinear(plane: GrayPlane, x: number, y: number): number {
  const w = plane.width, h = plane.height, d = plane.data;
  const fx = Math.min(w - 1, Math.max(0, x - 0.5)), fy = Math.min(h - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
  return (d[y0 * w + x0]! * (1 - ax) + d[y0 * w + x1]! * ax) * (1 - ay) + (d[y1 * w + x0]! * (1 - ax) + d[y1 * w + x1]! * ax) * ay;
}

export interface Integral {
  width: number;
  height: number;
  /** Sum over [x0, x1) × [y0, y1). */
  sum(x0: number, y0: number, x1: number, y1: number): number;
  sumSq(x0: number, y0: number, x1: number, y1: number): number;
}

/** Integral images of values and of squares (Float64, exact for 8-bit input). */
export function integral(plane: GrayPlane): Integral {
  const w = plane.width, h = plane.height, W = w + 1;
  const sum = new Float64Array(W * (h + 1)), sq = new Float64Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rs = 0, rq = 0;
    for (let x = 1; x <= w; x++) {
      const v = plane.data[(y - 1) * w + (x - 1)]!;
      rs += v;
      rq += v * v;
      sum[y * W + x] = sum[(y - 1) * W + x]! + rs;
      sq[y * W + x] = sq[(y - 1) * W + x]! + rq;
    }
  }
  const box = (arr: Float64Array, x0: number, y0: number, x1: number, y1: number): number => arr[y1 * W + x1]! - arr[y0 * W + x1]! - arr[y1 * W + x0]! + arr[y0 * W + x0]!;
  return { width: w, height: h, sum: (x0, y0, x1, y1) => box(sum, x0, y0, x1, y1), sumSq: (x0, y0, x1, y1) => box(sq, x0, y0, x1, y1) };
}

/** The histogram tail the contrast stretch clips: 0.05 %, so a code covering 0.1 % of the frame keeps its dark modules. */
const CONTRAST_TAIL = 0.0005;

/**
 * A 256-entry lookup table that stretches the 0.05th…99.95th percentiles to 0…255, or null when the plane already
 * spans 8…247 (nothing to gain). The tails are this small because a small code on a plain background (a label in a
 * photo) is under a percent of the pixels, and a 1 % tail would clip its modules away. The histogram is sampled on
 * large planes.
 */
export function contrastLut(plane: GrayPlane): Uint8Array | null {
  const hist = new Uint32Array(256), step = Math.max(1, Math.floor(plane.data.length / 262144));
  let n = 0;
  for (let i = 0; i < plane.data.length; i += step) { hist[plane.data[i]!]!++; n++; }
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= n * CONTRAST_TAIL) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]!; if (acc >= n * CONTRAST_TAIL) { hi = v; break; } }
  if (hi - lo < 1 || (lo <= 8 && hi >= 247)) return null;
  const lut = new Uint8Array(256), scale = 255 / (hi - lo);
  for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, Math.round((v - lo) * scale)));
  return lut;
}

export function applyLut(plane: GrayPlane, lut: Uint8Array): GrayPlane {
  const out = new Uint8Array(plane.data.length);
  for (let i = 0; i < out.length; i++) out[i] = lut[plane.data[i]!]!;
  return { width: plane.width, height: plane.height, data: out };
}

/** The spread of the four quarters' mean brightness as a share of the range: over 0.25 means uneven lighting. */
export function quarterSpread(plane: GrayPlane): number {
  const w = plane.width, h = plane.height, means: number[] = [];
  for (const [x0, y0] of [[0, 0], [w >> 1, 0], [0, h >> 1], [w >> 1, h >> 1]] as const) {
    let s = 0, c = 0;
    for (let y = y0; y < y0 + (h >> 1); y += 4) for (let x = x0; x < x0 + (w >> 1); x += 4) { s += plane.data[y * w + x]!; c++; }
    means.push(c === 0 ? 0 : s / c);
  }
  return (Math.max(...means) - Math.min(...means)) / 255;
}

/**
 * Lighting correction: the background is a maximum filter over `window` px (on cells of a quarter of it), blurred by a
 * box over the same window, and the plane becomes I' = (I − min) / (bg − min), clipped to 0…255.
 */
export function flattenLighting(plane: GrayPlane, window: number = 64): GrayPlane {
  const w = plane.width, h = plane.height, src = plane.data;
  const cell = Math.max(8, window >> 2), cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
  const mx = new Uint8Array(cw * ch), mn = new Uint8Array(cw * ch).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = Math.floor(y / cell) * cw + Math.floor(x / cell), v = src[y * w + x]!;
      if (v > mx[c]!) mx[c] = v;
      if (v < mn[c]!) mn[c] = v;
    }
  }
  const r = Math.max(1, (window / cell) >> 1), bg = new Float32Array(cw * ch), low = new Float32Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      let s = 0, n = 0, lo = 255;
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          const yy = cy + j, xx = cx + i;
          if (yy < 0 || xx < 0 || yy >= ch || xx >= cw) continue;
          s += mx[yy * cw + xx]!;
          lo = Math.min(lo, mn[yy * cw + xx]!);
          n++;
        }
      }
      bg[cy * cw + cx] = s / n;
      low[cy * cw + cx] = lo;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = Math.floor(y / cell) * cw + Math.floor(x / cell), range = Math.max(16, bg[c]! - low[c]!);
      out[y * w + x] = Math.max(0, Math.min(255, Math.round(((src[y * w + x]! - low[c]!) * 255) / range)));
    }
  }
  return { width: w, height: h, data: out };
}
