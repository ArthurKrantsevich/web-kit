// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generatePassphrase, passphraseBits } from "./passphrase";
import { seededRandom } from "./seeded";

const WORDS = ["apple", "brick", "cloud", "delta", "ember", "frost", "grain", "harbor"];
const value = (result: ReturnType<typeof generatePassphrase>) => (result.ok ? result.value : result.error.message);

describe("generatePassphrase", () => {
  it("joins the number of words asked for with the separator", () => {
    const random = seededRandom(21);
    for (const [words, separator] of [[3, "-"], [6, " "], [12, "."], [5, "_"], [4, " + "]] as const) {
      const parts = value(generatePassphrase({ words, separator }, WORDS, random)).split(separator);
      expect([parts.length, parts.every((part) => WORDS.includes(part))]).toEqual([words, true]);
    }
  });

  it("capitalizes every word, and puts one digit at the end of one word", () => {
    const random = seededRandom(22);
    for (let i = 0; i < 200; i++) {
      const parts = value(generatePassphrase({ words: 4, capitalize: true, includeNumber: true }, WORDS, random)).split("-");
      expect(parts.every((part) => /^[A-Z][a-z]+\d?$/.test(part))).toBe(true);
      expect(parts.filter((part) => /\d$/.test(part))).toHaveLength(1);
    }
  });

  it("uses every word of the list and the digit in every word", () => {
    const random = seededRandom(23);
    const seen = new Set<string>();
    const places = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const parts = value(generatePassphrase({ words: 3, includeNumber: true }, WORDS, random)).split("-");
      for (const part of parts) seen.add(part.replace(/\d$/, ""));
      places.add(parts.findIndex((part) => /\d$/.test(part)));
    }
    expect([seen.size, [...places].sort()]).toEqual([8, [0, 1, 2]]);
  });

  it("refuses a word count, a separator or a list it cannot use", () => {
    expect(value(generatePassphrase({ words: 2 }, WORDS))).toBe("The number of words must be from 3 to 12");
    expect(value(generatePassphrase({ words: 13 }, WORDS))).toBe("The number of words must be from 3 to 12");
    expect(value(generatePassphrase({ words: 4, separator: "x".repeat(17) }, WORDS))).toBe("The separator can be at most 16 characters");
    expect(value(generatePassphrase({ words: 4 }, ["same", "same"]))).toBe("The word list needs at least two different words");
  });

  it("has words × log2(7776) bits, and log2(words × 10) more with a number", () => {
    expect(passphraseBits({ words: 6 })).toBeCloseTo(6 * Math.log2(7776), 10);
    expect(passphraseBits({ words: 6, includeNumber: true, capitalize: true })).toBeCloseTo(6 * Math.log2(7776) + Math.log2(60), 10);
    expect(passphraseBits({ words: 4 }, 8)).toBe(12);
    expect(passphraseBits({ words: 2 })).toBe(0);
  });
});
