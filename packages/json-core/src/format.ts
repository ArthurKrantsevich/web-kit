import type { Indent, Result } from "./types";
import { stringEnd } from "./tokens";
import { isJsonWhitespace, stripBom, validateJson } from "./validate";

export interface FormatOptions {
  indent?: Indent;
}

/** Pretty-prints JSON. Numbers, strings, key order and duplicate keys stay exactly as written. */
export function formatJson(input: string, options: FormatOptions = {}): Result<string> {
  const indent = options.indent ?? 2;
  return run(input, indent === "\t" ? "\t" : " ".repeat(indent));
}

/** Removes all insignificant whitespace. */
export function minifyJson(input: string): Result<string> {
  return run(input, "");
}

function run(input: string, unit: string): Result<string> {
  const error = validateJson(input);
  if (error) return { ok: false, error };
  return { ok: true, value: reformat(stripBom(input), unit) };
}

/** Re-indents valid JSON token by token, without parsing values. `unit === ""` minifies. */
function reformat(text: string, unit: string): string {
  const newline = unit === "" ? "" : "\n";
  const colon = unit === "" ? ":" : ": ";
  let out = "";
  let depth = 0;
  let i = 0;

  const nextNonWs = (from: number): number => {
    let j = from;
    while (isJsonWhitespace(text[j])) j++;
    return j;
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"') {
      const end = stringEnd(text, i);
      out += text.slice(i, end);
      i = end;
    } else if (isJsonWhitespace(ch)) {
      i++;
    } else if (ch === "{" || ch === "[") {
      const close = ch === "{" ? "}" : "]";
      const next = nextNonWs(i + 1);
      if (text[next] === close) {
        out += ch + close;
        i = next + 1;
      } else {
        depth++;
        out += ch + newline + unit.repeat(depth);
        i++;
      }
    } else if (ch === "}" || ch === "]") {
      depth--;
      out += newline + unit.repeat(depth) + ch;
      i++;
    } else if (ch === ",") {
      out += "," + newline + unit.repeat(depth);
      i++;
    } else if (ch === ":") {
      out += colon;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}
