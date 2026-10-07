import type { Plane } from "../core/binarize";
import { applyH, homographyFromPairs, piecewiseMap, ransacHomography, solveLinear, type Homography, type Pair } from "../core/geometry";
import type { Point } from "../core/types";
import { findAlignmentPattern, type FinderPattern } from "./finder";
import { qrAlignmentPositions } from "./tables";

export interface Triple {
  tl: FinderPattern;
  tr: FinderPattern;
  bl: FinderPattern;
  module: number;
  /** The mean leg (tl→tr, tl→bl) in modules: about dimension − 7. */
  legModules: number;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The module→image homography of a QR of `dim` modules through a triple's finder centres, with the perspective taken
 * from their module sizes: a homography's linear scale at a point is ∝ 1/w^1.5 (w its projective denominator, since
 * det J = det H / w³), so w_tr / w_tl = (m_tl / m_tr)^(2/3), likewise for bl, and w is linear in (u, v). With w fixed
 * at the three centres, the six remaining coefficients follow from the centres linearly. Null for degenerate centres.
 */
export function tripleHomography(triple: Triple, dim: number): Homography | null {
  const { tl, tr, bl } = triple, n = dim - 7, c = 3.5;
  const g = ((tl.module / tr.module) ** (2 / 3) - 1) / n, h = ((tl.module / bl.module) ** (2 / 3) - 1) / n;
  const w = (u: number, v: number): number => 1 + g * (u - c) + h * (v - c);
  const pts: [number, number, FinderPattern][] = [[c, c, tl], [dim - c, c, tr], [c, dim - c, bl]];
  const A = pts.map(([u, v]) => [u, v, 1]);
  const row1 = solveLinear(A, pts.map(([u, v, p]) => p.x * w(u, v))), row2 = solveLinear(A, pts.map(([u, v, p]) => p.y * w(u, v)));
  return row1 && row2 ? [...row1, ...row2, g, h, 1 - c * g - c * h] : null;
}

/** The local module size (√|det J|) of a homography at (u, v). */
export function moduleAt(H: Homography, u: number, v: number): number {
  const [x0, y0] = applyH(H, u, v), [x1, y1] = applyH(H, u + 1, v), [x2, y2] = applyH(H, u, v + 1);
  return Math.sqrt(Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)));
}

/**
 * How well the timing patterns agree with `dim`: modules 8…dim−9 of row 6 and of column 6 alternate, dark at even
 * indices, read through the triple's homography (so the far end of a tilted symbol is read where it is, not where an
 * affine offset from the finder line would put it). Returns the agreeing share over both edges; 0 off the plane.
 */
export function timingAgreement(plane: Plane, triple: Triple, dim: number): number {
  const H = tripleHomography(triple, dim);
  if (!H) return 0;
  let agree = 0, count = 0;
  for (let k = 8; k <= dim - 9; k++) {
    for (const [x, y] of [applyH(H, k + 0.5, 6.5), applyH(H, 6.5, k + 0.5)]) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= plane.width || yi >= plane.height) return 0;
      if (plane.get(xi, yi) === (k % 2 === 0)) agree++;
      count++;
    }
  }
  return count === 0 ? 0 : agree / count;
}

export interface TripleOptions {
  /** 0.15; 0.25 with tryHarder. */
  angleTolerance: number;
  /** Module sizes and legs: 1.6; 2.5 with tryHarder, for perspective. */
  ratioLimit: number;
  /** With a plane, a triple must have timing patterns agreeing at least `minTiming` (0.7; 0.6 with tryHarder) for one of its dimensions. */
  plane?: Plane;
  minTiming?: number;
}

/**
 * Ordered triples of finder patterns: module sizes and legs within `ratioLimit`, a right angle at the top-left
 * within `angleTolerance` of 90°, legs of 10 to 185 modules, and (with a plane) timing patterns between the finders,
 * which tell a symbol's own triple from three finders of different symbols on a sheet. Largest symbol first
 * (decision 10).
 */
export function finderTriples(patterns: readonly FinderPattern[], { angleTolerance, ratioLimit, plane, minTiming = 0.7 }: TripleOptions): Triple[] {
  const out: Triple[] = [], sorted = [...patterns].sort((a, b) => b.count - a.count).slice(0, 24);
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) for (let k = j + 1; k < sorted.length; k++) {
    const trio = [sorted[i]!, sorted[j]!, sorted[k]!], ms = trio.map((p) => p.module);
    if (Math.max(...ms) > ratioLimit * Math.min(...ms)) continue;
    let tl = 0, best = -2;
    for (let c = 0; c < 3; c++) {
      const o = trio[c]!, a = trio[(c + 1) % 3]!, b = trio[(c + 2) % 3]!;
      const cos = ((a.x - o.x) * (b.x - o.x) + (a.y - o.y) * (b.y - o.y)) / (dist(a, o) * dist(b, o));
      if (-cos > best) { best = -cos; tl = c; }
    }
    const o = trio[tl]!;
    let a = trio[(tl + 1) % 3]!, b = trio[(tl + 2) % 3]!;
    const angle = (Math.acos(Math.max(-1, Math.min(1, -best))) * 180) / Math.PI;
    if (Math.abs(angle - 90) > 90 * angleTolerance) continue;
    const la = dist(a, o), lb = dist(b, o);
    if (la / lb > ratioLimit || lb / la > ratioLimit) continue;
    const module = (o.module + a.module + b.module) / 3, legModules = (la + lb) / 2 / module;
    if (legModules < 10 || legModules > 185) continue;
    // tr is such that (tr − tl) × (bl − tl) > 0 with y pointing down
    if ((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x) < 0) [a, b] = [b, a];
    const triple: Triple = { tl: o, tr: a, bl: b, module, legModules };
    if (plane) {
      let best = 0;
      for (const dim of dimensionCandidates(triple)) best = Math.max(best, timingAgreement(plane, triple, dim));
      if (best < minTiming) continue;
    }
    out.push(triple);
  }
  return out.sort((p, q) => q.legModules * q.module - p.legModules * p.module);
}

/**
 * Where a third finder would be for a pair of finders: the far corners of the two squares with the pair as a side,
 * and the two corners with the pair as a diagonal (tryHarder; the candidates are confirmed by `confirmFinder`).
 */
export function predictedThirdFinders(a: FinderPattern, b: FinderPattern): Point[] {
  const vx = b.x - a.x, vy = b.y - a.y;
  return [[a.x - vy, a.y + vx], [a.x + vy, a.y - vx], [b.x - vy, b.y + vx], [b.x + vy, b.y - vx], [(a.x + b.x) / 2 - vy / 2, (a.y + b.y) / 2 + vx / 2], [(a.x + b.x) / 2 + vy / 2, (a.y + b.y) / 2 - vx / 2]];
}

/** Dimensions to try: the legs + 7 snapped to 4k + 17, then ±4, clamped to 21…177 (the spec's "version by size ±1"). */
export function dimensionCandidates(triple: Triple): number[] {
  const d = Math.round(triple.legModules) + 7, base: number[] = [];
  const r = d % 4;
  if (r === 1) base.push(d); else if (r === 0) base.push(d + 1); else if (r === 2) base.push(d - 1); else base.push(d - 2, d + 2);
  const out: number[] = [];
  for (const b of base) for (const v of [b, b - 4, b + 4]) { const c = Math.max(21, Math.min(177, v)); if (!out.includes(c)) out.push(c); }
  return out;
}

export interface QrMapping {
  map: (u: number, v: number) => Point;
  /** Alignment patterns found. */
  alignments: number;
}

/**
 * The module→image mapping of a QR of `dim` modules from a triple: a homography through the three finder centres and
 * the bottom-right alignment pattern (searched from the triple's perspective estimate with the module size expected
 * there), then every other alignment pattern within ±1.5 modules of its prediction, a RANSAC homography through all
 * of them, and a piecewise grid between the alignment nodes (decisions 7, 8).
 */
export function buildQrMapping(plane: Plane, triple: Triple, dim: number): QrMapping | null {
  const { tl, tr, bl, module } = triple, version = (dim - 17) / 4, H0 = tripleHomography(triple, dim);
  if (!H0) return null;
  const unit = (x: number, y: number): Point => { const l = Math.hypot(x, y); return [x / l, y / l]; };
  const axes: [Point, Point] = [unit(tr.x - tl.x, tr.y - tl.y), unit(bl.x - tl.x, bl.y - tl.y)];
  const pairs: Pair[] = [{ u: 3.5, v: 3.5, x: tl.x, y: tl.y }, { u: dim - 3.5, v: 3.5, x: tr.x, y: tr.y }, { u: 3.5, v: dim - 3.5, x: bl.x, y: bl.y }];
  let bottomRight: Point | null = null;
  if (version >= 2) {
    const [ex, ey] = applyH(H0, dim - 6.5, dim - 6.5);
    const far = Math.max(0.4 * module, Math.min(2.5 * module, moduleAt(H0, dim - 6.5, dim - 6.5)));
    search: for (const r of [2, 4, 8, 16]) for (const mm of [far, far * 0.85, far * 1.15]) { bottomRight = findAlignmentPattern(plane, ex, ey, r * module, mm, axes); if (bottomRight) break search; }
  }
  if (bottomRight) pairs.push({ u: dim - 6.5, v: dim - 6.5, x: bottomRight[0], y: bottomRight[1] });
  else { const [bx, by] = applyH(H0, dim - 3.5, dim - 3.5); pairs.push({ u: dim - 3.5, v: dim - 3.5, x: bx, y: by }); }
  const H = homographyFromPairs(pairs);
  if (H === null) return null;
  if (version < 2) return { map: (u, v) => applyH(H, u, v), alignments: 0 };
  const positions = qrAlignmentPositions(version), measured = new Map<string, Point>(), all: Pair[] = [...pairs];
  let count = 0;
  for (const pv of positions) for (const pu of positions) {
    if ((pu === 6 && pv === 6) || (pu === 6 && pv === dim - 7) || (pu === dim - 7 && pv === 6)) continue;
    const key = `${pu + 0.5},${pv + 0.5}`;
    if (pu === dim - 7 && pv === dim - 7 && bottomRight) { measured.set(key, bottomRight); count++; continue; }
    const [ex, ey] = applyH(H, pu + 0.5, pv + 0.5), found = findAlignmentPattern(plane, ex, ey, 1.5 * module, module, axes);
    if (found) { measured.set(key, found); all.push({ u: pu + 0.5, v: pv + 0.5, x: found[0], y: found[1] }); count++; }
  }
  const G = all.length > 4 ? (ransacHomography(all, Math.max(1.5, module * 0.6)) ?? H) : H;
  const nodes = positions.map((p) => p + 0.5);
  const map = piecewiseMap(nodes, nodes, (u, v) => measured.get(`${u},${v}`) ?? applyH(G, u, v));
  return { map, alignments: count };
}
