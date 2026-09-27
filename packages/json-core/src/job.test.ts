import { describe, expect, it } from "vitest";
import { suggestFixes } from "./fixes";
import { formatJson, minifyJson } from "./format";
import { answerJsonJob, runJsonJob, type JsonJob } from "./job";
import { printJson } from "./print";
import { getStats } from "./stats";
import { parseJson } from "./validate";

const job = (input: string, patch: Partial<JsonJob> = {}): JsonJob => ({
  input,
  mode: "format",
  indent: 2,
  sortKeys: false,
  ...patch,
});

describe("runJsonJob", () => {
  it("formats like formatJson and returns the tree and stats", () => {
    const input = '{"b": 1.50, "a": [true, null]}';
    const parsed = parseJson(input);
    if (!parsed.ok) throw new Error("fixture");
    expect(runJsonJob(job(input, { indent: 4 }))).toEqual({
      result: formatJson(input, { indent: 4 }),
      fixes: [],
      tree: parsed.value,
      stats: getStats(parsed.value, input),
      source: input,
    });
  });

  it("minifies like minifyJson, and sorts keys like printJson", () => {
    const input = '{"b": 1, "a": {"d": 2, "c": 3}}';
    const parsed = parseJson(input);
    if (!parsed.ok) throw new Error("fixture");
    expect(runJsonJob(job(input, { mode: "minify" })).result).toEqual(minifyJson(input));
    expect(runJsonJob(job(input, { mode: "minify", sortKeys: true })).result).toEqual({
      ok: true,
      value: printJson(parsed.value, { minify: true, sortKeys: true }),
    });
    expect(runJsonJob(job(input, { sortKeys: true, indent: "\t" })).result).toEqual({
      ok: true,
      value: printJson(parsed.value, { indent: "\t", sortKeys: true }),
    });
  });

  it("returns the error and the verified fixes for invalid input, without a tree", () => {
    const input = "[1, 2,]";
    const result = runJsonJob(job(input));
    expect(result.result.ok).toBe(false);
    expect(result.fixes).toEqual(suggestFixes(input));
    expect(result.fixes.map((fix) => fix.text)).toEqual(["[1, 2]"]);
    expect([result.tree, result.stats]).toEqual([null, null]);
  });

  it("gives the text without a BOM as the source of the tree's offsets", () => {
    const result = runJsonJob(job('﻿{"a":1}'));
    expect(result.source).toBe('{"a":1}');
    expect(result.tree?.start).toBe(0);
  });

  it("handles more than 1 MB, the size at which the tools switch to the worker", () => {
    const input = JSON.stringify(Array.from({ length: 40_000 }, (_, id) => ({ id, name: `user ${id}` })));
    expect(input.length).toBeGreaterThan(1024 * 1024);
    const result = runJsonJob(job(input, { mode: "minify" }));
    expect(result.result).toEqual({ ok: true, value: input });
    expect(result.stats?.counts.object).toBe(40_000);
  });
});

describe("answerJsonJob", () => {
  it("pairs the answer with the request id", () => {
    expect(answerJsonJob({ id: 7, job: job("[1]") })).toEqual({ id: 7, value: runJsonJob(job("[1]")) });
  });

  it("answers `failed` without any of the input when the job throws", () => {
    const hostile = { id: 3, job: { ...job("[1]"), get input(): string { throw new Error("secret input"); } } };
    const answer = answerJsonJob(hostile);
    expect(answer).toEqual({ id: 3, error: "failed" });
    expect(JSON.stringify(answer)).not.toContain("secret");
  });
});
