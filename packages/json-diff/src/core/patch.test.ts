import { describe, expect, it } from "vitest";
import { diffJson } from "./diff";
import { applyJsonPatch, formatJsonPatch, toJsonPatch, toPointer } from "./patch";
import type { DiffOptions, JsonPatchOperation } from "./types";

function patchOf(left: string, right: string, options: DiffOptions = {}) {
  const result = diffJson(left, right, options);
  if (!result.ok) throw new Error(result.error.message);
  return toJsonPatch(result.value);
}

/** Equal by value, arrays compared by index. */
function sameValue(a: string, b: string): boolean {
  const result = diffJson(a, b);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.changes.length === 0;
}

const PAIRS: [string, string][] = [
  ['{"a":1}', '{"a":2}'],
  ['{"a":1,"b":2}', '{"b":2,"c":3}'],
  ["[1,2,3]", "[1,2]"],
  ["[1,2,3,4,5]", "[9]"],
  ["[1]", "[1,2,3]"],
  ['{"x":[{"id":1,"v":"a"},{"id":2,"v":"b"}]}', '{"x":[{"id":2,"v":"B"},{"id":3,"v":"c"}]}'],
  ['{"x":[{"id":1,"v":"a"}]}', '{"x":[{"id":1,"v":"z"}]}'],
  ['[{"id":1},{"id":2}]', '[{"id":2},{"id":1}]'],
  ['{"a":{"b":{"c":[1,{"d":null}]}}}', '{"a":{"b":{"c":[1,{"d":false}],"e":"~/x"}}}'],
  ["1", '"one"'],
  ['{"a/b":1,"m~n":2}', '{"a/b":3}'],
  ['{"n":12345678901234567890123}', '{"n":12345678901234567890124}'],
  ["[]", "{}"],
  ['{"same":[1,{"k":true}]}', '{"same":[1,{"k":true}]}'],
];

describe("toJsonPatch + applyJsonPatch", () => {
  for (const options of [{}, { arrayKey: "id" }] as DiffOptions[]) {
    for (const [left, right] of PAIRS) {
      it(`turns ${left} into ${right} ${JSON.stringify(options)}`, () => {
        const diff = diffJson(left, right, options);
        // By key, an array mixing objects and other values is an error, not a patch.
        if (!diff.ok) {
          expect(diff.error.message).toMatch(/mixes objects and other values/);
          return;
        }
        const applied = applyJsonPatch(left, toJsonPatch(diff.value));
        if (!applied.ok) throw new Error(applied.error.message);
        expect(sameValue(applied.value, right)).toBe(true);
      });
    }
  }
});

describe("toJsonPatch", () => {
  it("escapes pointers per RFC 6901", () => {
    expect(toPointer(["a/b", "m~n", 0])).toBe("/a~1b/m~0n/0");
    expect(toPointer([])).toBe("");
    expect(patchOf('{"a/b":1}', '{"a/b":2}')).toEqual([{ op: "replace", path: "/a~1b", value: "2" }]);
  });

  it("removes array items from the highest index down", () => {
    expect(patchOf("[1,2,3,4]", "[1,2]")).toEqual([
      { op: "remove", path: "/3" },
      { op: "remove", path: "/2" },
    ]);
  });

  it("keeps values exactly as written in the right document", () => {
    expect(patchOf('{"n":1}', '{"n":1.50}')).toEqual([{ op: "replace", path: "/n", value: "1.50" }]);
  });

  it("replaces a reordered keyed array whole", () => {
    expect(patchOf('[{"id":1},{"id":2}]', '[{"id":2},{"id":1}]', { arrayKey: "id" })).toEqual([
      { op: "replace", path: "", value: '[{"id":2},{"id":1}]' },
    ]);
  });

  it("is empty for equal documents", () => {
    expect(patchOf('{"a":1.0,"b":[1]}', '{"b":[1],"a":1}')).toEqual([]);
  });
});

describe("formatJsonPatch", () => {
  it("prints a JSON document with values verbatim", () => {
    const text = formatJsonPatch([
      { op: "replace", path: "/n", value: "1.50" },
      { op: "remove", path: "/x" },
      { op: "move", from: "/a", path: "/b" },
    ]);
    expect(text).toBe(
      '[\n  {"op": "replace", "path": "/n", "value": 1.50},\n  {"op": "remove", "path": "/x"},\n  {"op": "move", "path": "/b", "from": "/a"}\n]',
    );
    expect(formatJsonPatch([])).toBe("[]");
  });
});

describe("applyJsonPatch", () => {
  const apply = (input: string, ops: JsonPatchOperation[]) => applyJsonPatch(input, ops);

  it("supports all six operations", () => {
    const result = apply('{"a":[1,2],"b":{"c":1}}', [
      { op: "add", path: "/a/-", value: "3" },
      { op: "add", path: "/a/0", value: "0" },
      { op: "remove", path: "/a/1" },
      { op: "replace", path: "/b/c", value: '"x"' },
      { op: "copy", from: "/b", path: "/d" },
      { op: "move", from: "/d/c", path: "/e" },
      { op: "test", path: "/e", value: '"x"' },
    ]);
    if (!result.ok) throw new Error(result.error.message);
    expect(sameValue(result.value, '{"a":[0,2,3],"b":{"c":"x"},"d":{},"e":"x"}')).toBe(true);
  });

  it("prints with a two-space indent and keeps number spelling", () => {
    const result = apply('{"a":1}', [{ op: "add", path: "/b", value: "1.50" }]);
    expect(result).toEqual({ ok: true, value: '{\n  "a": 1,\n  "b": 1.50\n}' });
  });

  it("fails with the operation number on a missing path", () => {
    const result = apply("{}", [{ op: "remove", path: "/x" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("Operation 1 (remove /x): /x does not exist");
  });

  it("fails on a failed test, a bad pointer, a bad index, a bad value and a move into itself", () => {
    const messages = [
      apply('{"a":1}', [{ op: "test", path: "/a", value: "2" }]),
      apply("{}", [{ op: "add", path: "a", value: "1" }]),
      apply("[1]", [{ op: "add", path: "/5", value: "1" }]),
      apply("{}", [{ op: "add", path: "/a", value: "{" }]),
      apply('{"a":{"b":1}}', [{ op: "move", from: "/a", path: "/a/b/c" }]),
    ].map((result) => (result.ok ? "ok" : result.error.message));
    expect(messages).toEqual([
      "Operation 1 (test /a): value differs",
      'Operation 1 (add a): a path must be empty or start with "/"',
      "Operation 1 (add /5): index 5 is out of range",
      "Operation 1 (add /a): value is not valid JSON",
      "Operation 1 (move /a/b/c): cannot move a value into itself",
    ]);
  });

  it("reports invalid input JSON", () => {
    expect(apply("{", []).ok).toBe(false);
  });
});
