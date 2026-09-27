import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "json-diff",
  title: "JSON Diff",
  description: "Compare two JSON documents: every change with its path, exact numbers, arrays by index or by key, and a JSON Patch.",
  preview: `~ $.version  "1.0.0" → "1.1.0"
+ $.tools[2]
− $.stable
+ $.license`,
  category: "data",
  tags: ["json", "diff", "compare", "patch", "rfc 6902"],
  pkg: "@web-kit/json-diff",
  usage: `import { JsonDiff } from "@web-kit/json-diff";
import "@web-kit/json-diff/styles.css";

export function Page() {
  return <JsonDiff />;
}

// Logic only, no React:
import { diffJson, toJsonPatch } from "@web-kit/json-diff/core";

const result = diffJson('{"a":1}', '{"a":2}');
if (result.ok) console.log(toJsonPatch(result.value));`,
  api: [
    {
      name: "diffJson",
      signature: 'diffJson(left, right, { arrayKey?, numbers?: "value" | "raw" }): DiffResult',
      description: "Changes with kind, path, old and new value as written, and positions in both texts. Parse errors name the side.",
    },
    {
      name: "toJsonPatch",
      signature: "toJsonPatch(diff): JsonPatchOperation[]",
      description: "RFC 6902 operations that turn the left document into the right one. Values are JSON text, copied verbatim.",
    },
    {
      name: "formatJsonPatch",
      signature: "formatJsonPatch(ops): string",
      description: "The patch as a JSON document with values embedded exactly.",
    },
    {
      name: "applyJsonPatch",
      signature: "applyJsonPatch(input, ops): Result<string>",
      description: "Applies add, remove, replace, move, copy and test; errors name the operation.",
    },
    {
      name: "JsonDiff",
      signature: "<JsonDiff initialLeft? initialRight? className? />",
      description: "Ready-made UI: two inputs with Paste and Open file, options, a clickable list of changes, Download and Copy JSON Patch.",
    },
    {
      name: "useJsonDiff",
      signature: "useJsonDiff({ initialLeft?, initialRight? }): UseJsonDiff",
      description: "Headless state: both texts, options, the result and the patch text.",
    },
  ],
};
