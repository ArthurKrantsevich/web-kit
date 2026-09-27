import { stringEnd, tokenizeJson } from "@web-kit/json-core";
import type { CsvDelimiter } from "../core/csv";
import type { ConvertTarget } from "./convert";

/** The token classes of `wk-syntax-*`; null is plain text. */
export type TokenType = "key" | "string" | "number" | "literal" | "punctuation";

export interface Token {
  type: TokenType | null;
  text: string;
}

/** Above this many characters the output is shown without highlighting. */
export const HIGHLIGHT_LIMIT = 200_000;

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const LITERAL = /^(?:true|false|null)$/;

/** The class of a value written without quotes: a JSON number, true/false/null, or the fallback. */
function scalarType(text: string, fallback: TokenType | null): TokenType | null {
  if (NUMBER.test(text)) return "number";
  if (LITERAL.test(text)) return "literal";
  return fallback;
}

/**
 * Where the key that starts at `i` ends (the index of its ":"), or -1 when the line holds a value, not a key. A quoted
 * key ends at its closing quote; a plain one at ": " or at a final ":", which toYaml never writes into plain values.
 */
function yamlKeyEnd(line: string, i: number): number {
  if (line[i] === '"') {
    const end = stringEnd(line, i);
    return line[end] === ":" && (end + 1 === line.length || line[end + 1] === " ") ? end : -1;
  }
  const colon = line.indexOf(": ", i);
  if (colon !== -1) return colon;
  return line.endsWith(":") && line.length - 1 > i ? line.length - 1 : -1;
}

/**
 * YAML as written by toYaml: one entry per line, `- ` for items, `key: value`, `? key` and `:` for long keys, plain
 * or double-quoted scalars, `{}` and `[]` for empty collections.
 */
export function tokenizeYaml(text: string): Token[] {
  const tokens: Token[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) tokens.push({ type: null, text: "\n" });
    let i = 0;
    while (line[i] === " ") i++;
    if (i > 0) tokens.push({ type: null, text: line.slice(0, i) });
    for (;;) {
      if (line.startsWith("- ", i) || line.startsWith("? ", i)) {
        tokens.push({ type: "punctuation", text: line[i]! }, { type: null, text: " " });
        if (line[i] === "?") {
          tokens.push({ type: "key", text: line.slice(i + 2) });
          return;
        }
        i += 2;
      } else if (line.slice(i) === "-") {
        tokens.push({ type: "punctuation", text: "-" });
        return;
      } else break;
    }
    if (line.slice(i) === ":" || line.startsWith(": ", i)) {
      tokens.push({ type: "punctuation", text: ":" });
      i++;
    } else if (i < line.length) {
      const keyEnd = yamlKeyEnd(line, i);
      if (keyEnd !== -1) {
        tokens.push({ type: "key", text: line.slice(i, keyEnd) }, { type: "punctuation", text: ":" });
        i = keyEnd + 1;
      }
    }
    if (i >= line.length) return;
    if (line[i] === " ") {
      tokens.push({ type: null, text: " " });
      i++;
    }
    const value = line.slice(i);
    if (value === "") return;
    const type = value.startsWith('"') ? "string" : value === "{}" || value === "[]" ? "punctuation" : scalarType(value, "string");
    tokens.push({ type, text: value });
  });
  return tokens;
}

/** CSV (RFC 4180): header cells as keys, delimiters as punctuation, quoted cells as strings, number-like cells as numbers. */
export function tokenizeCsv(text: string, delimiter: CsvDelimiter): Token[] {
  const tokens: Token[] = [];
  let header = true;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\r" || ch === "\n") {
      const start = i;
      while (text[i] === "\r" || text[i] === "\n") i++;
      tokens.push({ type: null, text: text.slice(start, i) });
      header = false;
    } else if (ch === delimiter) {
      tokens.push({ type: "punctuation", text: ch });
      i++;
    } else if (ch === '"') {
      const start = i++;
      while (i < text.length && !(text[i] === '"' && text[i + 1] !== '"')) i += text[i] === '"' ? 2 : 1;
      i = Math.min(i + 1, text.length);
      tokens.push({ type: header ? "key" : "string", text: text.slice(start, i) });
    } else {
      const start = i;
      while (i < text.length && text[i] !== delimiter && text[i] !== "\r" && text[i] !== "\n") i++;
      const cell = text.slice(start, i);
      tokens.push({ type: header ? "key" : scalarType(cell, null), text: cell });
    }
  }
  return tokens;
}

/** XML as written by toXml: the declaration, tags (names as keys), text, and entity references. */
export function tokenizeXml(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("<?", i)) {
      const end = text.indexOf("?>", i);
      const stop = end === -1 ? text.length : end + 2;
      tokens.push({ type: "punctuation", text: text.slice(i, stop) });
      i = stop;
    } else if (text[i] === "<") {
      const open = text.startsWith("</", i) ? "</" : "<";
      tokens.push({ type: "punctuation", text: open });
      i += open.length;
      const start = i;
      while (i < text.length && !/[\s/>]/.test(text[i]!)) i++;
      tokens.push({ type: "key", text: text.slice(start, i) });
      const end = text.indexOf(">", i);
      const stop = end === -1 ? text.length : end + 1;
      if (stop > i) tokens.push({ type: "punctuation", text: text.slice(i, stop) });
      i = stop;
    } else {
      const end = text.indexOf("<", i);
      const stop = end === -1 ? text.length : end;
      const content = text.slice(i, stop);
      if (/^\s*$/.test(content)) tokens.push({ type: null, text: content });
      else if (!content.includes("&")) tokens.push({ type: scalarType(content, "string"), text: content });
      else {
        for (const part of content.split(/(&[^;\s]*;)/)) {
          if (part !== "") tokens.push({ type: part.startsWith("&") && part.endsWith(";") ? "literal" : "string", text: part });
        }
      }
      i = stop;
    }
  }
  return tokens;
}

const TS_KEYWORDS = new Set(["export", "interface", "type"]);

/** TypeScript as written by toTypeScript: keywords, type names, property names (plain or quoted) and punctuation. */
export function tokenizeTypeScript(text: string): Token[] {
  const raw: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const start = i;
    if (/\s/.test(ch)) {
      while (i < text.length && /\s/.test(text[i]!)) i++;
      raw.push({ type: null, text: text.slice(start, i) });
    } else if (ch === '"') {
      i = stringEnd(text, i);
      raw.push({ type: "string", text: text.slice(start, i) });
    } else if (/[A-Za-z_$]/.test(ch)) {
      while (i < text.length && /[\w$]/.test(text[i]!)) i++;
      const word = text.slice(start, i);
      raw.push({ type: TS_KEYWORDS.has(word) ? "literal" : "number", text: word });
    } else {
      i++;
      raw.push({ type: "punctuation", text: ch });
    }
  }
  // A name followed by ":" or "?:" is a property.
  return raw.map((token, index) => {
    if (token.type !== "number" && token.type !== "string") return token;
    const next = raw[index + 1];
    const after = next?.text === "?" ? raw[index + 2] : next;
    return after?.text === ":" ? { type: "key", text: token.text } : token;
  });
}

function tokenizeJsonText(text: string): Token[] {
  return tokenizeJson(text).map((token) => ({
    type: token.type === "whitespace" ? null : token.type,
    text: text.slice(token.start, token.end),
  }));
}

/** The tokens of an output of `target`. They cover the text exactly, so joining them gives the text back. */
export function tokenizeOutput(text: string, target: ConvertTarget, delimiter: CsvDelimiter): Token[] {
  switch (target) {
    case "yaml":
      return tokenizeYaml(text);
    case "csv":
      return tokenizeCsv(text, delimiter);
    case "xml":
      return tokenizeXml(text);
    case "typescript":
      return tokenizeTypeScript(text);
    case "csv-to-json":
      return tokenizeJsonText(text);
  }
}

/** Splits tokens into lines at "\n" (a "\r" stays at the end of its line), for rendering. */
export function toLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokens) {
    token.text.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part !== "") lines.at(-1)!.push({ type: token.type, text: part });
    });
  }
  return lines;
}
