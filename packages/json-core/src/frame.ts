import type { JsonError } from "./types";
import { stripBom } from "./validate";

const MAX_WIDTH = 80;
const HALF = 40;

const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** Lines around an error with a caret under the error position, like a compiler message. */
export function codeFrame(input: string, error: JsonError, context: number = 2): string {
  const lines = stripBom(input).split("\n");
  const first = Math.max(1, error.line - context);
  const last = Math.min(lines.length, error.line + context);
  const width = String(last).length;
  let errorLineStart = 0;
  for (let n = 1; n < error.line; n++) errorLineStart += lines[n - 1]!.length + 1;

  const out: string[] = [];
  for (let n = first; n <= last; n++) {
    const line = (lines[n - 1] ?? "").replace(/\r$/, "");
    const isErrorLine = n === error.line;
    const { text, index } = clip(line, isErrorLine ? error.offset - errorLineStart : 0);
    out.push(`${isErrorLine ? ">" : " "} ${String(n).padStart(width)} | ${text}`);
    if (isErrorLine) {
      // One space per character (tabs kept), so the caret lines up in a monospace font.
      const before = Array.from(text.slice(0, index), (ch) => (ch === "\t" ? "\t" : " ")).join("");
      out.push(`  ${" ".repeat(width)} | ${before}^`);
    }
  }
  return out.join("\n");
}

/** Cuts a long line to an 80-unit window around `index` (UTF-16) without splitting a surrogate pair. */
function clip(line: string, index: number): { text: string; index: number } {
  if (line.length <= MAX_WIDTH) return { text: line, index };
  let start = Math.max(0, Math.min(index - HALF, line.length - MAX_WIDTH));
  if (start > 0 && isLowSurrogate(line.charCodeAt(start))) start--;
  let end = Math.min(line.length, start + MAX_WIDTH);
  if (end < line.length && isLowSurrogate(line.charCodeAt(end))) end++;
  const head = start > 0 ? "…" : "";
  const tail = end < line.length ? "…" : "";
  return { text: head + line.slice(start, end) + tail, index: index - start + head.length };
}
