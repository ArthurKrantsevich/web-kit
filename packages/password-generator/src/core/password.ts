import { log2Big } from "./bits";
import { characterPool, type CharacterPool } from "./charset";
import { cryptoRandom, pick, randomBelow } from "./random";
import type { PasswordOptions, RandomSource, Result } from "./types";

let lastWays: { key: string; ways: bigint[][] } | null = null;

/**
 * ways[r][covered]: how many ways r more characters complete a password whose places so far cover the sets `covered`
 * (a bit mask). The last table is kept: a list of passwords asks for the same one each time.
 */
function completions(sizes: number[], length: number): bigint[][] {
  const key = `${sizes.join()}/${length}`;
  if (lastWays?.key === key) return lastWays.ways;
  const all = (1 << sizes.length) - 1;
  const ways: bigint[][] = [Array.from({ length: all + 1 }, (_, covered) => (covered === all ? 1n : 0n))];
  for (let r = 1; r <= length; r++) {
    ways.push(Array.from({ length: all + 1 }, (_, covered) => sizes.reduce((sum, size, i) => sum + BigInt(size) * ways[r - 1]![covered | (1 << i)]!, 0n)));
  }
  lastWays = { key, ways };
  return ways;
}

/**
 * A password of random characters from the chosen sets. With `requireEach` (the default) every password that has one
 * character of each set is equally likely, and no other is made: each place's set is drawn with the exact number of
 * ways the rest can still be completed, so the time does not depend on how few passwords qualify. A missing
 * character is never put in at a random place (that would favour some passwords).
 */
export function generatePassword(options: PasswordOptions, random: RandomSource = cryptoRandom): Result<string> {
  const pool = characterPool(options);
  if (!pool.ok) return pool;
  const { sets, pool: chars } = pool.value;
  if (!(options.requireEach ?? true)) return { ok: true, value: Array.from({ length: options.length }, () => pick(chars, random)).join("") };
  const all = (1 << sets.length) - 1;
  const ways = completions(sets.map((set) => set.length), options.length);
  let covered = 0;
  let password = "";
  for (let r = options.length; r > 0; r--) {
    // Once every set is in, each remaining place is any character of the pool, all equally likely.
    if (covered === all) {
      password += pick(chars, random);
      continue;
    }
    let x = randomBelow(ways[r]![covered]!, random);
    for (const [i, set] of sets.entries()) {
      const share = BigInt(set.length) * ways[r - 1]![covered | (1 << i)]!;
      if (x < share) {
        // x is uniform below set.length × ways: its remainder picks the character, uniformly.
        password += set[Number(x % BigInt(set.length))];
        covered |= 1 << i;
        break;
      }
      x -= share;
    }
  }
  return { ok: true, value: password };
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
