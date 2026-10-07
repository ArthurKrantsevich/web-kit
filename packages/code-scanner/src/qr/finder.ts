import type { Plane } from "../core/binarize";
import type { Point } from "../core/types";

export interface FinderPattern {
  x: number;
  y: number;
  /** Module size in pixels, free of the pattern's rotation (decision 5). */
  module: number;
  /** How many rows confirmed it. */
  count: number;
}

/** 1:1:3:1:1 within `tolerance` of the module (0.5 = 50 %): the module size, or 0. */
export function finderRatio(c: readonly number[], tolerance: number): number {
  const total = c[0]! + c[1]! + c[2]! + c[3]! + c[4]!;
  if (total < 7) return 0;
  const m = total / 7, v = m * tolerance;
  return Math.abs(m - c[0]!) < v && Math.abs(m - c[1]!) < v && Math.abs(3 * m - c[2]!) < 3 * v && Math.abs(m - c[3]!) < v && Math.abs(m - c[4]!) < v ? m : 0;
}

export interface Run {
  start: number;
  length: number;
  dark: boolean;
}

/** The runs of one row (`horizontal`, `fixed` = y) or column of a plane between `from` and `to`. */
export function runsOf(plane: Plane, fixed: number, horizontal: boolean, from: number, to: number): Run[] {
  const out: Run[] = [];
  const at = (i: number): boolean => (horizontal ? plane.get(i, fixed) : plane.get(fixed, i));
  let start = from, dark = at(from);
  for (let i = from + 1; i <= to; i++) {
    const d = i < to && at(i);
    if (i === to || d !== dark) { out.push({ start, length: i - start, dark }); start = i; dark = d; }
  }
  return out;
}

interface Cross {
  centre: number;
  module: number;
  counts: number[];
}

/**
 * From (x, y) along ±(dx, dy): dark, light, dark, light, dark. The total must be within `totalTolerance` of the row's
 * (1 = no check: the diagonals, whose step is √2 px, depend on the rotation). Returns the pattern's centre along the
 * line (in continuous coordinates, for a positive direction), its module size and the five counts.
 */
function crossCheck(plane: Plane, x: number, y: number, dx: number, dy: number, expectedTotal: number, tolerance: number, totalTolerance: number): Cross | null {
  const w = plane.width, h = plane.height, c = [0, 0, 0, 0, 0], max = expectedTotal * 1.5 + 4;
  const inside = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < w && j < h;
  let i = x, j = y;
  if (!inside(i, j) || !plane.get(i, j)) return null;
  while (inside(i, j) && plane.get(i, j)) { c[2]!++; i -= dx; j -= dy; if (c[2]! > max) return null; }
  if (!inside(i, j)) return null;
  while (inside(i, j) && !plane.get(i, j)) { c[1]!++; i -= dx; j -= dy; if (c[1]! > max) return null; }
  if (!inside(i, j)) return null;
  while (inside(i, j) && plane.get(i, j)) { c[0]!++; i -= dx; j -= dy; if (c[0]! > max) return null; }
  const before = dx !== 0 ? i : j; // the first position outside the pattern on the negative side
  i = x + dx; j = y + dy;
  while (inside(i, j) && plane.get(i, j)) { c[2]!++; i += dx; j += dy; if (c[2]! > max) return null; }
  if (!inside(i, j)) return null;
  while (inside(i, j) && !plane.get(i, j)) { c[3]!++; i += dx; j += dy; if (c[3]! > max) return null; }
  if (!inside(i, j)) return null;
  while (inside(i, j) && plane.get(i, j)) { c[4]!++; i += dx; j += dy; if (c[4]! > max) return null; }
  const total = c[0]! + c[1]! + c[2]! + c[3]! + c[4]!;
  // symmetric: under perspective either run may be the shorter one
  if (totalTolerance < 1 && Math.abs(total - expectedTotal) >= Math.max(total, expectedTotal) * totalTolerance) return null;
  const m = finderRatio(c, tolerance);
  if (m === 0) return null;
  return { centre: before + 1 + c[0]! + c[1]! + c[2]! / 2, module: m, counts: c };
}

/** Area of the dark 4-connected component through (x, y), or −1 past `cap`; 0 when (x, y) is light or outside. */
export function componentArea(plane: Plane, x: number, y: number, cap: number): number {
  const w = plane.width, h = plane.height;
  if (x < 0 || y < 0 || x >= w || y >= h || !plane.get(x, y)) return 0;
  const seen = new Uint8Array(w * h), stack = [y * w + x];
  seen[y * w + x] = 1;
  let area = 0;
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (++area > cap) return -1;
    const px = i % w, py = (i - px) / w;
    if (px + 1 < w && !seen[i + 1] && plane.get(px + 1, py)) { seen[i + 1] = 1; stack.push(i + 1); }
    if (px > 0 && !seen[i - 1] && plane.get(px - 1, py)) { seen[i - 1] = 1; stack.push(i - 1); }
    if (py + 1 < h && !seen[i + w] && plane.get(px, py + 1)) { seen[i + w] = 1; stack.push(i + w); }
    if (py > 0 && !seen[i - w] && plane.get(px, py - 1)) { seen[i - w] = 1; stack.push(i - w); }
  }
  return area;
}

export interface FinderOptions {
  /** Run ratio tolerance: 0.5, 0.7 with tryHarder. */
  tolerance: number;
  /** Island and ring area tolerance: 0.4, 0.6 with tryHarder. */
  areaTolerance: number;
  /** Vertical vs horizontal total tolerance: 0.4, 0.6 with tryHarder. */
  totalTolerance: number;
}

/**
 * Finder pattern candidates: 1:1:3:1:1 runs in every row, cross-checked down the column, across the row and along
 * both diagonals, with a rotation-free module size (decision 5), confirmed by the 3×3 island and the 7×7 ring
 * components (decision 6). Candidates within two modules merge, averaging their positions.
 */
export function findFinderPatterns(plane: Plane, { tolerance, areaTolerance, totalTolerance }: FinderOptions): FinderPattern[] {
  const w = plane.width, h = plane.height, found: FinderPattern[] = [];
  for (let y = 0; y < h; y++) {
    const runs = runsOf(plane, y, true, 0, w);
    for (let k = 0; k + 4 < runs.length; k++) {
      if (!runs[k]!.dark) continue;
      const c = [runs[k]!.length, runs[k + 1]!.length, runs[k + 2]!.length, runs[k + 3]!.length, runs[k + 4]!.length];
      const m = finderRatio(c, tolerance);
      if (m === 0) continue;
      const total = c[0]! + c[1]! + c[2]! + c[3]! + c[4]!, cx = Math.floor(runs[k + 2]!.start + c[2]! / 2);
      const v = crossCheck(plane, cx, y, 0, 1, total, tolerance, totalTolerance);
      if (!v) continue;
      const cy = Math.floor(v.centre);
      const hz = crossCheck(plane, cx, cy, 1, 0, total, tolerance, totalTolerance);
      if (!hz) continue;
      const x2 = Math.floor(hz.centre);
      const d1 = crossCheck(plane, x2, cy, 1, 1, total, tolerance, 1);
      if (!d1) continue;
      const d2 = crossCheck(plane, x2, cy, 1, -1, total, tolerance, 1);
      if (!d2) continue;
      // a square rotated by θ: horizontal run m/cos θ px, diagonal run m/(√2·cos(45° − θ)) steps → tan θ = h/d − 1
      const hRun = (hz.module + v.module) / 2, dRun = (d1.module + d2.module) / 2;
      const theta = Math.atan(Math.max(-1, Math.min(1, hRun / dRun - 1))), module = hRun * Math.cos(theta);
      const island = componentArea(plane, x2, cy, 9 * module * module * 2.5);
      if (island <= 0 || Math.abs(island - 9 * module * module) > 9 * module * module * areaTolerance) continue;
      const ringX = Math.round(hz.centre + hz.counts[2]! / 2 + hz.counts[3]! + hz.counts[4]! / 2);
      const ring = componentArea(plane, ringX, cy, 24 * module * module * 3);
      if (ring < 24 * module * module * (1 - areaTolerance)) continue;
      const px = hz.centre, py = v.centre;
      const near = found.find((f) => Math.abs(f.x - px) <= f.module * 2 && Math.abs(f.y - py) <= f.module * 2 && Math.abs(f.module - module) <= f.module * 0.5);
      if (near) {
        near.x = (near.x * near.count + px) / (near.count + 1);
        near.y = (near.y * near.count + py) / (near.count + 1);
        near.module = (near.module * near.count + module) / (near.count + 1);
        near.count++;
      } else found.push({ x: px, y: py, module, count: 1 });
    }
  }
  return found;
}

/**
 * The alignment pattern nearest (x, y) within `radius` px for module size `m`: a dark island of about one module whose
 * 5×5 template (dark ring, light ring, dark centre), sampled along the symbol's `axes`, matches in at least 23 of 25
 * modules (decision 7). Null when there is none.
 */
export function findAlignmentPattern(plane: Plane, x: number, y: number, radius: number, m: number, axes: readonly [Point, Point]): Point | null {
  const w = plane.width, h = plane.height;
  const x0 = Math.max(0, Math.floor(x - radius)), x1 = Math.min(w - 1, Math.ceil(x + radius)), y0 = Math.max(0, Math.floor(y - radius)), y1 = Math.min(h - 1, Math.ceil(y + radius));
  const seen = new Uint8Array(w * h);
  const dark = (px: number, py: number): boolean => { const xi = Math.round(px), yi = Math.round(py); return xi >= 0 && yi >= 0 && xi < w && yi < h && plane.get(xi, yi); };
  let best: Point | null = null, bestScore = Infinity;
  const [ax, ay] = axes;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const i = yy * w + xx;
      if (seen[i] || !plane.get(xx, yy)) continue;
      const cap = Math.max(4, 2.5 * m * m), stack = [i];
      seen[i] = 1;
      let n = 0, sx = 0, sy = 0, minX = xx, maxX = xx, minY = yy, maxY = yy, over = false;
      while (stack.length > 0) {
        const k = stack.pop()!;
        if (++n > cap) { over = true; break; }
        const px = k % w, py = (k - px) / w;
        sx += px; sy += py;
        if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
        if (px + 1 < w && !seen[k + 1] && plane.get(px + 1, py)) { seen[k + 1] = 1; stack.push(k + 1); }
        if (px > 0 && !seen[k - 1] && plane.get(px - 1, py)) { seen[k - 1] = 1; stack.push(k - 1); }
        if (py + 1 < h && !seen[k + w] && plane.get(px, py + 1)) { seen[k + w] = 1; stack.push(k + w); }
        if (py > 0 && !seen[k - w] && plane.get(px, py - 1)) { seen[k - w] = 1; stack.push(k - w); }
      }
      if (over) { for (const k of stack) seen[k] = 1; continue; }
      if (n < 0.3 * m * m || maxX - minX + 1 > 1.8 * m || maxY - minY + 1 > 1.8 * m) continue;
      const cx = sx / n + 0.5, cy = sy / n + 0.5;
      let matches = 0;
      for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
        const expectDark = Math.max(Math.abs(k), Math.abs(j)) !== 1;
        if (dark(cx + (ax[0] * k + ay[0] * j) * m, cy + (ax[1] * k + ay[1] * j) * m) === expectDark) matches++;
      }
      if (matches < 23) continue;
      const score = Math.hypot(cx - x, cy - y) + (25 - matches) * m;
      if (score < bestScore) { bestScore = score; best = [cx, cy]; }
    }
  }
  return best;
}

/**
 * Confirms a finder pattern predicted at (x, y) with a module size of about `m` (tryHarder, when only two finders
 * passed the run checks: a third one squeezed by perspective often fails them). The centre must be dark; on at least
 * 18 of 24 rays the ring's outer edge (the third transition) must lie between 1.5·m and 8·m; the island must be 9m²
 * ± 60 % for the module size taken as the 25th-percentile edge radius over 3.5 (the smallest radii cross the sides).
 * The centre moves to the island's centroid.
 */
export function confirmFinder(plane: Plane, x: number, y: number, m: number): FinderPattern | null {
  const w = plane.width, h = plane.height, xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= w || yi >= h || !plane.get(xi, yi)) return null;
  const radii: number[] = [];
  for (let a = 0; a < 360; a += 15) {
    const rad = (a * Math.PI) / 180, dx = Math.cos(rad), dy = Math.sin(rad);
    let phase = 0, last: boolean | null = null, edge: number | null = null;
    for (let r = 0; r < m * 9; r += 0.5) {
      const px = Math.round(x + dx * r), py = Math.round(y + dy * r);
      if (px < 0 || py < 0 || px >= w || py >= h) break;
      const d = plane.get(px, py);
      if (last !== null && d !== last) { phase++; if (phase === 3) { edge = r; break; } }
      last = d;
    }
    if (edge !== null && edge >= 1.5 * m && edge <= 8 * m) radii.push(edge);
  }
  if (radii.length < 18) return null;
  radii.sort((p, q) => p - q);
  const module = radii[Math.floor(radii.length / 4)]! / 3.5;
  const island = componentArea(plane, xi, yi, 9 * module * module * 2.5);
  if (island <= 0 || Math.abs(island - 9 * module * module) > 9 * module * module * 0.6) return null;
  let sx = 0, sy = 0, n = 0;
  const seen = new Uint8Array(w * h), stack = [yi * w + xi];
  seen[yi * w + xi] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!, px = i % w, py = (i - px) / w;
    sx += px; sy += py; n++;
    if (px + 1 < w && !seen[i + 1] && plane.get(px + 1, py)) { seen[i + 1] = 1; stack.push(i + 1); }
    if (px > 0 && !seen[i - 1] && plane.get(px - 1, py)) { seen[i - 1] = 1; stack.push(i - 1); }
    if (py + 1 < h && !seen[i + w] && plane.get(px, py + 1)) { seen[i + w] = 1; stack.push(i + w); }
    if (py > 0 && !seen[i - w] && plane.get(px, py - 1)) { seen[i - w] = 1; stack.push(i - w); }
  }
  return { x: sx / n + 0.5, y: sy / n + 0.5, module, count: 1 };
}
