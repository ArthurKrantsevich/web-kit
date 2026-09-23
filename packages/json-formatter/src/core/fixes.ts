import type { JsonError } from "./types";
import { isJsonWhitespace, stripBom, validateJson } from "./validate";

export type FixRule =
  | "comment"
  | "trailing-comma"
  | "missing-comma"
  | "single-quotes"
  | "unquoted-key"
  | "python-literal"
  | "smart-quotes"
  | "control-character"
  | "missing-closers";

export interface JsonFix {
  rule: FixRule;
  description: string;
  /** The whole input with this one fix applied. */
  text: string;
}

export type RepairResult = { ok: true; value: string; changes: string[] } | { ok: false; error: JsonError };

interface Edit {
  rule: FixRule;
  description: string;
  start: number;
  end: number;
  insert: string;
}

type Rule = (text: string, error: JsonError) => Edit | null;

const REPAIR_MAX_STEPS = 200;
const VALUE_START = /["\-0-9{[tfn]/;
const IDENT_START = /[A-Za-z_$]/;
const IDENT = /[A-Za-z0-9_$]*/y;
const PY_LITERAL = /(True|False|None)(?![A-Za-z0-9_$])/y;
const PY_MAP: Record<string, string> = { True: "true", False: "false", None: "null" };
const SMART_QUOTES = "“”„‟";
const CONTROL_ESCAPES: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };

function prevNonWs(text: string, from: number): number {
  let j = from - 1;
  while (j >= 0 && isJsonWhitespace(text[j])) j--;
  return j;
}

const removeComment: Rule = (text, { offset }) => {
  if (text[offset] !== "/") return null;
  if (text[offset + 1] === "/") {
    const newline = text.indexOf("\n", offset);
    const end = newline === -1 ? text.length : newline;
    return { rule: "comment", description: "Remove comment", start: offset, end, insert: "" };
  }
  if (text[offset + 1] === "*") {
    const close = text.indexOf("*/", offset + 2);
    if (close === -1) return null;
    return { rule: "comment", description: "Remove comment", start: offset, end: close + 2, insert: "" };
  }
  return null;
};

const trailingComma: Rule = (text, { offset }) => {
  const ch = text[offset];
  if (ch !== "}" && ch !== "]") return null;
  const p = prevNonWs(text, offset);
  if (text[p] !== ",") return null;
  return { rule: "trailing-comma", description: "Remove trailing comma", start: p, end: p + 1, insert: "" };
};

const missingComma: Rule = (text, { offset, message }) => {
  if (!message.startsWith("Expected ',' or")) return null;
  const ch = text[offset];
  if (ch === undefined || !VALUE_START.test(ch)) return null;
  const at = prevNonWs(text, offset) + 1;
  return { rule: "missing-comma", description: "Insert missing comma", start: at, end: at, insert: "," };
};

const singleQuotes: Rule = (text, { offset }) => {
  if (text[offset] !== "'") return null;
  let content = "";
  let i = offset + 1;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\") {
      const next = text[i + 1] ?? "";
      content += next === "'" ? "'" : ch + next;
      i += 2;
      continue;
    }
    if (ch === "'") {
      return {
        rule: "single-quotes",
        description: "Replace single quotes with double quotes",
        start: offset,
        end: i + 1,
        insert: `"${content}"`,
      };
    }
    content += ch === '"' ? '\\"' : ch;
    i++;
  }
  return null;
};

const unquotedKey: Rule = (text, { offset, message }) => {
  if (message !== "Expected a double-quoted property name") return null;
  const ch = text[offset];
  if (ch === undefined || !IDENT_START.test(ch)) return null;
  IDENT.lastIndex = offset;
  const name = IDENT.exec(text)![0];
  return {
    rule: "unquoted-key",
    description: `Add quotes around key ${name}`,
    start: offset,
    end: offset + name.length,
    insert: `"${name}"`,
  };
};

const pythonLiteral: Rule = (text, { offset }) => {
  PY_LITERAL.lastIndex = offset;
  const match = PY_LITERAL.exec(text);
  if (!match) return null;
  const word = match[1]!;
  const replacement = PY_MAP[word]!;
  return {
    rule: "python-literal",
    description: `Replace ${word} with ${replacement}`,
    start: offset,
    end: offset + word.length,
    insert: replacement,
  };
};

const smartQuotes: Rule = (text, { offset }) => {
  const ch = text[offset];
  if (ch === undefined || !SMART_QUOTES.includes(ch)) return null;
  for (let j = offset + 1; j < text.length && text[j] !== "\n"; j++) {
    if (SMART_QUOTES.includes(text[j]!)) {
      return {
        rule: "smart-quotes",
        description: "Replace curly quotes with straight quotes",
        start: offset,
        end: j + 1,
        insert: `"${text.slice(offset + 1, j).replace(/"/g, '\\"')}"`,
      };
    }
  }
  return null;
};

const controlCharacter: Rule = (text, { offset, message }) => {
  if (message !== "Control character in string") return null;
  const ch = text[offset]!;
  const insert = CONTROL_ESCAPES[ch] ?? `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
  const description = ch === "\n" ? "Escape line break in string" : "Escape control character in string";
  return { rule: "control-character", description, start: offset, end: offset + 1, insert };
};

const missingClosers: Rule = (text, { message }) => {
  if (message !== "Unexpected end of input" && message !== "Unterminated string") return null;
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  const quote = inString ? '"' : "";
  const closers = stack.reverse().join("");
  if (quote === "" && closers === "") return null;
  let start = text.length;
  if (!inString) {
    const p = prevNonWs(text, text.length);
    if (text[p] === ",") start = p;
  }
  const what = closers.length === 0 ? "" : closers.length === 1 ? "bracket" : `${closers.length} brackets`;
  const description =
    closers === "" ? "Close the string" : `Close ${quote ? "the string and " : ""}${what}: ${closers}`;
  return { rule: "missing-closers", description, start, end: text.length, insert: quote + closers };
};

const RULES: Rule[] = [
  removeComment,
  trailingComma,
  missingComma,
  singleQuotes,
  unquotedKey,
  pythonLiteral,
  smartQuotes,
  controlCharacter,
  missingClosers,
];

/** A fix helps only if the result is valid, or the parser now gets past the edited spot. */
function helps(fixed: string, editEnd: number): boolean {
  const next = validateJson(fixed);
  return next === null || next.offset > editEnd;
}

/** Verified one-step fixes for the first error. Each one is re-checked by the validator; nothing is guessed. */
export function suggestFixes(input: string): JsonFix[] {
  const text = stripBom(input);
  const error = validateJson(text);
  if (!error) return [];
  const fixes: JsonFix[] = [];
  for (const rule of RULES) {
    const edit = rule(text, error);
    if (!edit) continue;
    const fixed = text.slice(0, edit.start) + edit.insert + text.slice(edit.end);
    if (!helps(fixed, edit.start + edit.insert.length)) continue;
    if (fixes.some((fix) => fix.text === fixed)) continue;
    fixes.push({ rule: edit.rule, description: edit.description, text: fixed });
  }
  return fixes;
}

/** Applies the first verified fix until the JSON is valid. `ok` only when the final text is valid JSON. */
export function repairJson(input: string): RepairResult {
  let text = stripBom(input);
  const first = validateJson(text);
  if (!first) return { ok: true, value: text, changes: [] };
  const changes: string[] = [];
  for (let step = 0; step < REPAIR_MAX_STEPS; step++) {
    const [fix] = suggestFixes(text);
    if (!fix) break;
    text = fix.text;
    changes.push(fix.description);
    if (validateJson(text) === null) return { ok: true, value: text, changes };
  }
  return { ok: false, error: first };
}
