// @vitest-environment node
import { describe, expect, it } from "vitest";
import { crackTime, entropy, strength } from "./strength";

describe("entropy", () => {
  it("measures each way of generating", () => {
    expect(entropy({ mode: "characters", length: 16, requireEach: false })).toBeCloseTo(16 * Math.log2(94), 10);
    expect(entropy({ mode: "words", words: 6 })).toBeCloseTo(6 * Math.log2(7776), 10);
    expect(entropy({ mode: "memorable", groups: 3, syllables: 3 })).toBeCloseTo(9 * Math.log2(225), 10);
    expect(entropy({ mode: "pin", length: 6 })).toBeGreaterThan(19.9);
    expect(entropy({ mode: "characters", length: 16, lower: false, upper: false, digits: false, symbols: false })).toBe(0);
  });
});

describe("crackTime and strength", () => {
  // Expected texts computed with Python from 2^(bits − 1) / 10^10 seconds.
  it("says how long half of all guesses take at 10¹⁰ per second", () => {
    expect(crackTime(20)).toEqual({ seconds: 2 ** 19 / 1e10, text: "instantly" });
    expect(crackTime(36).text).toBe("3 seconds");
    expect(crackTime(40).text).toBe("54 seconds");
    expect(crackTime(46).text).toBe("58 minutes");
    expect(crackTime(47).text).toBe("1 hour");
    expect(crackTime(52).text).toBe("2 days");
    expect(crackTime(56).text).toBe("1 month");
    expect(crackTime(60).text).toBe("1 year");
    expect(crackTime(64).text).toBe("29 years");
    expect(crackTime(68).text).toBe("centuries");
  });

  it("is weak below 50 bits, fair below 72, strong below 100, very strong from 100", () => {
    expect([49.9, 50, 71.9, 72, 99.9, 100].map(strength)).toEqual(["weak", "fair", "fair", "strong", "strong", "very strong"]);
  });
});
