import { CASCADE, ScanContext } from "./context";
import type { SoftGrid } from "./sample";
import type { Candidate, EccInfo, Point, ScanImage, ScanOptions, ScanResult } from "./types";

/** Intersection over union of two quadrilaterals' bounding boxes. */
export function iou(a: readonly Point[], b: readonly Point[]): number {
  const box = (p: readonly Point[]) => ({ x0: Math.min(...p.map((q) => q[0])), x1: Math.max(...p.map((q) => q[0])), y0: Math.min(...p.map((q) => q[1])), y1: Math.max(...p.map((q) => q[1])) });
  const A = box(a), B = box(b);
  const ix = Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0)), iy = Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0));
  const inter = ix * iy, union = (A.x1 - A.x0) * (A.y1 - A.y0) + (B.x1 - B.x0) * (B.y1 - B.y0) - inter;
  return union > 0 ? inter / union : 0;
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** The symbol's four corners in input coordinates (through the level's scale and the ROI offset) and its orientation. */
export function geometryOf(map: (u: number, v: number) => Point, width: number, height: number, scale: number, offset: Point): { points: [Point, Point, Point, Point]; orientation: number } {
  const at = (u: number, v: number): Point => { const [x, y] = map(u, v); return [x * scale + offset[0], y * scale + offset[1]]; };
  const points: [Point, Point, Point, Point] = [at(0, 0), at(width, 0), at(width, height), at(0, height)];
  const angle = (Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0]) * 180) / Math.PI;
  return { points, orientation: ((Math.round(angle) % 360) + 360) % 360 };
}

/** The spec's confidence: the share of modules at or above 0.15 confidence, times 1 − corrected / capacity. */
export function confidenceOf(grid: SoftGrid, ecc: EccInfo): number {
  let sure = 0;
  for (let i = 0; i < grid.confidence.length; i++) if (grid.confidence[i]! >= 0.15) sure++;
  return (sure / grid.confidence.length) * (1 - ecc.corrected / Math.max(1, ecc.capacity));
}

/**
 * Scans an image: the lighting modes, then the cascade's passes, then every decoder's candidates (locators' candidates
 * first). Stops at the first result unless `multiple`; checks the deadline between steps. Results of one symbology and
 * bytes whose boxes overlap by more than 0.3 IoU merge, the more confident staying.
 */
export function scan(image: ScanImage, options: ScanOptions): ScanResult[] {
  if (options.decoders.length === 0) return [];
  const ctx = new ScanContext(image, options);
  const results: ScanResult[] = [];
  const add = (r: ScanResult): void => {
    const i = results.findIndex((o) => o.symbology === r.symbology && sameBytes(o.bytes, r.bytes) && iou(o.points, r.points) > 0.3);
    if (i < 0) results.push(r);
    else if (r.confidence > results[i]!.confidence) results[i] = r;
  };
  const passes = CASCADE.filter((p) => ctx.tryHarder || !p.hard);
  const lightings = ctx.unevenLighting() ? [true, false] : ctx.tryHarder ? [false, true] : [false];
  let lastPassMs = 0;
  outer: for (const flat of lightings) {
    for (const pass of passes) {
      // a pass that could not finish before the deadline, judged by the previous pass, is not started (decision 25)
      if (performance.now() + lastPassMs > ctx.deadline) break outer;
      const passStart = performance.now();
      ctx.pass = { id: pass.id, inverted: pass.inverted, flat };
      for (const decoder of options.decoders) {
        if (ctx.expired()) break outer;
        const candidates: Candidate[] = [];
        for (const locator of options.locators ?? []) candidates.push(...locator.locate(ctx));
        candidates.push(...decoder.locate(ctx));
        for (const candidate of candidates) {
          if (ctx.expired()) break outer;
          const r = decoder.decode(ctx, candidate);
          if (r === null) continue;
          add(r);
          if (!options.multiple) break outer;
        }
      }
      lastPassMs = performance.now() - passStart;
    }
    if (results.length > 0) break;
  }
  return results;
}
