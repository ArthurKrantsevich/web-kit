import type { RandomSource, Result } from "./types";

/** NanoID's default alphabet: 64 URL-safe characters. */
export const URL_ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

/** The alphabets the UI offers besides your own. */
export const ALPHABETS: Readonly<Record<"url-safe" | "alphanumeric" | "numbers" | "lowercase", string>> = {
  "url-safe": URL_ALPHABET,
  alphanumeric: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
};

export interface NanoidOptions {
  /** 2 to 255 characters. Default 21. */
  size?: number;
  /** 2 to 256 different characters. Default the URL-safe alphabet. */
  alphabet?: string;
}

/** The characters of an alphabet, or why it cannot be used. */
export function checkAlphabet(alphabet: string): Result<string[]> {
  const chars = Array.from(alphabet);
  const repeated = chars.find((char, index) => chars.indexOf(char) !== index);
  if (repeated !== undefined) return { ok: false, error: { message: `The alphabet has "${repeated}" more than once` } };
  if (chars.length < 2 || chars.length > 256) {
    return { ok: false, error: { message: `The alphabet needs 2 to 256 different characters; it has ${chars.length}` } };
  }
  return { ok: true, value: chars };
}

export function checkSize(size: number): Result<number> {
  if (!Number.isInteger(size) || size < 2 || size > 255) return { ok: false, error: { message: "The size must be a whole number from 2 to 255" } };
  return { ok: true, value: size };
}

/**
 * A NanoID without bias: each random byte is masked to the smallest power of two that covers the alphabet, and values
 * past its end are thrown away (not wrapped around, which would favour the first characters).
 */
export function makeNanoid(random: RandomSource, options: NanoidOptions = {}): Result<string> {
  const size = checkSize(options.size ?? 21);
  if (!size.ok) return size;
  const alphabet = checkAlphabet(options.alphabet ?? URL_ALPHABET);
  if (!alphabet.ok) return alphabet;
  const chars = alphabet.value;
  const mask = (2 << (31 - Math.clz32((chars.length - 1) | 1))) - 1;
  const step = Math.ceil((1.6 * mask * size.value) / chars.length);
  let id = "";
  let count = 0;
  const bytes = new Uint8Array(step);
  for (;;) {
    random(bytes);
    for (const byte of bytes) {
      const char = chars[byte & mask];
      if (char === undefined) continue;
      id += char;
      if (++count === size.value) return { ok: true, value: id };
    }
  }
}
