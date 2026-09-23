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
  const root = parsed('{"a":{"b":1},"c":[1,2],"d e":[]}');

  it("lists expanded containers depth-first, identified by path", () => {
    const { expanded } = expandBreadthFirst(root, 2);
    const rows = visibleRows(root, expanded);
    expect(labels(rows)).toEqual([
      [null, 0],
      ["a", 1],
      ["b", 2],
      ["c", 1],
      [0, 2],
      [1, 2],
      ["d e", 1],
    ]);
    expect(rows.map((row) => row.id)).toEqual(["$", "$.a", "$.a.b", "$.c", "$.c[0]", "$.c[1]", '$["d e"]']);
    expect(rows.slice(3, 6).map((row) => row.kind === "node" && [row.position, row.siblings])).toEqual([
      [2, 3],
      [1, 2],
      [2, 2],
    ]);
  });

  it("hides children of collapsed containers", () => {
    expect(labels(visibleRows(root, new Set(["$"])))).toEqual([
      [null, 0],
      ["a", 1],
      ["c", 1],
      ["d e", 1],
    ]);
  });

  it("pages long arrays", () => {
    const big = parsed(JSON.stringify(Array.from({ length: 1200 }, (_, i) => i)));
    const rows = visibleRows(big, new Set(["$"]));
    expect(rows).toHaveLength(502);
    expect(rows.at(-1)).toMatchObject({ kind: "more", remaining: 700, parentId: "$" });
    const more = visibleRows(big, new Set(["$"]), new Map([["$", 1000]]));
    expect(more).toHaveLength(1002);
    expect(more.at(-1)).toMatchObject({ kind: "more", remaining: 200 });
  });
});

describe("expandBreadthFirst", () => {
  it("expands everything that fits", () => {
    const root = parsed('{"a":{"b":{"c":[1]}}}');
    const { expanded, collapsed } = expandBreadthFirst(root, Infinity);
    expect(collapsed).toBe(0);
    expect(visibleRows(root, expanded)).toHaveLength(5);
  });

  it("stops at the row budget and counts what stayed collapsed", () => {
    const root = parsed(JSON.stringify(Array.from({ length: 20 }, () => Array.from({ length: 500 }, (_, i) => i))));
    const { expanded, collapsed } = expandBreadthFirst(root, Infinity);
    expect(collapsed).toBe(11);
    expect(visibleRows(root, expanded).length).toBeLessThanOrEqual(5000);
  });

  it("never marks empty containers as expandable", () => {
    const root = parsed('{"a":{},"b":[]}');
    expect([...expandBreadthFirst(root, Infinity).expanded]).toEqual(["$"]);
  });
});
