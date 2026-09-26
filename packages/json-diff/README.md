# @web-kit/json-diff

Compare two JSON documents exactly. Every change has its path, the old and new value as written, and its position in both texts. Arrays are compared by index or matched by a key. The result exports to JSON Patch (RFC 6902).

## Logic only (no React)

```ts
import { applyJsonPatch, diffJson, formatJsonPatch, toJsonPatch } from "@web-kit/json-diff/core";

const result = diffJson('{"a":1,"b":[1,2]}', '{"a":1.0,"b":[1,3]}');
if (result.ok) {
  result.value.changes; // [{ kind: "changed", path: ["b", 1], left: { raw: "2", … }, right: { raw: "3", … } }]
  const patch = toJsonPatch(result.value); // [{ op: "replace", path: "/b/1", value: "3" }]
  formatJsonPatch(patch); // the patch as JSON text
  applyJsonPatch('{"a":1,"b":[1,2]}', patch); // { ok: true, value: "{\n  \"a\": 1,\n  \"b\": [\n    1,\n    3\n  ]\n}" }
}
```

- Numbers compare as exact decimals: `1.0` equals `1`, big integers keep every digit. `numbers: "raw"` compares spelling.
- Strings compare by value: `"A"` equals `"A"`. Key order does not matter; with duplicate keys the last one wins.
- `arrayKey: "id"` matches objects in arrays by `id`, ignoring their order. A missing or repeated key, or an array that mixes objects and other values, is an error with its path. If items were added, removed or reordered, the JSON Patch replaces that array whole.
- A patch `value` is JSON text, so numbers keep their spelling. `applyJsonPatch` supports `add`, `remove`, `replace`, `move`, `copy` and `test`, and prints the result with a two-space indent.
- Parse errors say which side failed: `{ ok: false, side: "right", error }`.

## React component

```tsx
import { JsonDiff } from "@web-kit/json-diff";
import "@web-kit/json-diff/styles.css";

export function Page() {
  return <JsonDiff initialLeft='{"a":1}' initialRight='{"a":2}' />;
}
```

`useJsonDiff()` gives the same state without markup. Set `--wk-diff-height` to change the height of the two inputs.
