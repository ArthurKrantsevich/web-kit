import { log2Big } from "./bits";
import { characterPool, type CharacterPool } from "./charset";
import { cryptoRandom, pick } from "./random";
import type { PasswordOptions, RandomSource, Result } from "./types";

/**
 * A password of random characters from the chosen sets. With `requireEach` (the default) a password that misses a set
 * is thrown away and a new one drawn, so every allowed password stays equally likely; a missing character is never
 * put in at a random place (that would favour some passwords).
 */
export function generatePassword(options: PasswordOptions, random: RandomSource = cryptoRandom): Result<string> {
  const pool = characterPool(options);
  if (!pool.ok) return pool;
  const { sets, pool: chars } = pool.value;
  const requireEach = options.requireEach ?? true;
  for (;;) {
    const password = Array.from({ length: options.length }, () => pick(chars, random));
    if (!requireEach || sets.every((set) => password.some((char) => set.includes(char)))) return { ok: true, value: password.join("") };
  }
}

/**
 * How many passwords of `length` characters from these sets contain at least one character of each (inclusion and
 * exclusion over the sets it misses): Σ (−1)^|S| (pool − |S's characters|)^length.
 */
export function countWithEach(sets: readonly (readonly string[])[], length: number): bigint {
  const pool = sets.reduce((sum, set) => sum + set.length, 0);
  let total = 0n;
  for (let mask = 0; mask < 1 << sets.length; mask++) {
    let missing = 0;
    let size = 0;
    sets.forEach((set, index) => {
      if (mask & (1 << index)) {
        missing++;
        size += set.length;
      }
    });
    const term = BigInt(pool - size) ** BigInt(length);
    total += missing % 2 === 0 ? term : -term;
  }
  return total;
}

/** Exact bits of a character password: log2 of the number of passwords the options allow, each equally likely. */
export function passwordEntropy(pool: CharacterPool, length: number, requireEach: boolean): number {
  return requireEach ? log2Big(countWithEach(pool.sets, length)) : length * Math.log2(pool.pool.length);
}

/** Entropy of character passwords, or 0 when the options allow none. */
export function passwordBits(options: PasswordOptions): number {
  const pool = characterPool(options);
  return pool.ok ? passwordEntropy(pool.value, options.length, options.requireEach ?? true) : 0;
}
