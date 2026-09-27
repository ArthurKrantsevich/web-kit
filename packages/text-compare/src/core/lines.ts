import type { CompareOptions, LineEndings } from "./types";

/** A text cut into lines. `lines[i] + endings[i]` joined give the text back, without its BOM. */
export interface SplitText {
  lines: string[];
  /** "\n", "\r\n", "\r", or "" for a last line without a line break. */
  endings: string[];
  /** The text started with a byte order mark (U+FEFF), which is not part of the first line. */
  bom: boolean;
  /** True when the last line ends with a line break, or there are no lines. */
  finalNewline: boolean;
  lineEndings: LineEndings;
}

/**
 * Cuts a text into lines at "\r\n", "\n" and "\r", keeping each line's ending. A BOM at the start is removed. A line
 * break at the very end does not start another line: "a\n" is one line, "" is none.
 */
export function splitLines(text: string): SplitText {
  const bom = text.charCodeAt(0) === 0xfeff;
  const lines: string[] = [];
  const endings: string[] = [];
  let lf = 0;
  let crlf = 0;
  let cr = 0;
  let start = bom ? 1 : 0;
  for (let i = start; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10) {
      lines.push(text.slice(start, i));
      endings.push("\n");
      lf++;
      start = i + 1;
    } else if (code === 13) {
      lines.push(text.slice(start, i));
      if (text.charCodeAt(i + 1) === 10) {
        endings.push("\r\n");
        crlf++;
        i++;
      } else {
        endings.push("\r");
        cr++;
      }
      start = i + 1;
    }
  }
  if (start < text.length) {
    lines.push(text.slice(start));
    endings.push("");
  }
  const kinds = (lf > 0 ? 1 : 0) + (crlf > 0 ? 1 : 0) + (cr > 0 ? 1 : 0);
  const lineEndings: LineEndings = kinds === 0 ? "none" : kinds > 1 ? "mixed" : lf > 0 ? "lf" : crlf > 0 ? "crlf" : "cr";
  return { lines, endings, bom, finalNewline: endings.at(-1) !== "", lineEndings };
}

/** The line break most lines of `split` end with ("\n" on a tie); null when no line has one. */
export function dominantEnding(split: SplitText): string | null {
  const counts = new Map<string, number>();
  for (const ending of split.endings) if (ending !== "") counts.set(ending, (counts.get(ending) ?? 0) + 1);
  let best: string | null = null;
  for (const ending of ["\n", "\r\n", "\r"]) {
    const count = counts.get(ending) ?? 0;
    if (count > 0 && (best === null || count > counts.get(best)!)) best = ending;
  }
  return best;
}

const WHITESPACE = /\s+/gu;
const BLANK = /^\s*$/u;

export function isBlank(line: string): boolean {
  return BLANK.test(line);
}

/** What a line is compared by under `options`: its text without what they ignore. */
export function normalizeLine(line: string, ending: string, options: CompareOptions): string {
  let text = options.ignoreWhitespace ? line.replace(WHITESPACE, "") : line;
  if (options.ignoreCase) text = text.toLowerCase();
  // -w ignores every whitespace character, and a line break is one.
  const keepEnding = options.ignoreLineEndings === false && !options.ignoreWhitespace;
  return keepEnding ? `${text}\u0000${ending}` : text;
}

/**
 * One integer per line: lines of either side that are equal under `options` get the same number, so the diff compares
 * numbers instead of strings.
 */
export function lineKeys(left: SplitText, right: SplitText, options: CompareOptions): [Int32Array, Int32Array] {
  const ids = new Map<string, number>();
  const keys = (split: SplitText): Int32Array => {
    const out = new Int32Array(split.lines.length);
    for (let i = 0; i < out.length; i++) {
      const text = normalizeLine(split.lines[i]!, split.endings[i]!, options);
      let id = ids.get(text);
      if (id === undefined) {
        id = ids.size;
        ids.set(text, id);
      }
      out[i] = id;
    }
    return out;
  };
  return [keys(left), keys(right)];
}
