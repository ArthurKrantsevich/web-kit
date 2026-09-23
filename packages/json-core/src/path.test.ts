import { describe, expect, it } from "vitest";
import { formatPath, getAt, nodeAt, pathOf } from "./path";
import type { JsonNode } from "./types";
import { parseJson } from "./validate";

function parsed(input: string): JsonNode {
  const result = parseJson(input);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("formatPath", () => {
  it("writes identifiers with dots and everything else in brackets", () => {
    expect(formatPath([])).toBe("$");
    expect(formatPath(["users", 0, "name"])).toBe("$.users[0].name");
    expect(formatPath(["a b", '"', "1x", "_ok", "$d", ""])).toBe('$["a b"]["\\""]["1x"]._ok.$d[""]');
  });
});

describe("pathOf, getAt, nodeAt", () => {
  const input = '{"users": [{"name": "Ann"}, {"name": "Bob", "tags": ["x"]}], "a b": 1}';
  const root = parsed(input);

  it("finds the path of a node and follows it back", () => {
    const bob = getAt(root, ["users", 1, "name"]);
    expect(bob).toMatchObject({ type: "string", value: "Bob" });
    expect(pathOf(root, bob!)).toEqual(["users", 1, "name"]);
    expect(pathOf(root, root)).toEqual([]);
    expect(pathOf(root, parsed("1"))).toBeNull();
  });

  it("supports negative indexes and returns null for missing paths", () => {
    expect(getAt(root, ["users", -1, "tags", 0])).toMatchObject({ value: "x" });
    expect(getAt(root, ["users", 5])).toBeNull();
    expect(getAt(root, ["a b", "x"])).toBeNull();
  });

  it("uses the last duplicate key, like JSON.parse", () => {
    expect(getAt(parsed('{"a":1,"a":2}'), ["a"])).toMatchObject({ raw: "2" });
  });

  it("finds the deepest node at an offset", () => {
    expect(nodeAt(root, input.indexOf('"Bob"') + 1)).toMatchObject({ value: "Bob" });
    expect(nodeAt(root, input.indexOf('"tags"') + 1)).toMatchObject({ type: "array" });
    expect(nodeAt(root, 0)).toBe(root);
    expect(nodeAt(root, input.length)).toBeNull();
  });
});
