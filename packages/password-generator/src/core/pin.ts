import { log2Big } from "./bits";
import { cryptoRandom, randomInt } from "./random";
import type { PinOptions, RandomSource, Result } from "./types";

export const MIN_PIN = 4;
export const MAX_PIN = 12;

/**
 * A PIN nobody should use: one digit repeated (0000), a run up or down without wrapping (1234, 9876), a pair repeated
 * (1212, 12121), and for four digits a year from 1900 to 2099.
 */
export function isObviousPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((digit, i) => digit - digits[i]!);
  if (steps.every((step) => step === 0)) return true;
  if (steps.every((step) => step === 1) || steps.every((step) => step === -1)) return true;
  if (digits.every((digit, i) => digit === digits[i % 2])) return true;
  return digits.length === 4 && Number(pin) >= 1900 && Number(pin) <= 2099;
}

/** How many PINs of this length `isObviousPin` refuses, counted without trying them all. */
export function countObviousPins(length: number): number {
  const found = new Set<string>();
  for (let d = 0; d < 10; d++) found.add(String(d).repeat(length));
  for (let start = 0; start + length <= 10; start++) {
    const up = Array.from({ length }, (_, i) => start + i).join("");
    found.add(up);
    found.add([...up].reverse().join(""));
  }
  for (let a = 0; a < 10; a++) {
    for (let b = 0; b < 10; b++) found.add(Array.from({ length }, (_, i) => (i % 2 === 0 ? a : b)).join(""));
  }
  if (length === 4) for (let year = 1900; year <= 2099; year++) found.add(String(year));
  return found.size;
}

/** Digits only, every PIN that is not obvious equally likely: an obvious one is thrown away and another drawn. */
export function generatePin(options: PinOptions, random: RandomSource = cryptoRandom): Result<string> {
  const { length } = options;
  if (!Number.isInteger(length) || length < MIN_PIN || length > MAX_PIN) {
    return { ok: false, error: { message: `A PIN has ${MIN_PIN} to ${MAX_PIN} digits` } };
  }
  for (;;) {
    const pin = Array.from({ length }, () => randomInt(10, random)).join("");
    if (!isObviousPin(pin)) return { ok: true, value: pin };
  }
}

/** Bits of a PIN: log2 of the PINs that are left. */
export function pinBits(options: PinOptions): number {
  const { length } = options;
  if (!Number.isInteger(length) || length < MIN_PIN || length > MAX_PIN) return 0;
  return log2Big(10n ** BigInt(length) - BigInt(countObviousPins(length)));
}
