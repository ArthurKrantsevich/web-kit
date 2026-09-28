// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AMBIGUOUS, characterPool, DIGITS, LOWER, SYMBOLS, UPPER } from "./charset";
import { countWithEach, generatePassword, passwordBits } from "./password";
import { chiSquare, seededRandom } from "./seeded";

const value = (result: ReturnType<typeof generatePassword>) => (result.ok ? result.value : result.error.message);
/** Leaves only `keep` of the letters and digits (upper case and symbols off). */
const only = (keep: string) => ({ upper: false, symbols: false, exclude: [...LOWER, ...DIGITS].filter((char) => !keep.includes(char)).join("") });

describe("character sets", () => {
  it("has 26 + 26 + 10 letters and digits and all 32 printable ASCII symbols", () => {
    const printable = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i));
    expect([...SYMBOLS].sort()).toEqual(printable.filter((char) => !/[A-Za-z0-9]/.test(char)).sort());
    expect(new Set([...LOWER, ...UPPER, ...DIGITS, ...SYMBOLS]).size).toBe(94);
    expect(AMBIGUOUS).toBe("Il1O0o");
  });

  it("says why no password can be made", () => {
    const message = (options: Parameters<typeof characterPool>[0]) => {
      const pool = characterPool(options);
      return pool.ok ? "ok" : pool.error.message;
    };
    expect(message({ length: 3 })).toBe("The length must be a whole number from 4 to 128");
    expect(message({ length: 129 })).toBe("The length must be a whole number from 4 to 128");
    expect(message({ length: 8, lower: false, upper: false, digits: false, symbols: false })).toBe("Choose at least one set of characters");
    expect(message({ length: 8, lower: false, upper: false, symbols: false, exclude: DIGITS })).toBe("The exclusions leave no characters to choose from");
    expect(message({ length: 8, exclude: DIGITS })).toBe("The exclusions leave no digits, and Require each needs one");
    expect(message({ length: 8, exclude: DIGITS, requireEach: false })).toBe("ok");
  });
});

describe("generatePassword", () => {
  it("has the length asked for and leaves out ambiguous and excluded characters", () => {
    const random = seededRandom(12);
    for (let i = 0; i < 300; i++) {
      const password = value(generatePassword({ length: 40, excludeAmbiguous: true, exclude: "#$%abc" }, random));
      expect([password, password.length, /[Il1O0o#$%abc]/.test(password)]).toEqual([password, 40, false]);
    }
  });

  it("with Require each always has one of every chosen set, even when they are small", () => {
    const random = seededRandom(13);
    for (let i = 0; i < 2000; i++) {
      const password = value(generatePassword({ length: 4, ...only("ab01"), upper: true, exclude: `${only("ab01").exclude}${UPPER.slice(1)}` }, random));
      expect([password, /[ab]/.test(password) && /[01]/.test(password) && password.includes("A")]).toEqual([password, true]);
    }
  });

  // Seconds on a CI runner that is 2–3 times slower than a laptop, under a full parallel `pnpm verify`: its own timeout.
  it("keeps every allowed password equally likely with Require each (χ² over the 224 passwords of ab01, length 4)", { timeout: 20_000 }, () => {
    const random = seededRandom(14);
    const counts = new Map<string, number>();
    // 22,400 draws: 100 expected per password, plenty for χ², and fast enough for a slow CI runner.
    for (let i = 0; i < 22_400; i++) {
      const password = value(generatePassword({ length: 4, ...only("ab01") }, random));
      counts.set(password, (counts.get(password) ?? 0) + 1);
    }
    expect(counts.size).toBe(224);
    // 223 degrees of freedom: 297.9 is the critical value for p = 0.001.
    expect(chiSquare([...counts.values()])).toBeLessThan(297.9);
  });
});

describe("entropy of character passwords", () => {
  /** Every string of `length` characters from `chars`. */
  const all = (chars: string, length: number): string[] =>
    length === 0 ? [""] : all(chars, length - 1).flatMap((head) => [...chars].map((char) => head + char));

  it("with Require each equals log2 of the passwords counted one by one", () => {
    for (const [keep, sets, length] of [
      ["ab01", ["ab", "01"], 4],
      ["abc0", ["abc", "0"], 5],
      ["a01", ["a", "01"], 6],
    ] as const) {
      const counted = all(keep, length).filter((password) => sets.every((set) => [...set].some((char) => password.includes(char)))).length;
      expect([keep, countWithEach(sets.map((set) => [...set]), length)]).toEqual([keep, BigInt(counted)]);
      expect(passwordBits({ length, ...only(keep) })).toBeCloseTo(Math.log2(counted), 10);
    }
  });

  it("is length × log2(pool) without Require each, and exact for 128 characters of all 94", () => {
    expect(passwordBits({ length: 20, requireEach: false })).toBeCloseTo(20 * Math.log2(94), 10);
    expect(passwordBits({ length: 20, excludeAmbiguous: true, requireEach: false })).toBeCloseTo(20 * Math.log2(88), 10);
    // Nearly all 94^128 passwords have one of each: the exact count is a little below.
    const bits = passwordBits({ length: 128 });
    expect(bits).toBeLessThan(128 * Math.log2(94));
    expect(bits).toBeGreaterThan(128 * Math.log2(94) - 1e-6);
    expect(passwordBits({ length: 3 })).toBe(0);
  });
});
