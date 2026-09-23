import { describe, expect, it } from "vitest";
import { repairJson, suggestFixes } from "./fixes";
import { validateJson } from "./validate";

function firstFix(input: string) {
  const [fix] = suggestFixes(input);
  if (!fix) throw new Error("expected a fix");
  return fix;
}

describe("suggestFixes", () => {
  it.each([
    ["trailing comma in array", "[1,2,]", "trailing-comma", "[1,2]"],
    ["trailing comma in object", '{"a":1,}', "trailing-comma", '{"a":1}'],
    ["missing comma between properties", '{"a": 1 "b": 2}', "missing-comma", '{"a": 1, "b": 2}'],
    ["missing comma between elements", "[1 2]", "missing-comma", "[1, 2]"],
    ["line comment", '{"a": 1 // note\n}', "comment", '{"a": 1 \n}'],
    ["block comment", "/* x */ [1]", "comment", " [1]"],
    ["single-quoted key", "{'a': 1}", "single-quotes", '{"a": 1}'],
    ["unquoted key", "{a: 1}", "unquoted-key", '{"a": 1}'],
    ["Python literal", '{"a": True}', "python-literal", '{"a": true}'],
    ["curly quotes", "{“a”: 1}", "smart-quotes", '{"a": 1}'],
    ["raw line break in a string", '["a\nb"]', "control-character", '["a\\nb"]'],
    ["unclosed brackets", '{"a": [1, 2', "missing-closers", '{"a": [1, 2]}'],
    ["unclosed string", '["abc', "missing-closers", '["abc"]'],
    ["unclosed array after a comma", "[1,2,", "missing-closers", "[1,2]"],
  ])("fixes %s", (_name, input, rule, expected) => {
    const fix = firstFix(input);
    expect(fix.rule).toBe(rule);
    expect(fix.text).toBe(expected);
    expect(validateJson(fix.text)).toBeNull();
  });

  it("offers nothing it cannot verify", () => {
    for (const input of ['{"a":}', '{"a": @}', "[1,,2]", '{"a" 1}']) {
      expect(suggestFixes(input)).toEqual([]);
    }
  });

  it("does not close a string that probably lost its quote earlier", () => {
    for (const input of ['{"name": "Bob}', '["a", "b]', '["a, b', '{\n  "a": "x",\n  "b": "y\n}']) {
      expect(suggestFixes(input)).toEqual([]);
      expect(repairJson(input).ok).toBe(false);
    }
  });

  it("escapes a line break only when that makes the string end where it should", () => {
    expect(suggestFixes('{"a": "y\n, "b": 1}')).toEqual([]);
    expect(repairJson('["a\nb\nc"]')).toEqual({
      ok: true,
      value: '["a\\nb\\nc"]',
      changes: ["Escape line break in string", "Escape line break in string"],
    });
  });

  it("returns nothing for valid JSON", () => {
    expect(suggestFixes('{"a":1}')).toEqual([]);
  });

  it("drops a rule when the parser still fails at the edited spot", () => {
    // `{true: 1}` is still invalid at the same place, so only quoting the key is offered.
    expect(suggestFixes("{True: 1}").map((fix) => fix.rule)).toEqual(["unquoted-key"]);
  });

  it("keeps escapes when converting single quotes", () => {
    expect(firstFix("['it\\'s \"ok\"']").text).toBe('["it\'s \\"ok\\""]');
  });

  it("strips a BOM before fixing", () => {
    expect(firstFix("﻿[1,]").text).toBe("[1]");
  });
});

describe("repairJson", () => {
  it("applies verified fixes one by one until the JSON is valid", () => {
    expect(repairJson("{a: 1, b: [True, None,]")).toEqual({
      ok: true,
      value: '{"a": 1, "b": [true, null]}',
      changes: [
        "Add quotes around key a",
        "Add quotes around key b",
        "Replace True with true",
        "Replace None with null",
        "Remove trailing comma",
        "Close bracket: }",
      ],
    });
  });

  it("returns the original error when something cannot be fixed", () => {
    const result = repairJson('{a: 1, "b": }');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ line: 1, column: 2 });
  });

  it("returns valid input unchanged", () => {
    expect(repairJson("[1]")).toEqual({ ok: true, value: "[1]", changes: [] });
  });
});
