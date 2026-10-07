import type { Binarization } from "./binarize";
import { bilinear, type GrayPlane } from "./image";
import type { Point } from "./types";

/** Sampled modules: a bit and a confidence 0…1 for each. */
export class SoftGrid {
  readonly width: number;
  readonly height: number;
  readonly bits: Uint8Array;
  readonly confidence: Float32Array;
  constructor(width: number, height: number, bits?: Uint8Array, confidence?: Float32Array) {
    this.width = width;
    this.height = height;
    this.bits = bits ?? new Uint8Array(width * height);
    this.confidence = confidence ?? new Float32Array(width * height);
  }
  get(u: number, v: number): boolean {
    return this.bits[v * this.width + u] === 1;
  }
}

const WEIGHTS = [1, 2, 1, 2, 4, 2, 1, 2, 1], OFFSETS = [-0.25, 0, 0.25];

/**
 * Samples a width × height module grid: the gray at each module centre (a 3×3 weighted bilinear sample a quarter
 * module apart), the bit by the binarization's threshold there, the confidence by the distance to it over the local
 * contrast. Null when a centre falls outside the plane by more than a pixel.
 */
export function sampleGrid(gray: GrayPlane, bin: Binarization, map: (u: number, v: number) => Point, width: number, height: number): SoftGrid | null {
  const grid = new SoftGrid(width, height);
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const [cx, cy] = map(u + 0.5, v + 0.5);
      if (cx < -1 || cy < -1 || cx > gray.width + 1 || cy > gray.height + 1) return null;
      let g = 0, k = 0;
      for (const oy of OFFSETS) for (const ox of OFFSETS) { const [sx, sy] = map(u + 0.5 + ox, v + 0.5 + oy); g += WEIGHTS[k++]! * bilinear(gray, sx, sy); }
      g /= 16;
      const xi = Math.min(gray.width - 1, Math.max(0, Math.round(cx))), yi = Math.min(gray.height - 1, Math.max(0, Math.round(cy)));
      const T = bin.thresholdAt(xi, yi), C = bin.contrastAt(xi, yi);
      grid.bits[v * width + u] = g < T ? 1 : 0;
      grid.confidence[v * width + u] = Math.max(0, Math.min(1, Math.abs(g - T) / Math.max(1, C)));
    }
  }
  return grid;
}
