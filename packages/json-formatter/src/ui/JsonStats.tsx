import type { JsonStats as JsonStatsData } from "@web-kit/json-core";
import type { ReactElement } from "react";

export interface JsonStatsProps {
  stats: JsonStatsData;
  className?: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const count = (n: number, word: string): string => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

export function formatStats(stats: JsonStatsData): string {
  const c = stats.counts;
  return [
    formatBytes(stats.bytes),
    count(stats.keys, "key"),
    `depth ${stats.depth}`,
    count(c.object, "object"),
    count(c.array, "array"),
    count(c.string, "string"),
    count(c.number, "number"),
    count(c.boolean, "boolean"),
    count(c.null, "null value"),
    `longest array ${stats.longestArray.toLocaleString("en-US")}`,
  ].join(" · ");
}

/** One line of facts about the data: size, keys, depth, node types. */
export function JsonStats(props: JsonStatsProps): ReactElement {
  return <p className={["wk-stats", props.className].filter(Boolean).join(" ")}>{formatStats(props.stats)}</p>;
}
