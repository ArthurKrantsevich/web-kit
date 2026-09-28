import { capital, checkSeparator, withNumber } from "./passphrase";
import { cryptoRandom, pick } from "./random";
import type { MemorableOptions, RandomSource, Result } from "./types";

const ONSETS = "bdfghklmnprstvz";
const VOWELS = "aeiou";
const CODAS = ["", "n", "r"];

/**
 * 225 syllables: a consonant, a vowel and sometimes n or r ("ba", "ken", "tor"). Every syllable starts with one
 * consonant and has one vowel, so a group reads back into its syllables one way only, and each syllable adds exactly
 * log2(225) ≈ 7.81 bits.
 */
export const SYLLABLES: readonly string[] = [...ONSETS].flatMap((onset) =>
  [...VOWELS].flatMap((vowel) => CODAS.map((coda) => `${onset}${vowel}${coda}`)),
);

export const MIN_GROUPS = 2;
export const MAX_GROUPS = 8;
export const MIN_SYLLABLES = 2;
export const MAX_SYLLABLES = 4;

function checkShape(options: MemorableOptions): string | null {
  const { groups, syllables } = options;
  if (!Number.isInteger(groups) || groups < MIN_GROUPS || groups > MAX_GROUPS) return `The number of groups must be from ${MIN_GROUPS} to ${MAX_GROUPS}`;
  if (!Number.isInteger(syllables) || syllables < MIN_SYLLABLES || syllables > MAX_SYLLABLES) {
    return `A group has ${MIN_SYLLABLES} to ${MAX_SYLLABLES} syllables`;
  }
  return null;
}

/** A password you can say: groups of random syllables, such as "Bolanu-Tekiro-Vasemi". */
export function generateMemorable(options: MemorableOptions, random: RandomSource = cryptoRandom): Result<string> {
  const problem = checkShape(options);
  if (problem !== null) return { ok: false, error: { message: problem } };
  const separator = checkSeparator(options.separator ?? "-");
  if (!separator.ok) return separator;
  let groups = Array.from({ length: options.groups }, () => Array.from({ length: options.syllables }, () => pick(SYLLABLES, random)).join(""));
  if (options.capitalize) groups = groups.map(capital);
  if (options.includeNumber) groups = withNumber(groups, random);
  return { ok: true, value: groups.join(separator.value) };
}

/** Bits: log2(225) per syllable, plus log2(groups × 10) for the digit. */
export function memorableBits(options: MemorableOptions): number {
  if (checkShape(options) !== null) return 0;
  return options.groups * options.syllables * Math.log2(SYLLABLES.length) + (options.includeNumber ? Math.log2(options.groups * 10) : 0);
}
