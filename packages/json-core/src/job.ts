import { suggestFixes, type JsonFix } from "./fixes";
import { formatJson, minifyJson } from "./format";
import { printJson } from "./print";
import { getStats, type JsonStats } from "./stats";
import type { Indent, JsonNode, Result } from "./types";
import { parseJson, stripBom } from "./validate";

/** One formatting job: what JsonFormatter computes for an input in Format or Minify mode. */
export interface JsonJob {
  input: string;
  mode: "format" | "minify";
  /** Used in Format mode. */
  indent: Indent;
  sortKeys: boolean;
}

export interface JsonJobResult {
  /** The formatted or minified text, or the first error. */
  result: Result<string>;
  /** Verified one-step fixes when the input is not valid JSON; empty otherwise. */
  fixes: JsonFix[];
  /** The AST of valid input; null otherwise. */
  tree: JsonNode | null;
  stats: JsonStats | null;
  /** The input without a BOM: the text the tree's offsets point into. */
  source: string;
}

/** A job sent to the worker. `id` pairs it with its answer. */
export interface JsonWorkerRequest {
  id: number;
  job: JsonJob;
}

/** The worker's answer: the result, or `error` when the job threw (no user data is in it). */
export type JsonWorkerResponse = { id: number; value: JsonJobResult } | { id: number; error: "failed" };

/** Parses, formats (or minifies), counts and suggests fixes in one pass. The same code runs in the worker and on the page. */
export function runJsonJob(job: JsonJob): JsonJobResult {
  const source = stripBom(job.input);
  const parsed = parseJson(job.input);
  if (!parsed.ok) return { result: parsed, fixes: suggestFixes(job.input), tree: null, stats: null, source };
  const root = parsed.value;
  let result: Result<string>;
  if (job.sortKeys) {
    const printed = printJson(root, job.mode === "format" ? { indent: job.indent, sortKeys: true } : { minify: true, sortKeys: true });
    result = { ok: true, value: printed };
  } else {
    result = job.mode === "format" ? formatJson(job.input, { indent: job.indent }) : minifyJson(job.input);
  }
  return { result, fixes: [], tree: root, stats: getStats(root, job.input), source };
}

/** What the worker does with one message. It never throws and never puts the input into an error. */
export function answerJsonJob(request: JsonWorkerRequest): JsonWorkerResponse {
  try {
    return { id: request.id, value: runJsonJob(request.job) };
  } catch {
    return { id: request.id, error: "failed" };
  }
}
