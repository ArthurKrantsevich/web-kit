import type { RandomSource } from "./types";

/** `crypto.getRandomValues` of the browser, a worker or Node 20+: the only source of randomness in this package. */
export const cryptoRandom: RandomSource = (values) => {
  crypto.getRandomValues(values);
};

const RANGE = 2 ** 32;

/**
 * A whole number from 0 to n − 1, every one equally likely: 32-bit values at or above the largest multiple of n are
 * thrown away (a plain `value % n` would favour the small numbers). n is 1 to 2³².
 */
export function randomInt(n: number, random: RandomSource = cryptoRandom): number {
  if (!Number.isInteger(n) || n < 1 || n > RANGE) throw new RangeError(`randomInt: n must be a whole number from 1 to 2^32, not ${n}`);
  const limit = RANGE - (RANGE % n);
  const value = new Uint32Array(1);
  for (;;) {
    random(value);
    if (value[0]! < limit) return value[0]! % n;
  }
}

/** A whole number from 0 to n − 1 for a BigInt n ≥ 1, every one equally likely (whole 32-bit words, masked, retried). */
export function randomBelow(n: bigint, random: RandomSource = cryptoRandom): bigint {
  const bits = n.toString(2).length;
  const words = new Uint32Array(Math.ceil(bits / 32));
  const mask = (1n << BigInt(bits)) - 1n;
  for (;;) {
    random(words);
    const value = words.reduce((sum, word) => (sum << 32n) | BigInt(word), 0n) & mask;
    if (value < n) return value;
  }
}

/** A random element of a non-empty list. */
export function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[randomInt(items.length, random)]!;
}
