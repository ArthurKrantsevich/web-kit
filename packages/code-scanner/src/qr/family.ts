import { CASCADE_COST } from "../core/binarize";
import type { LevelBinarization, ScanContext } from "../core/context";
import { sampleGrid, type SoftGrid } from "../core/sample";
import { confidenceOf, geometryOf } from "../core/scan";
import type { BinarizerId, Candidate, ScanResult, Symbology, SymbologyDecoder } from "../core/types";
import { decodeMicroMatrix, decodeQrMatrix, decodeRmqrMatrix, type MatrixResult } from "./decode-matrix";
import { confirmFinder, findFinderPatterns, type FinderPattern } from "./finder";
import { BitMatrix } from "./layout";
import { buildQrMapping, dimensionCandidates, finderTriples, predictedThirdFinders, type Triple } from "./locate";
import { locateSingle } from "./single";

export type QrCandidate = { kind: "triple"; triple: Triple } | { kind: "single"; pattern: FinderPattern };

const SYMBOLOGY: Readonly<Record<MatrixResult["kind"], Symbology>> = { qr: "qr", micro: "micro-qr", rmqr: "rmqr" };

/** Per context, the milliseconds per pixel and unit of `CASCADE_COST` of every sampling binarization computed on it. */
const costs = new WeakMap<ScanContext, number[]>();
const costsOf = (ctx: ScanContext): number[] => { let c = costs.get(ctx); if (!c) { c = []; costs.set(ctx, c); } return c; };
const median = (xs: readonly number[]): number => { const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 === 1 ? s[h]! : (s[h - 1]! + s[h]!) / 2; };
const pixelsOf = (ctx: ScanContext, level: number): number => { const g = ctx.levels[Math.max(0, level)]!.gray; return g.width * g.height * (level === -1 ? 4 : 1); };

/**
 * The sampling binarization of a level for this pass, or null when the context has not computed it yet and, by the
 * median cost measured on this context (per pixel and per unit of the binarizer's `CASCADE_COST`), it could not finish
 * before the deadline: the cascade's rule for passes (decision 25) applied to one candidate's plane, which on a large
 * frame is the one step the deadline cannot interrupt. A computation is timed; the first ever is not predicted, like
 * the cascade's first pass.
 */
function binarizeForSampling(ctx: ScanContext, level: number, id: BinarizerId, hint: number): LevelBinarization | null {
  const { inverted, flat } = ctx.pass;
  if (ctx.cached(level, id, inverted, flat, hint)) return ctx.binarize(level, id, inverted, flat, hint);
  const measured = costsOf(ctx), work = pixelsOf(ctx, level) * CASCADE_COST[id];
  if (measured.length > 0 && performance.now() + median(measured) * work > ctx.deadline) return null;
  const t0 = performance.now(), bin = ctx.binarize(level, id, inverted, flat, hint);
  measured.push((performance.now() - t0) / work);
  return bin;
}

/**
 * The QR family: QR Code through finder triples, Micro QR and rMQR through a single finder. `locate` works on the
 * start level (and, with tryHarder on a small image, the ×2 upscaled plane: decision 12); `decode` samples on the
 * coarsest level where the module is at least 2.5 px (the upscaled plane under that with tryHarder), then the next
 * finer level once when that fails.
 */
export const qrFamily: SymbologyDecoder = {
  id: "qr-family",
  family: "2d",
  locate(ctx: ScanContext): Candidate[] {
    const levels = [ctx.startLevel];
    if (ctx.tryHarder && ctx.startLevel === 0 && Math.max(ctx.levels[0]!.gray.width, ctx.levels[0]!.gray.height) <= 400) levels.push(-1);
    const out: Candidate[] = [];
    for (const level of levels) {
      if (ctx.expired()) break;
      const bin = ctx.binarize(level, ctx.pass.id, ctx.pass.inverted, ctx.pass.flat, 5, false);
      const patterns = findFinderPatterns(bin.plane, { tolerance: ctx.tryHarder ? 0.7 : 0.5, areaTolerance: ctx.tryHarder ? 0.6 : 0.4, totalTolerance: ctx.tryHarder ? 0.6 : 0.4 });
      // tryHarder with few finders: a third one squeezed by perspective may fail the run checks; predict it from each
      // pair and confirm it by its concentric rings (decision 26)
      if (ctx.tryHarder && patterns.length >= 2 && patterns.length < 6) {
        const extra: FinderPattern[] = [];
        for (let i = 0; i < patterns.length; i++) for (let j = i + 1; j < patterns.length; j++) {
          const a = patterns[i]!, b = patterns[j]!, m = (a.module + b.module) / 2;
          for (const [cx, cy] of predictedThirdFinders(a, b)) {
            if ([...patterns, ...extra].some((p) => Math.hypot(p.x - cx, p.y - cy) < 4 * m)) continue;
            const found = confirmFinder(bin.plane, cx, cy, m);
            if (found) extra.push(found);
          }
        }
        patterns.push(...extra);
      }
      ctx.log.push({ pass: ctx.pass, level, finders: patterns.length });
      const inTriple = new Set<FinderPattern>();
      for (const triple of finderTriples(patterns, { angleTolerance: ctx.tryHarder ? 0.25 : 0.15, ratioLimit: ctx.tryHarder ? 2.5 : 1.6, plane: bin.plane, minTiming: ctx.tryHarder ? 0.6 : 0.7 })) {
        const detail: QrCandidate = { kind: "triple", triple };
        out.push({ level, module: triple.module, corners: [[triple.tl.x, triple.tl.y], [triple.tr.x, triple.tr.y], [triple.bl.x, triple.bl.y]], detail });
        inTriple.add(triple.tl).add(triple.tr).add(triple.bl);
      }
      // a finder of a QR's triple is not also a Micro QR or rMQR finder
      for (const pattern of patterns) {
        if (inTriple.has(pattern)) continue;
        const detail: QrCandidate = { kind: "single", pattern };
        out.push({ level, module: pattern.module, corners: [[pattern.x, pattern.y]], detail });
      }
    }
    return out;
  },
  decode(ctx: ScanContext, candidate: Candidate): ScanResult | null {
    const scaleOf = (level: number): number => (level === -1 ? 0.5 : ctx.levels[level]!.scale);
    const scaleAt = (level: number): number => scaleOf(candidate.level) / scaleOf(level);
    // the coarsest level where the module is at least 2.5 px (the upscaled plane under that with tryHarder); when the
    // decode fails there, the next finer level once
    let level = candidate.level;
    while (level > 0 && candidate.module * scaleAt(level) < 2.5) level--;
    if (level === 0 && candidate.module * scaleAt(0) < 2.5 && ctx.tryHarder) level = -1;
    return decodeAt(ctx, candidate, level, scaleAt(level)) ?? (level > 0 && !ctx.expired() ? decodeAt(ctx, candidate, level - 1, scaleAt(level - 1)) : null);
  },
};

/** One decode of a candidate on `level`, its geometry scaled by `k` from the candidate's level. */
function decodeAt(ctx: ScanContext, candidate: Candidate, level: number, k: number): ScanResult | null {
  const detail = candidate.detail as QrCandidate;
  // the edge pass's plane is an edge map and its threshold a Sobel magnitude: the grid, the alignment patterns and
  // the timing walks are read on a gray binarization of the same level instead
  const bin = binarizeForSampling(ctx, level, ctx.pass.id === "edge" ? "hybrid" : ctx.pass.id, candidate.module * k);
  if (!bin) return null;
  const scaled = (p: FinderPattern): FinderPattern => ({ ...p, x: p.x * k, y: p.y * k, module: p.module * k });
  if (detail.kind === "triple") {
    const t = detail.triple, triple: Triple = { tl: scaled(t.tl), tr: scaled(t.tr), bl: scaled(t.bl), module: t.module * k, legModules: t.legModules };
    for (const dim of dimensionCandidates(triple)) {
      if (ctx.expired()) return null;
      const mapping = buildQrMapping(bin.plane, triple, dim);
      if (!mapping) continue;
      const grid = sampleGrid(bin.gray, bin, mapping.map, dim, dim);
      if (!grid) continue;
      const r = decodeQrMatrix(new BitMatrix(dim, dim, grid.bits), grid.confidence);
      ctx.log.push({ decode: "qr", dim, ok: r !== null, alignments: mapping.alignments, sampled: bin.id, level });
      if (r) return finish(ctx, r, mapping.map, dim, dim, bin.scale, grid, false);
    }
    return null;
  }
  const single = locateSingle(bin, scaled(detail.pattern), ctx);
  if (!single) return null;
  const grid = sampleGrid(bin.gray, bin, single.map, single.width, single.height);
  if (!grid) return null;
  const matrix = new BitMatrix(single.width, single.height, grid.bits);
  const r = single.kind === "micro" ? decodeMicroMatrix(matrix, grid.confidence) : decodeRmqrMatrix(matrix, grid.confidence);
  ctx.log.push({ decode: single.kind, width: single.width, height: single.height, ok: r !== null, sampled: bin.id, level });
  return r ? finish(ctx, r, single.map, single.width, single.height, bin.scale, grid, single.mirrored) : null;
}

/**
 * The result: `points` in the symbol's own frame (top-left, top-right, bottom-right, bottom-left as it is read). A
 * reflected map (rMQR through a reflected finder orientation) is already in that frame; a matrix the decoder read
 * transposed (QR, Micro QR) has its u and v axes swapped in the image, so the map is transposed for the geometry.
 */
function finish(ctx: ScanContext, r: MatrixResult, map: (u: number, v: number) => [number, number], width: number, height: number, scale: number, grid: SoftGrid, reflected: boolean): ScanResult | null {
  const confidence = confidenceOf(grid, r.ecc);
  if (confidence < 0.5) return null;
  const geo = r.mirrored ? geometryOf((u, v) => map(v, u), height, width, scale, ctx.offset) : geometryOf(map, width, height, scale, ctx.offset);
  return {
    symbology: SYMBOLOGY[r.kind], text: r.text, bytes: r.bytes, segments: r.segments, eci: r.eci, charset: r.charset, gs1: r.gs1, structuredAppend: r.structuredAppend,
    points: geo.points, orientation: geo.orientation, mirrored: r.mirrored || reflected, inverted: ctx.pass.inverted, symbol: r.symbol, ecc: r.ecc, confidence,
  };
}
