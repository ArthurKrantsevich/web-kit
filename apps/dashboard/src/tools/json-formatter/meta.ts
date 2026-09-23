import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "json-formatter",
  title: "JSON Formatter",
  description: "Format, minify and validate JSON. Tree view, highlighting, stats, exact error positions and verified fixes.",
  category: "data",
  tags: ["json", "format", "minify", "validate", "pretty print"],
  pkg: "@web-kit/json-formatter",
  usage: `import { JsonFormatter } from "@web-kit/json-formatter";
import "@web-kit/json-formatter/styles.css";

export function Page() {
  return <JsonFormatter />;
}

// Logic only, no React:
import { formatJson } from "@web-kit/json-formatter/core";

const result = formatJson('{"a":1}', { indent: 2 });
if (result.ok) console.log(result.value);`,
  api: [
    {
      name: "formatJson",
      signature: 'formatJson(input: string, options?: { indent?: 2 | 4 | "\\t" }): Result<string>',
      description: "Pretty-prints JSON. Numbers, key order and duplicate keys stay exactly as written.",
    },
    {
      name: "minifyJson",
      signature: "minifyJson(input: string): Result<string>",
      description: "Removes all insignificant whitespace.",
    },
    {
      name: "validateJson",
      signature: "validateJson(input: string): JsonError | null",
      description: "Returns null for valid JSON, otherwise the first error with offset, line and column.",
    },
    {
      name: "suggestFixes",
      signature: "suggestFixes(input: string): JsonFix[]",
      description: "Rule-based fixes for the first error. Each one is re-validated; nothing is guessed.",
    },
    {
      name: "repairJson",
      signature: "repairJson(input: string): RepairResult",
      description: "Applies verified fixes until the JSON is valid; fails with the original error otherwise.",
    },
    {
      name: "codeFrame",
      signature: "codeFrame(input: string, error: JsonError, context?: number): string",
      description: "Lines around the error with a caret, like a compiler message.",
    },
    {
      name: "useJsonFormatter",
      signature: "useJsonFormatter(options?: { initialInput?: string; initialIndent?: Indent }): UseJsonFormatter",
      description: "Headless React hook: input, indent, mode and the current result.",
    },
    {
      name: "JsonFormatter",
      signature: "<JsonFormatter initialInput? initialIndent? className? />",
      description: "Ready-made UI: input, output, format/minify switch, indent and copy button.",
    },
    {
      name: "JsonTree",
      signature: "<JsonTree root={node} source={text} onShowInInput? initialDepth? />",
      description: "Collapsible, keyboard-accessible tree with paths, copy path/value and paging for large arrays.",
    },
    {
      name: "HighlightedJson",
      signature: "<HighlightedJson text={formatted} />",
      description: "Syntax-highlighted JSON with line numbers; plain text above 200 KB.",
    },
    {
      name: "JsonStats",
      signature: "<JsonStats stats={getStats(node, text)} />",
      description: "One line: size, keys, depth and counts by type.",
    },
  ],
};
