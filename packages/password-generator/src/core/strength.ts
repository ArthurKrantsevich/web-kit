import { passphraseBits } from "./passphrase";
import { memorableBits } from "./memorable";
import { passwordBits } from "./password";
import { pinBits } from "./pin";
import type { GeneratorOptions, Strength } from "./types";

/** Guesses per second of an offline attack on a fast hash. */
export const GUESSES_PER_SECOND = 1e10;

/**
 * The exact entropy in bits of the chosen way of generating: log2 of the number of equally likely results. 0 when
 * the options allow none.
 */
export function entropy(options: GeneratorOptions): number {
  switch (options.mode) {
    case "characters":
      return passwordBits(options);
    case "words":
      return passphraseBits(options, options.listSize);
    case "memorable":
      return memorableBits(options);
    case "pin":
      return pinBits(options);
  }
}

const UNITS: [number, string][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [365.25 / 12, "day"],
  [12, "month"],
  [100, "year"],
];

/**
 * How long an attacker making 10¹⁰ guesses per second needs on average (half of all possibilities), and the same in
 * words: "instantly", "3 hours", "centuries".
 */
export function crackTime(bits: number): { seconds: number; text: string } {
  const seconds = 2 ** (bits - 1) / GUESSES_PER_SECOND;
  if (seconds < 1) return { seconds, text: "instantly" };
  let value = seconds;
  for (const [size, unit] of UNITS) {
    if (value < size) {
      const whole = Math.floor(value);
      return { seconds, text: `${whole} ${unit}${whole === 1 ? "" : "s"}` };
    }
    value /= size;
  }
  return { seconds, text: "centuries" };
}

/** Weak below 50 bits, fair below 72, strong below 100, very strong from 100. */
export function strength(bits: number): Strength {
  return bits < 50 ? "weak" : bits < 72 ? "fair" : bits < 100 ? "strong" : "very strong";
}
