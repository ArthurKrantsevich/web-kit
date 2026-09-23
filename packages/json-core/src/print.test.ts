import { describe, expect, it } from "vitest";
import { formatJson, minifyJson } from "./format";
import { printJson } from "./print";
import type { JsonNode, Result } from "./types";
import { parseJson } from "./validate";

function parsed(input: string): JsonNode {
  const result = parseJson(input);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function ok(result: Result<string>): string {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("printJson", () => {
  it("sorts keys recursively and leaves arrays alone", () => {
    expect(printJson(parsed('{"b":1,"a":{"d":2,"c":[3,1]}}'), { sortKeys: true })).toBe(
      '{\n  "a": {\n    "c": [\n      3,\n      1\n    ],\n    "d": 2\n  },\n  "b": 1\n}',
    );
  });

  it("keeps duplicate keys in their order when sorting", () => {
    expect(printJson(parsed('{"b":1,"a":2,"b":3}'), { sortKeys: true, minify: true })).toBe('{"a":2,"b":1,"b":3}');
  });

  it("sorts by code point, the same in every locale", () => {
    expect(printJson(parsed('{"é":1,"z":2,"Z":3,"a":4,"😀":5,"～":6}'), { sortKeys: true, minify: true })).toBe(
      '{"Z":3,"a":4,"z":2,"é":1,"～":6,"😀":5}',
    );
  });

  it("prints exactly what formatJson and minifyJson print", () => {
    for (const input of ['{"a":[1,2,{"b":null}],"c":{}}', "[ ]", '"x"', '{"n":12345678901234567890,"s":"\\u00e9 \\" ,"}']) {
      expect(printJson(parsed(input))).toBe(ok(formatJson(input)));
      expect(printJson(parsed(input), { indent: "\t" })).toBe(ok(formatJson(input, { indent: "\t" })));
      expect(printJson(parsed(input), { minify: true })).toBe(ok(minifyJson(input)));
    }
  });
});
