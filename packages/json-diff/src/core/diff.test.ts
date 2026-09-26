import { describe, expect, it } from "vitest";
import { diffJson } from "./diff";
import type { DiffOptions } from "./types";

function changes(left: string, right: string, options: DiffOptions = {}) {
  const result = diffJson(left, right, options);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.changes.map((c) => ({ kind: c.kind, path: c.path, left: c.left?.raw, right: c.right?.raw }));
}

describe("diffJson", () => {
  it("finds added, removed and changed members with paths", () => {
    expect(changes('{"a":1,"b":2,"c":3}', '{"a":1,"b":20,"d":4}')).toEqual([
      { kind: "changed", path: ["b"], left: "2", right: "20" },
      { kind: "removed", path: ["c"], left: "3", right: undefined },
      { kind: "added", path: ["d"], left: undefined, right: "4" },
    ]);
  });

  it("reports offsets in both texts", () => {
    const result = diffJson('{"a": 1}', '{"a":  22}');
    if (!result.ok) throw new Error("parse");
    const [change] = result.value.changes;
    expect(change!.left).toEqual({ raw: "1", start: 6, end: 7 });
    expect(change!.right).toEqual({ raw: "22", start: 7, end: 9 });
  });

  it("ignores key order and compares strings by value", () => {
    expect(changes('{"a":"\\u0041","b":[1]}', '{"b":[1],"a":"A"}')).toEqual([]);
  });

  it("compares numbers exactly by value, or by spelling with numbers: raw", () => {
    expect(changes('{"n":1.0,"big":12345678901234567890}', '{"n":1,"big":12345678901234567890}')).toEqual([]);
    expect(changes('{"n":12345678901234567890}', '{"n":12345678901234567891}')).toEqual([
      { kind: "changed", path: ["n"], left: "12345678901234567890", right: "12345678901234567891" },
    ]);
    expect(changes('{"n":1.0}', '{"n":1}', { numbers: "raw" })).toEqual([
      { kind: "changed", path: ["n"], left: "1.0", right: "1" },
    ]);
  });

  it("compares arrays by index", () => {
    expect(changes("[1,2,3,4]", "[1,5]")).toEqual([
      { kind: "changed", path: [1], left: "2", right: "5" },
      { kind: "removed", path: [2], left: "3", right: undefined },
      { kind: "removed", path: [3], left: "4", right: undefined },
    ]);
    expect(changes("[1]", "[1,2]")).toEqual([{ kind: "added", path: [1], left: undefined, right: "2" }]);
  });

  it("matches array items by key and records the array for a whole replace", () => {
    const left = '[{"id":1,"v":"a"},{"id":2,"v":"b"},{"id":3,"v":"c"}]';
    const right = '[{"id":2,"v":"B"},{"id":1,"v":"a"},{"id":4,"v":"d"}]';
    const result = diffJson(left, right, { arrayKey: "id" });
    if (!result.ok) throw new Error("parse");
    expect(result.value.changes.map((c) => [c.kind, c.path])).toEqual([
      ["changed", [0, "v"]],
      ["added", [2]],
      ["removed", [2]],
    ]);
    expect(result.value.wholeArrays.map((w) => w.path)).toEqual([[]]);
  });

  it("reports no changes for a reordered keyed array but keeps it for the patch", () => {
    const result = diffJson('[{"id":1},{"id":2}]', '[{"id":2},{"id":1}]', { arrayKey: "id" });
    if (!result.ok) throw new Error("parse");
    expect(result.value.changes).toEqual([]);
    expect(result.value.wholeArrays.map((w) => w.path)).toEqual([[]]);
  });

  it("does not replace a keyed array whose items keep their order", () => {
    const result = diffJson('[{"id":1,"v":1}]', '[{"id":1,"v":2}]', { arrayKey: "id" });
    if (!result.ok) throw new Error("parse");
    expect(result.value.wholeArrays).toEqual([]);
  });

  it("compares arrays without objects by index even with arrayKey", () => {
    expect(changes("[1,2]", "[1,3]", { arrayKey: "id" })).toEqual([{ kind: "changed", path: [1], left: "2", right: "3" }]);
  });

  it("treats an empty array key as by index", () => {
    expect(changes('[{"a":1}]', '[{"a":2}]', { arrayKey: "" })).toEqual([
      { kind: "changed", path: [0, "a"], left: "1", right: "2" },
    ]);
  });

  it("reports a missing key with the side, path and position", () => {
    const result = diffJson('{"x":[{"id":1}]}', '{"x":[{"id":1},\n{"name":"n"}]}', { arrayKey: "id" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.side).toBe("right");
    expect(result.error.message).toBe('Item $.x[1] has no "id"');
    expect([result.error.line, result.error.column]).toEqual([2, 1]);
  });

  it("reports a duplicate key", () => {
    const result = diffJson('[{"id":1},{"id":1}]', "[]", { arrayKey: "id" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.side).toBe("left");
    expect(result.error.message).toBe('Items $[0] and $[1] have the same "id": 1');
  });

  it("reports an array that mixes objects and other values", () => {
    const result = diffJson('[{"id":1},2]', "[]", { arrayKey: "id" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('Array $ mixes objects and other values; cannot match items by "id"');
  });

  it("names the side of a parse error", () => {
    const result = diffJson("{}", "{");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.side).toBe("right");
  });

  it("treats a type change as one change and counts kinds", () => {
    const result = diffJson('{"a":{"b":1},"c":1}', '{"a":[1],"d":2}');
    if (!result.ok) throw new Error("parse");
    expect(result.value.changes[0]).toMatchObject({ kind: "changed", path: ["a"] });
    expect(result.value.counts).toEqual({ added: 1, removed: 1, changed: 1 });
  });

  it("uses the last of duplicate object keys", () => {
    expect(changes('{"a":1,"a":2}', '{"a":2}')).toEqual([]);
  });

  it("handles a leading BOM on either side", () => {
    const result = diffJson('﻿{"a":1}', '{"a":2}');
    if (!result.ok) throw new Error("parse");
    expect(result.value.changes[0]!.left).toEqual({ raw: "1", start: 5, end: 6 });
  });
});
