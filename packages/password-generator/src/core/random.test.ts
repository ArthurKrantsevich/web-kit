// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generatePassword } from "./password";
import { randomInt } from "./random";
import { chiSquare, scriptedRandom, seededRandom } from "./seeded";

describe("randomInt", () => {
  it("throws away values at or above the largest multiple of n instead of wrapping them", () => {
    // 2³² = 3 × 1,431,655,765 + 1: 4,294,967,295 is the one value that would favour 0.
    const random = scriptedRandom([4_294_967_295, 7]);
    expect(randomInt(3, random)).toBe(1);
    expect(randomInt(3, scriptedRandom([4_294_967_294]))).toBe(4_294_967_294 % 3);
  });

  it("covers 1 to 2³² and refuses anything else", () => {
    expect(randomInt(1)).toBe(0);
    expect(randomInt(2 ** 32, scriptedRandom([4_294_967_295]))).toBe(4_294_967_295);
    expect(() => randomInt(0)).toThrow(RangeError);
    expect(() => randomInt(1.5)).toThrow(RangeError);
    expect(() => randomInt(2 ** 32 + 1)).toThrow(RangeError);
  });

  it("uses crypto.getRandomValues by default", () => {
    const values = Array.from({ length: 200 }, () => randomInt(1000));
    expect(values.every((value) => Number.isInteger(value) && value >= 0 && value < 1000)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(100);
  });
});

// Seconds on a CI runner that is 2–3 times slower than a laptop, under a full parallel `pnpm verify`: its own timeout.
it("has no bias over 1,000,000 characters from a pool of 36, which does not divide 2³² (χ² < 66.62, p = 0.001)", { timeout: 20_000 }, () => {
  const random = seededRandom(11);
  const pool = "abcdefghijklmnopqrstuvwxyz0123456789";
  const counts = new Array<number>(pool.length).fill(0);
  for (let i = 0; i < 10_000; i++) {
    const password = generatePassword({ length: 100, upper: false, symbols: false, requireEach: false }, random);
    for (const char of password.ok ? password.value : "") counts[pool.indexOf(char)]! += 1;
  }
  expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1_000_000);
  expect(chiSquare(counts)).toBeLessThan(66.62);
});
