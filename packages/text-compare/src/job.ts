import { compareTexts } from "./core/compare";
import type { CompareOptions, DiffBlock, LinePair, TextDiff } from "./core/types";

/** One comparison for the worker: what TextCompare computes for large texts. */
export interface CompareJob {
  left: string;
  right: string;
  options: CompareOptions;
}

/** A job sent to the worker. `id` pairs it with its answer. */
export interface CompareWorkerRequest {
  id: number;
  job: CompareJob;
}

/**
 * A diff in two typed arrays, so the worker can hand it over without copying (a transfer) and the page does not spend
 * time reading tens of thousands of small objects. `blocks` has 7 numbers per block: kind (0 equal, 1 change), left
 * start and end, right start and end, the index of its first pair in `pairs` and the number of pairs (-1: none).
 * `pairs` has 2 numbers per pair: left and right line, -1 for none.
 */
export interface PackedDiff {
  blocks: Int32Array;
  pairs: Int32Array;
  counts: TextDiff["counts"];
  approximate: boolean;
  lineEndings: TextDiff["lineEndings"];
  finalNewline: TextDiff["finalNewline"];
}

export function packDiff(diff: TextDiff): PackedDiff {
  const blocks = new Int32Array(diff.blocks.length * 7);
  let pairCount = 0;
  for (const block of diff.blocks) pairCount += block.pairs?.length ?? 0;
  const pairs = new Int32Array(pairCount * 2);
  let p = 0;
  diff.blocks.forEach((block, b) => {
    blocks.set([block.kind === "change" ? 1 : 0, block.left.start, block.left.end, block.right.start, block.right.end, p, block.pairs?.length ?? -1], b * 7);
    for (const pair of block.pairs ?? []) {
      pairs[p * 2] = pair.left ?? -1;
      pairs[p * 2 + 1] = pair.right ?? -1;
      p++;
    }
  });
  const { counts, approximate, lineEndings, finalNewline } = diff;
  return { blocks, pairs, counts, approximate, lineEndings, finalNewline };
}

export function unpackDiff(packed: PackedDiff): TextDiff {
  const { blocks: b, pairs: q } = packed;
  const blocks: DiffBlock[] = [];
  for (let k = 0; k < b.length; k += 7) {
    const block: DiffBlock = { kind: b[k] === 1 ? "change" : "equal", left: { start: b[k + 1]!, end: b[k + 2]! }, right: { start: b[k + 3]!, end: b[k + 4]! } };
    const count = b[k + 6]!;
    if (count >= 0) {
      const pairs: LinePair[] = [];
      for (let p = b[k + 5]!, end = p + count; p < end; p++) {
        const pair: LinePair = {};
        if (q[p * 2]! >= 0) pair.left = q[p * 2]!;
        if (q[p * 2 + 1]! >= 0) pair.right = q[p * 2 + 1]!;
        pairs.push(pair);
      }
      block.pairs = pairs;
    }
    blocks.push(block);
  }
  const { counts, approximate, lineEndings, finalNewline } = packed;
  return { blocks, counts, approximate, lineEndings, finalNewline };
}

/** The worker's answer: the packed diff, or `error` when the job threw (no text is in it). */
export type CompareWorkerResponse = { id: number; packed: PackedDiff } | { id: number; error: "failed" };

/** What the worker does with one message. It never throws and never puts the texts into an error. */
export function answerCompareJob(request: CompareWorkerRequest): CompareWorkerResponse {
  try {
    const { left, right, options } = request.job;
    return { id: request.id, packed: packDiff(compareTexts(left, right, options)) };
  } catch {
    return { id: request.id, error: "failed" };
  }
}
