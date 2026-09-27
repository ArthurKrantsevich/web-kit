import { compareTexts } from "./core/compare";
import type { CompareOptions, TextDiff } from "./core/types";

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

/** The worker's answer: the diff, or `error` when the job threw (no text is in it). */
export type CompareWorkerResponse = { id: number; value: TextDiff } | { id: number; error: "failed" };

/** What the worker does with one message. It never throws and never puts the texts into an error. */
export function answerCompareJob(request: CompareWorkerRequest): CompareWorkerResponse {
  try {
    const { left, right, options } = request.job;
    return { id: request.id, value: compareTexts(left, right, options) };
  } catch {
    return { id: request.id, error: "failed" };
  }
}
