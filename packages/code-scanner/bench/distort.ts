// Rasterizing a module matrix into a gray image, with geometric and photometric distortions. Deterministic: every
// random choice comes from a seeded xorshift. Shared by the tests (round trips, the stress corpus) and the benchmark.
import { applyH, homographyFromCorners, invert3, xorshift } from "../src/core/geometry";
import { bilinear, type GrayPlane } from "../src/core/image";
import type { Point, ScanImage } from "../src/core/types";
import type { BitMatrix } from "../src/qr/layout";

export interface Raster extends GrayPlane {
  /** The symbol's corners in the image, clockwise from its top-left. */
  corners: Point[];
}

export interface RasterOptions {
  /** Pixels per module. */
  module?: number;
  /** Quiet zone in modules. */
  quiet?: number;
  /** Degrees, clockwise on screen (y points down), the same sense as `ScanResult.orientation`. */
  rotate?: number;
  /** 0…1: how much the right edge is shortened (a vertical axis tilted away from the camera). */
  tilt?: number;
  width?: number;
  height?: number;
  dark?: number;
  light?: number;
  offsetX?: number;
  offsetY?: number;
}

export function rasterize(matrix: BitMatrix, { module = 4, quiet = 4, rotate = 0, tilt = 0, width, height, dark = 0, light = 255, offsetX = 0, offsetY = 0 }: RasterOptions = {}): Raster {
  const sw = (matrix.width + 2 * quiet) * module, sh = (matrix.height + 2 * quiet) * module;
  const W = width ?? Math.ceil(Math.hypot(sw, sh)) + 8, H = height ?? W;
  const cx = W / 2 + offsetX, cy = H / 2 + offsetY, a = (rotate * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), k = 1 - tilt;
  const base: Point[] = [[-sw / 2, -sh / 2], [sw / 2, (-sh / 2) * k], [sw / 2, (sh / 2) * k], [-sw / 2, sh / 2]];
  const corners = base.map(([x, y]): Point => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
  const H2 = homographyFromCorners(matrix.width + 2 * quiet, matrix.height + 2 * quiet, corners)!, inv = invert3(H2)!;
  const data = new Uint8Array(W * H).fill(light);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0; // 2×2 supersampling
      for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const) {
        const [u, v] = applyH(inv, x + dx, y + dy), mu = Math.floor(u) - quiet, mv = Math.floor(v) - quiet;
        s += mu >= 0 && mv >= 0 && mu < matrix.width && mv < matrix.height && matrix.get(mu, mv) ? dark : light;
      }
      data[y * W + x] = Math.round(s / 4);
    }
  }
  const q = quiet;
  return { width: W, height: H, data, corners: [applyH(H2, q, q), applyH(H2, q + matrix.width, q), applyH(H2, q + matrix.width, q + matrix.height), applyH(H2, q, q + matrix.height)] };
}

const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

export function blur(plane: GrayPlane, sigma: number): GrayPlane {
  if (sigma <= 0) return plane;
  const r = Math.ceil(sigma * 3), kernel: number[] = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); kernel.push(v); sum += v; }
  for (let i = 0; i < kernel.length; i++) kernel[i] = kernel[i]! / sum;
  const w = plane.width, h = plane.height, tmp = new Float32Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let i = -r; i <= r; i++) v += kernel[i + r]! * plane.data[y * w + Math.min(w - 1, Math.max(0, x + i))]!; tmp[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let i = -r; i <= r; i++) v += kernel[i + r]! * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]!; out[y * w + x] = clamp(v); }
  return { ...plane, data: out };
}

/** Gaussian noise of deviation `sigma` (Box–Muller over a seeded xorshift). */
export function noise(plane: GrayPlane, sigma: number, seed: number = 1): GrayPlane {
  if (sigma <= 0) return plane;
  const rnd = xorshift(seed), out = new Uint8Array(plane.data.length);
  for (let i = 0; i < out.length; i++) {
    const u1 = Math.max(1e-9, rnd()), u2 = rnd();
    out[i] = clamp(plane.data[i]! + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma);
  }
  return { ...plane, data: out };
}

export function contrast(plane: GrayPlane, factor: number, centre: number = 128): GrayPlane {
  const out = new Uint8Array(plane.data.length);
  for (let i = 0; i < out.length; i++) out[i] = clamp(centre + (plane.data[i]! - centre) * factor);
  return { ...plane, data: out };
}

/** Darkens towards the right edge by `strength` (0.5: the right edge at half brightness). */
export function gradientLight(plane: GrayPlane, strength: number = 0.5): GrayPlane {
  const out = new Uint8Array(plane.data.length), w = plane.width;
  for (let i = 0; i < out.length; i++) out[i] = clamp(plane.data[i]! * (1 - (strength * (i % w)) / w));
  return { ...plane, data: out };
}

/** A bright spot: pixels within `radius` of (cx, cy) are lifted towards white, fully at the centre. */
export function glare(plane: GrayPlane, cx: number, cy: number, radius: number, strength: number = 1): GrayPlane {
  const out = new Uint8Array(plane.data.length), w = plane.width;
  for (let i = 0; i < out.length; i++) {
    const d = Math.hypot((i % w) - cx, Math.floor(i / w) - cy), lift = Math.max(0, 1 - d / radius) * strength;
    out[i] = clamp(plane.data[i]! + (255 - plane.data[i]!) * lift);
  }
  return { ...plane, data: out };
}

export function invert(plane: GrayPlane): GrayPlane {
  const out = new Uint8Array(plane.data.length);
  for (let i = 0; i < out.length; i++) out[i] = 255 - plane.data[i]!;
  return { ...plane, data: out };
}

/**
 * The image wrapped on a vertical cylinder of radius `radius` px, seen orthographically: x' = R·sin(x/R) about the centre;
 * columns farther than the radius from the centre are white. A warp, so a Raster's corners are not carried over.
 */
export function cylinder(plane: GrayPlane, radius: number): GrayPlane {
  const w = plane.width, h = plane.height, out = new Uint8Array(w * h).fill(255), cx = w / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xo = x + 0.5 - cx;
      if (Math.abs(xo) >= radius) continue;
      out[y * w + x] = clamp(bilinear(plane, radius * Math.asin(xo / radius) + cx, y + 0.5));
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Covers `share` of the symbol's bounding box with light and dark blotches (seeded). Coverage counts each painted pixel
 * once, so it reaches `share` of the box exactly, give or take the last blotch. Blotches stop after 100 000 in any case
 * (a box mostly outside the plane could never reach its share).
 */
export function damage(plane: GrayPlane, corners: readonly Point[], share: number, seed: number = 3): GrayPlane {
  const rnd = xorshift(seed), out = new Uint8Array(plane.data), painted = new Uint8Array(plane.data.length);
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), area = (x1 - x0) * (y1 - y0);
  let covered = 0;
  for (let blotches = 0; covered < area * share && blotches < 100_000; blotches++) {
    const r = 4 + rnd() * Math.sqrt(area) * 0.08, px = x0 + rnd() * (x1 - x0), py = y0 + rnd() * (y1 - y0), v = rnd() < 0.5 ? 0 : 255;
    for (let y = Math.max(0, Math.floor(py - r)); y < Math.min(plane.height, py + r); y++) {
      for (let x = Math.max(0, Math.floor(px - r)); x < Math.min(plane.width, px + r); x++) {
        if (Math.hypot(x - px, y - py) > r) continue;
        const i = y * plane.width + x;
        out[i] = v;
        if (!painted[i]) { painted[i] = 1; covered++; }
      }
    }
  }
  return { ...plane, data: out };
}

/**
 * Several planes on one white canvas (a sheet of labels): darkest wins, or an `opaque` piece covers what is under it.
 * Offsets are rounded to whole pixels.
 */
export function compose(width: number, height: number, pieces: readonly { plane: GrayPlane; x: number; y: number; opaque?: boolean }[]): GrayPlane {
  const data = new Uint8Array(width * height).fill(255);
  for (const { plane, x, y: y0, opaque = false } of pieces) {
    const ox = Math.round(x), oy = Math.round(y0);
    for (let y = 0; y < plane.height; y++) {
      if (oy + y < 0 || oy + y >= height) continue;
      for (let x = 0; x < plane.width; x++) {
        if (ox + x < 0 || ox + x >= width) continue;
        const i = (oy + y) * width + ox + x, v = plane.data[y * plane.width + x]!;
        data[i] = opaque ? v : Math.min(data[i]!, v);
      }
    }
  }
  return { width, height, data };
}

export function toRgba(plane: GrayPlane): ScanImage {
  const data = new Uint8ClampedArray(plane.data.length * 4);
  for (let i = 0; i < plane.data.length; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = plane.data[i]!; data[i * 4 + 3] = 255; }
  return { width: plane.width, height: plane.height, data, format: "rgba" };
}

export const asImage = (plane: GrayPlane): ScanImage => ({ width: plane.width, height: plane.height, data: plane.data, format: "gray" });
