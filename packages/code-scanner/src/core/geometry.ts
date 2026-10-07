import type { Point } from "./types";

/** A 3×3 matrix, row-major: H·[u, v, 1]ᵀ ∝ [x, y, 1]ᵀ maps symbol coordinates to image coordinates. */
export type Homography = number[];

export interface Pair {
  u: number;
  v: number;
  x: number;
  y: number;
}

/** Gaussian elimination with partial pivoting; null for a singular system. */
export function solveLinear(A: readonly (readonly number[])[], b: readonly number[]): number[] | null {
  const n = b.length, M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-12) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r]![k] = M[r]![k]! - f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

export function mul3(A: readonly number[], B: readonly number[]): Homography {
  const C = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] = C[i * 3 + j]! + A[i * 3 + k]! * B[k * 3 + j]!;
  return C;
}

export function invert3(m: readonly number[]): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

export function applyH(H: readonly number[], u: number, v: number): Point {
  const w = H[6]! * u + H[7]! * v + H[8]!;
  return [(H[0]! * u + H[1]! * v + H[2]!) / w, (H[3]! * u + H[4]! * v + H[5]!) / w];
}

/** Normalization of a point set: translation to the centroid and scale to unit mean distance (Hartley). */
function normalization(points: readonly Point[]): { T: Homography; apply: (p: Point) => Point } {
  const mx = points.reduce((s, p) => s + p[0], 0) / points.length, my = points.reduce((s, p) => s + p[1], 0) / points.length;
  const scale = points.reduce((s, p) => s + Math.hypot(p[0] - mx, p[1] - my), 0) / points.length || 1;
  return { T: [1 / scale, 0, -mx / scale, 0, 1 / scale, -my / scale, 0, 0, 1], apply: (p) => [(p[0] - mx) / scale, (p[1] - my) / scale] };
}

/** The homography through ≥ 4 pairs: the normalized DLT, least squares through the normal equations (h₃₃ = 1). */
export function homographyFromPairs(pairs: readonly Pair[]): Homography | null {
  if (pairs.length < 4) return null;
  const src = normalization(pairs.map((p) => [p.u, p.v])), dst = normalization(pairs.map((p) => [p.x, p.y]));
  const A = Array.from({ length: 8 }, () => new Array<number>(8).fill(0)), b = new Array<number>(8).fill(0);
  for (const p of pairs) {
    const [u, v] = src.apply([p.u, p.v]), [x, y] = dst.apply([p.x, p.y]);
    for (const row of [[u, v, 1, 0, 0, 0, -x * u, -x * v, x], [0, 0, 0, u, v, 1, -y * u, -y * v, y]]) {
      for (let i = 0; i < 8; i++) {
        b[i] = b[i]! + row[i]! * row[8]!;
        for (let j = 0; j < 8; j++) A[i]![j] = A[i]![j]! + row[i]! * row[j]!;
      }
    }
  }
  const h = solveLinear(A, b);
  if (h === null) return null;
  const invDst = invert3(dst.T);
  return invDst === null ? null : mul3(mul3(invDst, [...h, 1]), src.T);
}

/** The homography from the unit rectangle 0…width × 0…height to four image corners (clockwise from the top-left). */
export function homographyFromCorners(width: number, height: number, corners: readonly Point[]): Homography | null {
  return homographyFromPairs([
    { u: 0, v: 0, x: corners[0]![0], y: corners[0]![1] },
    { u: width, v: 0, x: corners[1]![0], y: corners[1]![1] },
    { u: width, v: height, x: corners[2]![0], y: corners[2]![1] },
    { u: 0, v: height, x: corners[3]![0], y: corners[3]![1] },
  ]);
}

/** A deterministic sequence in [0, 1) (xorshift32): the same seed draws the same samples, so a scan is reproducible. */
export function xorshift(seed: number = 0x9e3779b9): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** The homography with most inliers (reprojection error ≤ tolerance) over random 4-subsets, refit on its inliers. */
export function ransacHomography(pairs: readonly Pair[], tolerance: number, iterations: number = 64, seed: number = 0x9e3779b9): Homography | null {
  if (pairs.length <= 4) return homographyFromPairs(pairs);
  const rnd = xorshift(seed);
  let best: Homography | null = null, bestInliers: Pair[] = [];
  for (let it = 0; it < iterations; it++) {
    const chosen = new Set<number>();
    while (chosen.size < 4) chosen.add(Math.floor(rnd() * pairs.length));
    const H = homographyFromPairs([...chosen].map((i) => pairs[i]!));
    if (H === null) continue;
    const inliers = pairs.filter((p) => { const [x, y] = applyH(H, p.u, p.v); return Math.hypot(x - p.x, y - p.y) <= tolerance; });
    if (inliers.length > bestInliers.length) {
      best = H;
      bestInliers = inliers;
      if (inliers.length === pairs.length) break;
    }
  }
  return bestInliers.length >= 4 ? (homographyFromPairs(bestInliers) ?? best) : best;
}

/**
 * A piecewise mapping: nodes along u and v (sorted) make cells; each cell maps with the homography through its four
 * corner nodes as `cornerAt` places them. Points outside the node span use the border cell (extrapolation).
 */
export function piecewiseMap(nodesU: readonly number[], nodesV: readonly number[], cornerAt: (u: number, v: number) => Point): (u: number, v: number) => Point {
  const cu = nodesU.length - 1, cv = nodesV.length - 1, cells: Homography[] = [];
  for (let j = 0; j < cv; j++) {
    for (let i = 0; i < cu; i++) {
      const corners = [[nodesU[i]!, nodesV[j]!], [nodesU[i + 1]!, nodesV[j]!], [nodesU[i + 1]!, nodesV[j + 1]!], [nodesU[i]!, nodesV[j + 1]!]] as const;
      const H = homographyFromPairs(corners.map(([u, v]) => { const [x, y] = cornerAt(u, v); return { u, v, x, y }; }));
      cells.push(H ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    }
  }
  const index = (nodes: readonly number[], t: number): number => {
    let i = 0;
    while (i < nodes.length - 2 && t > nodes[i + 1]!) i++;
    return i;
  };
  return (u, v) => applyH(cells[index(nodesV, v) * cu + index(nodesU, u)]!, u, v);
}
