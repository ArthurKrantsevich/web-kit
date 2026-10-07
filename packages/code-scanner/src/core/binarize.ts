import { integral, type GrayPlane } from "./image";
import type { BinarizerId } from "./types";

/** A binary plane: 1 = dark. */
export class BitPlane {
  readonly width: number;
  readonly height: number;
  readonly bits: Uint8Array;
  constructor(width: number, height: number, bits?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.bits = bits ?? new Uint8Array(width * height);
  }
  get(x: number, y: number): boolean {
    return this.bits[y * this.width + x] === 1;
  }
}

/** A bit plane that compares the gray with the threshold map when asked: nothing is computed for pixels never read. */
export class LazyBitPlane {
  readonly width: number;
  readonly height: number;
  private readonly gray: GrayPlane;
  private readonly thresholdAt: (x: number, y: number) => number;
  constructor(gray: GrayPlane, thresholdAt: (x: number, y: number) => number) {
    this.width = gray.width;
    this.height = gray.height;
    this.gray = gray;
    this.thresholdAt = thresholdAt;
  }
  get(x: number, y: number): boolean {
    return this.gray.data[y * this.width + x]! < this.thresholdAt(x, y);
  }
}

export type Plane = BitPlane | LazyBitPlane;

/** A binarization: the bit plane, and at every pixel the threshold used and the local contrast behind it. */
export interface Binarization {
  id: BinarizerId;
  plane: Plane;
  thresholdAt(x: number, y: number): number;
  contrastAt(x: number, y: number): number;
}

/** Relative cost of each binarizer, the cascade's order within a polarity (spec §4.3). */
export const CASCADE_COST: Readonly<Record<BinarizerId, number>> = { hybrid: 1, sauvola: 2, wolf: 2, otsu: 0.5, edge: 3 };

function fromThresholdMap(id: BinarizerId, plane: GrayPlane, thresholdAt: (x: number, y: number) => number, contrastAt: (x: number, y: number) => number, lazy: boolean): Binarization {
  if (lazy) return { id, plane: new LazyBitPlane(plane, thresholdAt), thresholdAt, contrastAt };
  const w = plane.width, h = plane.height, bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bits[y * w + x] = plane.data[y * w + x]! < thresholdAt(x, y) ? 1 : 0;
  return { id, plane: new BitPlane(w, h, bits), thresholdAt, contrastAt };
}

/**
 * Otsu's global threshold, for `gray < T`: the value that maximizes the between-class variance. When several values tie
 * (a gap between two modes), the middle of the gap, so a clean two-tone plane is not cut at the edge of its dark mode.
 */
export function otsuThreshold(plane: GrayPlane): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < plane.data.length; i++) hist[plane.data[i]!]!++;
  const total = plane.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0, wB = 0, first = 0, last = 0, bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) { bestVar = v; first = last = t; } else if (v === bestVar) last = t;
  }
  // class 0 is every value up to and including t, so the `<` threshold is t + 1
  return (first + last + 2) >> 1;
}

/** A global Otsu threshold: clean scans and screens. Contrast is the full range. */
export function otsu(plane: GrayPlane, _moduleSize: number = 5, lazy: boolean = false): Binarization {
  const t = otsuThreshold(plane);
  return fromThresholdMap("otsu", plane, () => t, () => 255, lazy);
}

/**
 * ZXing's hybrid binarizer with two changes: a block whose 5×5 neighbourhood has less than 24 of contrast is flat
 * (all light when its minimum is 128 or more, all dark when its maximum is under 128), and the contrast map is kept.
 */
export function hybrid(plane: GrayPlane, _moduleSize: number = 5, lazy: boolean = false): Binarization {
  const w = plane.width, h = plane.height, B = 8, bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  const mins = new Uint8Array(bw * bh), maxs = new Uint8Array(bw * bh), means = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let lo = 255, hi = 0, s = 0, n = 0;
      for (let y = by * B; y < Math.min(h, by * B + B); y++) {
        for (let x = bx * B; x < Math.min(w, bx * B + B); x++) {
          const v = plane.data[y * w + x]!;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
          s += v;
          n++;
        }
      }
      mins[by * bw + bx] = lo;
      maxs[by * bw + bx] = hi;
      means[by * bw + bx] = s / n;
    }
  }
  const thr = new Float32Array(bw * bh), ctr = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let s = 0, n = 0, lo = 255, hi = 0;
      for (let j = -2; j <= 2; j++) {
        for (let i = -2; i <= 2; i++) {
          const yy = Math.min(bh - 1, Math.max(0, by + j)), xx = Math.min(bw - 1, Math.max(0, bx + i));
          s += means[yy * bw + xx]!;
          n++;
          lo = Math.min(lo, mins[yy * bw + xx]!);
          hi = Math.max(hi, maxs[yy * bw + xx]!);
        }
      }
      const contrast = hi - lo, mean = s / n;
      thr[by * bw + bx] = contrast >= 24 ? mean : hi < 128 ? 256 : lo >= 128 ? 0 : mean;
      ctr[by * bw + bx] = Math.max(contrast, 24);
    }
  }
  const block = (x: number, y: number): number => Math.min(bh - 1, y >> 3) * bw + Math.min(bw - 1, x >> 3);
  return fromThresholdMap("hybrid", plane, (x, y) => thr[block(x, y)]!, (x, y) => ctr[block(x, y)]!, lazy);
}

const windowFor = (moduleSize: number): number => (Math.max(15, Math.min(63, Math.round(3 * moduleSize))) | 1);

/** Local mean and deviation over the window at every pixel, from integral images. */
function localStats(plane: GrayPlane, moduleSize: number): { mean: Float32Array; deviation: Float32Array; max: number } {
  const r = windowFor(moduleSize) >> 1, I = integral(plane), w = plane.width, h = plane.height;
  const mean = new Float32Array(w * h), deviation = new Float32Array(w * h);
  let max = 0;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (x1 - x0) * (y1 - y0);
      const m = I.sum(x0, y0, x1, y1) / n, s = Math.sqrt(Math.max(0, I.sumSq(x0, y0, x1, y1) / n - m * m));
      mean[y * w + x] = m;
      deviation[y * w + x] = s;
      if (s > max) max = s;
    }
  }
  return { mean, deviation, max };
}

/** Sauvola: T = m·(1 + k·(s/R − 1)), window clamp(3·module, 15, 63), k = 0.2, R = 128. */
export function sauvola(plane: GrayPlane, moduleSize: number = 5, lazy: boolean = false, k: number = 0.2, R: number = 128): Binarization {
  const { mean, deviation } = localStats(plane, moduleSize), w = plane.width;
  const thr = new Float32Array(mean.length);
  for (let i = 0; i < thr.length; i++) thr[i] = mean[i]! * (1 + k * (deviation[i]! / R - 1));
  return fromThresholdMap("sauvola", plane, (x, y) => thr[y * w + x]!, (x, y) => Math.max(24, 4 * deviation[y * w + x]!), lazy);
}

/** Wolf–Jolion: T = m − a·(1 − s/s_max)·(m − M), M the plane's minimum, s_max the largest deviation, a = 0.5. */
export function wolf(plane: GrayPlane, moduleSize: number = 5, lazy: boolean = false, a: number = 0.5): Binarization {
  const { mean, deviation, max } = localStats(plane, moduleSize), w = plane.width;
  let M = 255;
  for (let i = 0; i < plane.data.length; i++) if (plane.data[i]! < M) M = plane.data[i]!;
  const thr = new Float32Array(mean.length);
  for (let i = 0; i < thr.length; i++) thr[i] = mean[i]! - a * (1 - deviation[i]! / (max || 1)) * (mean[i]! - M);
  return fromThresholdMap("wolf", plane, (x, y) => thr[y * w + x]!, (x, y) => Math.max(24, 4 * deviation[y * w + x]!), lazy);
}

/** Edges: Sobel magnitude with non-maximum suppression along the gradient, thresholded by Otsu over the magnitudes. */
export function edge(plane: GrayPlane): Binarization {
  const w = plane.width, h = plane.height, d = plane.data, mag = new Uint8Array(w * h), gx = new Int16Array(w * h), gy = new Int16Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const sx = -d[i - w - 1]! - 2 * d[i - 1]! - d[i + w - 1]! + d[i - w + 1]! + 2 * d[i + 1]! + d[i + w + 1]!;
      const sy = -d[i - w - 1]! - 2 * d[i - w]! - d[i - w + 1]! + d[i + w - 1]! + 2 * d[i + w]! + d[i + w + 1]!;
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.min(255, (Math.abs(sx) + Math.abs(sy)) >> 2);
    }
  }
  const t = Math.max(8, otsuThreshold({ width: w, height: h, data: mag }));
  const bits = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, m = mag[i]!;
      if (m < t) continue;
      const along = Math.abs(gx[i]!) > Math.abs(gy[i]!);
      const n1 = along ? i - 1 : i - w, n2 = along ? i + 1 : i + w;
      if (m >= mag[n1]! && m >= mag[n2]!) bits[i] = 1;
    }
  }
  return { id: "edge", plane: new BitPlane(w, h, bits), thresholdAt: () => t, contrastAt: () => 255 };
}

export const BINARIZERS: Readonly<Record<BinarizerId, (plane: GrayPlane, moduleSize: number, lazy: boolean) => Binarization>> = {
  hybrid: (plane, moduleSize, lazy) => hybrid(plane, moduleSize, lazy),
  sauvola: (plane, moduleSize, lazy) => sauvola(plane, moduleSize, lazy),
  otsu: (plane, moduleSize, lazy) => otsu(plane, moduleSize, lazy),
  wolf: (plane, moduleSize, lazy) => wolf(plane, moduleSize, lazy),
  edge: (plane) => edge(plane),
};
