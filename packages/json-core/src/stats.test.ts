import { describe, expect, it } from "vitest";
import { getStats, utf8Length } from "./stats";
import type { JsonNode } from "./types";
import { parseJson } from "./validate";

function parsed(input: string): JsonNode {
  const result = parseJson(input);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("getStats", () => {
  it("counts keys, depth, node types and bytes", () => {
    const input = '{"a":[1,2,3],"b":{"c":null,"d":"é"}}';
    expect(getStats(parsed(input), input)).toEqual({
      bytes: 37,
      keys: 4,
      depth: 2,
      counts: { object: 2, array: 1, string: 1, number: 3, boolean: 0, null: 1 },
      longestArray: 3,
    });
  });

  it("handles a scalar root", () => {
    expect(getStats(parsed("42"), "42")).toEqual({
      bytes: 2,
      keys: 0,
      depth: 0,
      counts: { object: 0, array: 0, string: 0, number: 1, boolean: 0, null: 0 },
      longestArray: 0,
    });
  });
});

describe("utf8Length", () => {
  it("counts multi-byte characters like TextEncoder", () => {
    expect(utf8Length("é😀a")).toBe(7);
    expect(utf8Length("\uD800")).toBe(3);
  });
});
