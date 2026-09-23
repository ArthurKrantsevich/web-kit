import type { JsonError, Result } from "./types";
import { lineColumn, parseJson, stripBom, validateJson } from "./validate";

/** Turns any text into a JSON string literal. */
export function escapeJson(text: string): string {
  return JSON.stringify(text);
}

export interface Unescaped {
  /** The decoded string. */
  text: string;
  /** True when the decoded string is itself valid JSON. */
  isJson: boolean;
  /** True when the input had no surrounding quotes and was read as the inside of a JSON string. */
  wrapped: boolean;
}

/**
 * Decodes a JSON string literal. Input without surrounding quotes (`{\"a\":1}`) is accepted
 * only when it decodes to text that is itself valid JSON; otherwise the original parse error is returned.
 */
export function unescapeJson(input: string): Result<Unescaped> {
  const parsed = parseJson(input);
  if (parsed.ok) {
    if (parsed.value.type !== "string") return { ok: false, error: notAString(input, parsed.value.start) };
    const text = parsed.value.value;
    return { ok: true, value: { text, isJson: validateJson(text) === null, wrapped: false } };
  }
  // Only JSON whitespace is trimmed: other invisible characters are content, not padding.
  const inner = stripBom(input).replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");
  const wrapped = parseJson(`"${inner}"`);
  if (wrapped.ok && wrapped.value.type === "string" && validateJson(wrapped.value.value) === null) {
    return { ok: true, value: { text: wrapped.value.value, isJson: true, wrapped: true } };
  }
  // The user did not start a string, so the useful message is what Unescape expects, not a JSON syntax detail.
  if (!inner.startsWith('"')) {
    const offset = stripBom(input).length - stripBom(input).trimStart().length;
    return { ok: false, error: notAString(input, offset) };
  }
  return { ok: false, error: parsed.error };
}

function notAString(input: string, offset: number): JsonError {
  return { message: "Unescape needs a JSON string literal", offset, ...lineColumn(stripBom(input), offset) };
}
