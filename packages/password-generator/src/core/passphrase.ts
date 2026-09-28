import { cryptoRandom, pick, randomInt } from "./random";
import type { PassphraseOptions, RandomSource, Result } from "./types";

/** The size of the EFF large wordlist that `@web-kit/password-generator/wordlist` exports. */
export const EFF_WORDLIST_SIZE = 7776;
export const MIN_WORDS = 3;
export const MAX_WORDS = 12;
export const MAX_SEPARATOR = 16;

export function checkSeparator(separator: string): Result<string> {
  if (separator.length > MAX_SEPARATOR) return { ok: false, error: { message: `The separator can be at most ${MAX_SEPARATOR} characters` } };
  return { ok: true, value: separator };
}

/** Upper-cases the first letter. */
export const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** Adds one random digit to the end of one random part: log2(parts × 10) more bits. */
export function withNumber(parts: string[], random: RandomSource): string[] {
  const at = randomInt(parts.length, random);
  return parts.map((part, index) => (index === at ? `${part}${randomInt(10, random)}` : part));
}

/**
 * Words picked at random, each equally likely, from `wordlist` (the EFF large wordlist, loaded separately from
 * `@web-kit/password-generator/wordlist`).
 */
export function generatePassphrase(options: PassphraseOptions, wordlist: readonly string[], random: RandomSource = cryptoRandom): Result<string> {
  const { words } = options;
  if (!Number.isInteger(words) || words < MIN_WORDS || words > MAX_WORDS) {
    return { ok: false, error: { message: `The number of words must be from ${MIN_WORDS} to ${MAX_WORDS}` } };
  }
  const separator = checkSeparator(options.separator ?? "-");
  if (!separator.ok) return separator;
  if (new Set(wordlist).size < 2) return { ok: false, error: { message: "The word list needs at least two different words" } };
  let parts = Array.from({ length: words }, () => pick(wordlist, random));
  if (options.capitalize) parts = parts.map(capital);
  if (options.includeNumber) parts = withNumber(parts, random);
  return { ok: true, value: parts.join(separator.value) };
}

/** Bits of a passphrase: words × log2(list size), plus log2(words × 10) for the digit. */
export function passphraseBits(options: PassphraseOptions, listSize: number = EFF_WORDLIST_SIZE): number {
  const { words } = options;
  if (!Number.isInteger(words) || words < MIN_WORDS || words > MAX_WORDS || listSize < 2) return 0;
  return words * Math.log2(listSize) + (options.includeNumber ? Math.log2(words * 10) : 0);
}
