import type { Plane } from "../core/binarize";
import type { LevelBinarization, ScanContext } from "../core/context";
import { applyH, homographyFromPairs, ransacHomography, type Pair } from "../core/geometry";
import type { Point } from "../core/types";
import type { FinderPattern } from "./finder";
import { RMQR_HEIGHTS, RMQR_WIDTHS } from "./tables";

interface Line { x: number; y: number; dx: number; dy: number }

function fitLine(points: readonly { x: number; y: number }[]): Line {
  const mx = points.reduce((s, q) => s + q.x, 0) / points.length, my = points.reduce((s, q) => s + q.y, 0) / points.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const q of points) { sxx += (q.x - mx) ** 2; syy += (q.y - my) ** 2; sxy += (q.x - mx) * (q.y - my); }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { x: mx, y: my, dx: Math.cos(theta), dy: Math.sin(theta) };
}
function intersect(l1: Line, l2: Line): Point | null {
  const det = l1.dx * l2.dy - l1.dy * l2.dx;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((l2.x - l1.x) * l2.dy - (l2.y - l1.y) * l2.dx) / det;
  return [l1.x + l1.dx * t, l1.y + l1.dy * t];
}

/**
 * The four outer corners of a finder pattern, clockwise in image coordinates: rays from the centre every 3° find the
 * ring's outer edge (the third transition), the four farthest directions about 90° apart are the corners, each side's
 * points (away from the corners) get a line, and the corners are the lines' intersections.
 */
export function finderCorners(plane: Plane, p: FinderPattern): Point[] | null {
  const pts: { a: number; r: number; x: number; y: number }[] = [];
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180, dx = Math.cos(rad), dy = Math.sin(rad);
    let phase = 0, last: boolean | null = null, edge: number | null = null;
    for (let r = 0; r < p.module * 6; r += 0.25) {
      const x = Math.round(p.x + dx * r), y = Math.round(p.y + dy * r);
      if (x < 0 || y < 0 || x >= plane.width || y >= plane.height) break;
      const d = plane.get(x, y);
      if (last !== null && d !== last) { phase++; if (phase === 3) { edge = r; break; } }
      last = d;
    }
    if (edge !== null && edge > p.module * 2 && edge < p.module * 5.5) pts.push({ a, r: edge, x: p.x + dx * edge, y: p.y + dy * edge });
  }
  if (pts.length < 60) return null;
  const byAngle = (a: number) => pts.find((q) => q.a === ((a % 360) + 360) % 360);
  const top = pts.reduce((m, q) => (q.r > m.r ? q : m));
  const corners = [top.a, top.a + 90, top.a + 180, top.a + 270].map((a) => {
    let best: (typeof pts)[number] | null = null;
    for (let d = -15; d <= 15; d += 3) { const q = byAngle(a + d); if (q && (!best || q.r > best.r)) best = q; }
    return best;
  });
  if (corners.some((c) => c === null)) return null;
  const lines: Line[] = [], tolerance = Math.max(1, 0.3 * p.module);
  for (let i = 0; i < 4; i++) {
    const a0 = corners[i]!.a, a1 = corners[(i + 1) % 4]!.a, span = ((a1 - a0) % 360 + 360) % 360;
    const side = pts.filter((q) => { const d = ((q.a - a0) % 360 + 360) % 360; return d > span * 0.2 && d < span * 0.8; });
    if (side.length < 4) return null;
    // a ray through the stair-stepped gap between the island and the ring can flicker and stop short: refit without
    // the points off the line
    const first = fitLine(side), kept = side.filter((q) => Math.abs((q.x - first.x) * first.dy - (q.y - first.y) * first.dx) <= tolerance);
    lines.push(kept.length >= 4 ? fitLine(kept) : first);
  }
  const out: Point[] = [];
  for (let i = 0; i < 4; i++) { const c = intersect(lines[(i + 3) % 4]!, lines[i]!); if (!c) return null; out.push(c); }
  const area = out.reduce((s, c, i) => { const n = out[(i + 1) % 4]!; return s + (c[0] * n[1] - n[0] * c[1]); }, 0);
  return area > 0 ? out : out.reverse();
}

export interface WalkOptions {
  /** The first dark module's index: 8 after a finder and its separator, 2 after a corner pattern. */
  k0?: number;
  maxModules: number;
  allowed: (size: number) => boolean;
  /** The run that ends the edge: 3 (rMQR corner pattern) or 5 (the finder sub-pattern). */
  endRun?: number;
}

export interface Walk {
  size: number;
  centres: { k: number; x: number; y: number }[];
  module: number;
}

/**
 * Walks an edge timing pattern from the symbol's outer corner `start` along the unit vector `dir`, `inward` pointing
 * into the symbol. Dark modules sit at even indices from `k0` on. Each expected dark module is searched within ±0.6
 * module of its prediction, re-centred against the quiet zone, and the pitch follows the measured centres. The edge
 * ends at the first missing dark module (Micro QR), or at a run of `endRun` dark modules with light beyond it (rMQR);
 * a run of three with more pattern beyond it is an alignment pattern (decision 9). Null when the pattern breaks.
 */
export function walkTiming(plane: Plane, start: Point, dir: Point, inward: Point, module: number, { k0 = 8, maxModules, allowed, endRun = 3 }: WalkOptions): Walk | null {
  const w = plane.width, h = plane.height;
  const dark = (x: number, y: number): boolean | null => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < w && yi < h ? plane.get(xi, yi) : null; };
  let m = module, lastK = k0 - 2, lastCentre: Point | null = null, size: number | null = null;
  const centres: Walk["centres"] = [];
  const predict = (k: number): Point => (lastCentre ? [lastCentre[0] + dir[0] * (k - lastK) * m, lastCentre[1] + dir[1] * (k - lastK) * m] : [start[0] + dir[0] * (k + 0.5) * m + inward[0] * 0.5 * m, start[1] + dir[1] * (k + 0.5) * m + inward[1] * 0.5 * m]);
  for (let k = k0; k < maxModules + 2; k += 2) {
    const [px, py] = predict(k);
    let t0: number | null = null;
    for (let t = -0.6 * m; t <= 0.6 * m; t += 0.25) { const d = dark(px + dir[0] * t, py + dir[1] * t); if (d === null) return null; if (d) { t0 = t; break; } }
    if (t0 === null) { size = k - 1; break; }
    while (t0 - 0.25 > -1.2 * m && dark(px + dir[0] * (t0 - 0.25), py + dir[1] * (t0 - 0.25))) t0 -= 0.25;
    let t1 = t0;
    while (t1 + 0.25 < 6 * m && dark(px + dir[0] * (t1 + 0.25), py + dir[1] * (t1 + 0.25))) t1 += 0.25;
    const width = t1 - t0, runLength = Math.round(width / m);
    const centreOf = (j: number): Point => [px + dir[0] * (t0! + (j + 0.5) * m), py + dir[1] * (t0! + (j + 0.5) * m)];
    if (runLength >= 3) {
      const quietBeyond = !dark(...centreOf(runLength)) && !dark(...centreOf(runLength + 1));
      if (runLength === endRun && quietBeyond) { size = k + endRun; lastCentre = centreOf(0); lastK = k; break; }
      if (runLength === 3 && !quietBeyond) { lastCentre = centreOf(2); lastK = k + 2; k += 2; continue; }
      return null;
    }
    if (width > 1.9 * m || width < 0.3 * m) return null;
    const tc = (t0 + t1) / 2;
    let cx = px + dir[0] * tc, cy = py + dir[1] * tc, s: number | null = null;
    for (let o = -1.2 * m; o <= 0.6 * m; o += 0.25) { const d = dark(cx + inward[0] * (o - 0.5 * m), cy + inward[1] * (o - 0.5 * m)); if (d === null) return null; if (d) { s = o; break; } }
    if (s !== null) { cx += inward[0] * s; cy += inward[1] * s; }
    if (lastCentre) {
      if (dark((cx + lastCentre[0]) / 2, (cy + lastCentre[1]) / 2)) return null; // the light module between
      const pitch = Math.hypot(cx - lastCentre[0], cy - lastCentre[1]) / (k - lastK);
      if (pitch > 0.6 * m && pitch < 1.6 * m) m = 0.6 * m + 0.4 * pitch;
    }
    centres.push({ k, x: cx, y: cy });
    lastCentre = [cx, cy];
    lastK = k;
  }
  if (size === null || !allowed(size)) return null;
  for (const k of [size, size + 1]) if (dark(...predict(k))) return null; // the quiet zone past the edge
  return { size, centres, module: m };
}

export interface SingleSymbol {
  kind: "micro" | "rmqr";
  width: number;
  height: number;
  map: (u: number, v: number) => Point;
  /** The grid was read through a reflected finder orientation: the image shows the symbol's mirror image. */
  mirrored: boolean;
}

const MICRO_SIZES = [11, 13, 15, 17];
const isSize = (s: number): boolean => MICRO_SIZES.includes(s) || RMQR_WIDTHS.includes(s) || RMQR_HEIGHTS.includes(s);

/**
 * A Micro QR or rMQR symbol from one finder pattern: its corners, the four rotations and then the four reflections of
 * the corner order (a mirrored rMQR has the other shape, so only a reflected orientation reads it), the top and left
 * timing walks give the size; rMQR also walks the bottom row and the right column and fits one homography to every
 * timing centre by RANSAC; Micro QR has timing on two edges only and extrapolates.
 */
export function locateSingle(bin: LevelBinarization, pattern: FinderPattern, ctx: ScanContext): SingleSymbol | null {
  const plane = bin.plane, corners = finderCorners(plane, pattern);
  if (!corners) return null;
  const unit = (a: Point, b: Point): [number, number, number] => { const v = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(v[0]!, v[1]!); return [v[0]! / l, v[1]! / l, l]; };
  for (let o = 0; o < 8; o++) {
    const mirrored = o >= 4, step = mirrored ? 3 : 1;
    const c = [corners[o % 4]!, corners[(o + step) % 4]!, corners[(o + 2) % 4]!, corners[(o + 3 * step) % 4]!];
    const [dx, dy, lx] = unit(c[0]!, c[1]!), [ex, ey, ly] = unit(c[0]!, c[3]!);
    if (lx < 4 || ly < 4) continue;
    const dirX: Point = [dx, dy], dirY: Point = [ex, ey];
    if (ctx.expired()) return null;
    const top = walkTiming(plane, c[0]!, dirX, dirY, lx / 7, { maxModules: 139, allowed: isSize });
    if (!top) continue;
    const left = walkTiming(plane, c[0]!, dirY, dirX, ly / 7, { maxModules: 17, allowed: isSize });
    if (!left) continue;
    const width = top.size, height = left.size;
    // a reflected Micro QR is the transposed square, which the matrix decoder already tries
    const micro = !mirrored && width === height && MICRO_SIZES.includes(width);
    const rmqr = RMQR_WIDTHS.some((w, i) => w === width && RMQR_HEIGHTS[i] === height);
    if (!micro && !rmqr) continue;
    const pairs: Pair[] = [{ u: 0, v: 0, x: c[0]![0], y: c[0]![1] }, { u: 7, v: 0, x: c[1]![0], y: c[1]![1] }, { u: 7, v: 7, x: c[2]![0], y: c[2]![1] }, { u: 0, v: 7, x: c[3]![0], y: c[3]![1] }];
    for (const t of top.centres) pairs.push({ u: t.k + 0.5, v: 0.5, x: t.x, y: t.y });
    for (const t of left.centres) pairs.push({ u: 0.5, v: t.k + 0.5, x: t.x, y: t.y });
    let H = homographyFromPairs(pairs);
    if (H === null) continue;
    if (rmqr) {
      // in an R7 the finder itself (then its separator) opens the bottom row, and the right column is solid dark: the
      // corner pattern runs into the 5×5 sub-pattern
      const bl = applyH(H, 0, height), tr = applyH(H, width, 0), tall = height > 7;
      const bottom = walkTiming(plane, bl, dirX, [-dirY[0], -dirY[1]], top.module, { k0: tall ? 2 : 8, maxModules: width, allowed: (s) => s === width, endRun: 5 });
      const right = tall ? walkTiming(plane, tr, dirY, [-dirX[0], -dirX[1]], left.module, { k0: 2, maxModules: height, allowed: (s) => s === height, endRun: 5 }) : null;
      if (bottom) for (const t of bottom.centres) pairs.push({ u: t.k + 0.5, v: height - 0.5, x: t.x, y: t.y });
      if (right) for (const t of right.centres) pairs.push({ u: width - 0.5, v: t.k + 0.5, x: t.x, y: t.y });
      if (bottom || right) H = ransacHomography(pairs, Math.max(1, 0.5 * top.module), 32) ?? H;
    }
    const fixed = H;
    return { kind: micro ? "micro" : "rmqr", width, height, map: (u, v) => applyH(fixed, u, v), mirrored };
  }
  return null;
}
