import { isJsonWhitespace } from "./validate";

export type JsonTokenType = "key" | "string" | "number" | "literal" | "punctuation" | "whitespace";

export interface JsonToken {
  type: JsonTokenType;
  start: number;
  end: number;
}

const PUNCTUATION = "{}[],:";
const DELIMITERS = '{}[],:"';

/** Index just after the string that starts at `start` (a `"`). Stops at the end of text if unterminated. */
export function stringEnd(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === "\\") i += 2;
    else if (text[i] === '"') return i + 1;
    else i++;
  }
  return text.length;
}

/** Splits JSON text into tokens for highlighting. Tokens cover the text without gaps. Meant for valid JSON. */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i;
    const ch = text[i]!;
    if (isJsonWhitespace(ch)) {
      while (isJsonWhitespace(text[i])) i++;
      tokens.push({ type: "whitespace", start, end: i });
    } else if (ch === '"') {
      i = stringEnd(text, i);
      let next = i;
      while (isJsonWhitespace(text[next])) next++;
      tokens.push({ type: text[next] === ":" ? "key" : "string", start, end: i });
    } else if (PUNCTUATION.includes(ch)) {
      i++;
      tokens.push({ type: "punctuation", start, end: i });
    } else {
      while (i < text.length && !isJsonWhitespace(text[i]) && !DELIMITERS.includes(text[i]!)) i++;
      tokens.push({ type: ch === "-" || (ch >= "0" && ch <= "9") ? "number" : "literal", start, end: i });
    }
  }
  return tokens;
}
