import { parseJson, type JsonNode } from "@web-kit/json-core";
import { describe, expect, it } from "vitest";
import { expandBreadthFirst, visibleRows, type TreeRow } from "./tree-model";

function parsed(input: string): JsonNode {
  const result = parseJson(input);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const labels = (rows: TreeRow[]) =>
  rows.map((row) => (row.kind === "node" ? [row.label, row.depth] : ["more", row.remaining]));

describe("visibleRows", () => {
  const root = parsed('{"a":{"b":1},"c":[1,2]}');

  it("lists expanded containers depth-first", () => {
    const { expanded } = expandBreadthFirst(root, 2);
    expect(labels(visibleRows(root, expanded))).toEqual([
      [null, 0],
      ["a", 1],
      ["b", 2],
      ["c", 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it("hides children of collapsed containers", () => {
    expect(labels(visibleRows(root, new Set([root.start])))).toEqual([
      [null, 0],
      ["a", 1],
      ["c", 1],
    ]);
  });

  it("pages long arrays", () => {
    const big = parsed(JSON.stringify(Array.from({ length: 1200 }, (_, i) => i)));
    const rows = visibleRows(big, new Set([big.start]));
    expect(rows).toHaveLength(502);
    expect(rows.at(-1)).toMatchObject({ kind: "more", remaining: 700, parentId: big.start });
    const more = visibleRows(big, new Set([big.start]), new Map([[big.start, 1000]]));
    expect(more).toHaveLength(1002);
    expect(more.at(-1)).toMatchObject({ kind: "more", remaining: 200 });
  });
});

describe("expandBreadthFirst", () => {
  it("expands everything that fits", () => {
    const root = parsed('{"a":{"b":{"c":[1]}}}');
    const { expanded, complete } = expandBreadthFirst(root, Infinity);
    expect(complete).toBe(true);
    expect(visibleRows(root, expanded)).toHaveLength(5);
  });

  it("stops at the row budget and reports it", () => {
    const root = parsed(JSON.stringify(Array.from({ length: 20 }, () => Array.from({ length: 500 }, (_, i) => i))));
    const { expanded, complete } = expandBreadthFirst(root, Infinity);
    expect(complete).toBe(false);
    expect(visibleRows(root, expanded).length).toBeLessThanOrEqual(5000);
  });
});
