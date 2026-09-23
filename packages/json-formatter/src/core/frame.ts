import type { JsonError } from "./types";
import { stripBom } from "./validate";

const MAX_WIDTH = 80;
const HALF = 40;

/** Lines around an error with a caret under the error column, like a compiler message. */
export function codeFrame(input: string, error: JsonError, context: number = 2): string {
  const lines = stripBom(input)
    .split("\n")
    .map((line) => line.replace(/\r$/, ""));
  const first = Math.max(1, error.line - context);
  const last = Math.min(lines.length, error.line + context);
  const width = String(last).length;
  const out: string[] = [];
  for (let n = first; n <= last; n++) {
    const isErrorLine = n === error.line;
    const { text, column } = clip(lines[n - 1] ?? "", isErrorLine ? error.column : 1);
    out.push(`${isErrorLine ? ">" : " "} ${String(n).padStart(width)} | ${text}`);
    if (isErrorLine) {
      const before = text.slice(0, column - 1).replace(/[^\t]/g, " ");
      out.push(`  ${" ".repeat(width)} | ${before}^`);
    }
  }
  return out.join("\n");
}

function clip(line: string, column: number): { text: string; column: number } {
  if (line.length <= MAX_WIDTH) return { text: line, column };
  const start = Math.max(0, Math.min(column - 1 - HALF, line.length - MAX_WIDTH));
  const end = start + MAX_WIDTH;
  const head = start > 0 ? "…" : "";
  const tail = end < line.length ? "…" : "";
  return { text: head + line.slice(start, end) + tail, column: column - start + head.length };
}
