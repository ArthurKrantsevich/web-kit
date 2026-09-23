import type { JsonError, JsonMember, JsonNode, JsonStringNode, Result } from "./types";

const MAX_DEPTH = 512;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const HEX4 = /[0-9a-fA-F]{4}/y;
const ESCAPES = '"\\/bfnrt';
const LITERALS = [
  ["true", true],
  ["false", false],
  ["null", null],
] as const;

class SyntaxFailure {
  constructor(
    readonly message: string,
    readonly offset: number,
  ) {}
}

export type ParseResult = Result<JsonNode>;

export function isJsonWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 1-based line and column of a UTF-16 offset; the column counts Unicode code points. */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  let column = 1;
  for (let i = lineStart; i < offset && i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < offset) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    column++;
  }
  return { line, column };
}

/** Parses JSON into a lossless AST. Never throws on bad input. */
export function parseJson(input: string): ParseResult {
  const text = stripBom(input);
  try {
    return { ok: true, value: scan(text, true)! };
  } catch (e) {
    return { ok: false, error: toError(text, e) };
  }
}

/** Returns null for valid JSON, otherwise the first syntax error. Never throws on bad input. */
export function validateJson(input: string): JsonError | null {
  const text = stripBom(input);
  try {
    scan(text, false);
    return null;
  } catch (e) {
    return toError(text, e);
  }
}

function toError(text: string, e: unknown): JsonError {
  if (!(e instanceof SyntaxFailure)) throw e;
  return { message: e.message, offset: e.offset, ...lineColumn(text, e.offset) };
}

/** One scanner for validation and parsing; with `build === false` it allocates no nodes. */
function scan(text: string, build: boolean): JsonNode | null {
  let i = 0;

  const fail = (message: string, at: number = i): never => {
    throw new SyntaxFailure(message, at);
  };
  const atEnd = (): boolean => i >= text.length;
  const skipWs = (): void => {
    while (isJsonWhitespace(text[i])) i++;
  };
  const expected = (message: string): never => fail(atEnd() ? "Unexpected end of input" : message);

  function value(depth: number): JsonNode | null {
    if (depth > MAX_DEPTH) fail("Nesting too deep");
    skipWs();
    const ch = text[i];
    if (ch === "{") return object(depth);
    if (ch === "[") return array(depth);
    if (ch === '"') return string();
    if (ch === "-" || (ch !== undefined && ch >= "0" && ch <= "9")) return number();
    for (const [word, literal] of LITERALS) {
      if (text.startsWith(word, i)) {
        const start = i;
        i += word.length;
        if (!build) return null;
        return literal === null ? { type: "null", start, end: i } : { type: "boolean", start, end: i, value: literal };
      }
    }
    return fail(atEnd() ? "Unexpected end of input" : `Unexpected character '${String.fromCodePoint(text.codePointAt(i)!)}'`);
  }

  function object(depth: number): JsonNode | null {
    const start = i;
    const members: JsonMember[] = [];
    i++;
    skipWs();
    if (text[i] === "}") {
      i++;
      return build ? { type: "object", start, end: i, members } : null;
    }
    for (;;) {
      skipWs();
      if (text[i] !== '"') expected("Expected a double-quoted property name");
      const key = string();
      skipWs();
      if (text[i] !== ":") expected("Expected ':' after property name");
      i++;
      const item = value(depth + 1);
      if (build) members.push({ key: key!, value: item! });
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        return build ? { type: "object", start, end: i, members } : null;
      }
      expected("Expected ',' or '}' after property value");
    }
  }

  function array(depth: number): JsonNode | null {
    const start = i;
    const items: JsonNode[] = [];
    i++;
    skipWs();
    if (text[i] === "]") {
      i++;
      return build ? { type: "array", start, end: i, items } : null;
    }
    for (;;) {
      const item = value(depth + 1);
      if (build) items.push(item!);
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        return build ? { type: "array", start, end: i, items } : null;
      }
      expected("Expected ',' or ']' after array element");
    }
  }

  function string(): JsonStringNode | null {
    const start = i;
    let escaped = false;
    i++;
    while (i < text.length) {
      const ch = text[i]!;
      if (ch === '"') {
        i++;
        if (!build) return null;
        const raw = text.slice(start, i);
        // Safe: `raw` has just been checked against the JSON string grammar. Without escapes it is its own value.
        const value = escaped ? (JSON.parse(raw) as string) : raw.slice(1, -1);
        return { type: "string", start, end: i, raw, value };
      }
      if (ch === "\\") {
        escaped = true;
        const esc = text[i + 1];
        if (esc === "u") {
          HEX4.lastIndex = i + 2;
          if (!HEX4.test(text)) fail("Invalid unicode escape");
          i += 6;
          continue;
        }
        if (esc === undefined || !ESCAPES.includes(esc)) fail("Invalid escape sequence");
        i += 2;
        continue;
      }
      if (ch < " ") fail("Control character in string");
      i++;
    }
    return fail("Unterminated string");
  }

  function number(): JsonNode | null {
    const start = i;
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(text);
    if (!match) fail("Invalid number");
    i += match![0].length;
    return build ? { type: "number", start, end: i, raw: match![0] } : null;
  }

  const root = value(0);
  skipWs();
  if (!atEnd()) fail("Unexpected character after JSON value");
  return root;
}
