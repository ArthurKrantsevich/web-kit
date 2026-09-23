import type { JsonError } from "./types";

const MAX_DEPTH = 512;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const HEX4 = /[0-9a-fA-F]{4}/y;
const ESCAPES = '"\\/bfnrt';
const LITERALS = ["true", "false", "null"] as const;

class SyntaxFailure {
  constructor(
    readonly message: string,
    readonly offset: number,
  ) {}
}

export function isJsonWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** Returns null for valid JSON, otherwise the first syntax error. Never throws on bad input. */
export function validateJson(input: string): JsonError | null {
  const text = stripBom(input);
  try {
    scan(text);
    return null;
  } catch (e) {
    if (!(e instanceof SyntaxFailure)) throw e;
    return { message: e.message, offset: e.offset, ...lineColumn(text, e.offset) };
  }
}

function scan(text: string): void {
  let i = 0;

  const fail = (message: string, at: number = i): never => {
    throw new SyntaxFailure(message, at);
  };
  const atEnd = (): boolean => i >= text.length;
  const skipWs = (): void => {
    while (isJsonWhitespace(text[i])) i++;
  };
  const expected = (message: string): never => fail(atEnd() ? "Unexpected end of input" : message);

  function value(depth: number): void {
    if (depth > MAX_DEPTH) fail("Nesting too deep");
    skipWs();
    const ch = text[i];
    if (ch === "{") return object(depth);
    if (ch === "[") return array(depth);
    if (ch === '"') return string();
    if (ch === "-" || (ch !== undefined && ch >= "0" && ch <= "9")) return number();
    for (const word of LITERALS) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return;
      }
    }
    fail(atEnd() ? "Unexpected end of input" : `Unexpected character '${ch}'`);
  }

  function object(depth: number): void {
    i++;
    skipWs();
    if (text[i] === "}") {
      i++;
      return;
    }
    for (;;) {
      skipWs();
      if (text[i] !== '"') expected("Expected a double-quoted property name");
      string();
      skipWs();
      if (text[i] !== ":") expected("Expected ':' after property name");
      i++;
      value(depth + 1);
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        return;
      }
      expected("Expected ',' or '}' after property value");
    }
  }

  function array(depth: number): void {
    i++;
    skipWs();
    if (text[i] === "]") {
      i++;
      return;
    }
    for (;;) {
      value(depth + 1);
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        return;
      }
      expected("Expected ',' or ']' after array element");
    }
  }

  function string(): void {
    i++;
    while (i < text.length) {
      const ch = text[i]!;
      if (ch === '"') {
        i++;
        return;
      }
      if (ch === "\\") {
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
    fail("Unterminated string");
  }

  function number(): void {
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(text);
    if (!match) fail("Invalid number");
    i += match![0].length;
  }

  value(0);
  skipWs();
  if (!atEnd()) fail("Unexpected character after JSON value");
}
