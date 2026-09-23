"use client";

export * from "./core/index";
// Needed to use JsonTree and JsonStats on their own.
export {
  escapeJson,
  getStats,
  parseJson,
  printJson,
  unescapeJson,
  type JsonNode,
  type JsonStats as JsonStatsData,
  type PrintOptions,
  type Unescaped,
} from "@web-kit/json-core";
export {
  useJsonFormatter,
  type JsonFormatterMode,
  type JsonOutputView,
  type UseJsonFormatter,
  type UseJsonFormatterOptions,
} from "./ui/useJsonFormatter";
export { JsonTree, type JsonTreeProps } from "./ui/JsonTree";
export { HighlightedJson, type HighlightedJsonProps } from "./ui/HighlightedJson";
export { JsonStats, formatStats, type JsonStatsProps } from "./ui/JsonStats";
export { JsonFormatter, formatJsonError, type JsonFormatterProps } from "./ui/JsonFormatter";
