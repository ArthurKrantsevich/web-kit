// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateMemorable, memorableBits, SYLLABLES } from "./memorable";
import { seededRandom } from "./seeded";

const value = (result: ReturnType<typeof generateMemorable>) => (result.ok ? result.value : result.error.message);
const SYLLABLE = /[bdfghklmnprstvz][aeiou][nr]?/y;

/** In how many ways a group splits into syllables of the set. */
function parses(group: string, from = 0): number {
  if (from === group.length) return 1;
  let ways = 0;
  for (const syllable of SYLLABLES) if (group.startsWith(syllable, from)) ways += parses(group, from + syllable.length);
  return ways;
}

describe("memorable passwords", () => {
  it("have 225 different syllables: a consonant, a vowel, and n, r or nothing", () => {
    expect(SYLLABLES.length).toBe(225);
    expect(new Set(SYLLABLES).size).toBe(225);
    expect(SYLLABLES.every((syllable) => new RegExp(`^${SYLLABLE.source}$`).test(syllable))).toBe(true);
  });

  it("make groups that split into their syllables in exactly one way", () => {
    const random = seededRandom(41);
    for (let i = 0; i < 3000; i++) {
      for (const group of value(generateMemorable({ groups: 3, syllables: 4 }, random)).split("-")) {
        expect([group, parses(group)]).toEqual([group, 1]);
      }
    }
  });

  it("use every syllable, capitalize groups and add one digit to one group", () => {
    const random = seededRandom(42);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const password = value(generateMemorable({ groups: 2, syllables: 4, capitalize: true, includeNumber: true, separator: "." }, random));
      const groups = password.split(".");
      expect(groups.every((group) => /^[A-Z][a-z]+\d?$/.test(group))).toBe(true);
      expect(groups.filter((group) => /\d$/.test(group))).toHaveLength(1);
      for (const group of groups) for (const match of group.toLowerCase().replace(/\d$/, "").matchAll(/[bdfghklmnprstvz][aeiou](?:[nr](?![aeiou]))?/g)) seen.add(match[0]);
    }
    expect(seen.size).toBe(225);
  });

  it("have log2(225) bits per syllable and log2(groups × 10) more with a number", () => {
    expect(memorableBits({ groups: 3, syllables: 3 })).toBeCloseTo(9 * Math.log2(225), 10);
    expect(memorableBits({ groups: 3, syllables: 3, includeNumber: true })).toBeCloseTo(9 * Math.log2(225) + Math.log2(30), 10);
    expect(memorableBits({ groups: 1, syllables: 3 })).toBe(0);
  });

  it("refuses a shape it cannot make", () => {
    expect(value(generateMemorable({ groups: 1, syllables: 3 }))).toBe("The number of groups must be from 2 to 8");
    expect(value(generateMemorable({ groups: 9, syllables: 3 }))).toBe("The number of groups must be from 2 to 8");
    expect(value(generateMemorable({ groups: 3, syllables: 5 }))).toBe("A group has 2 to 4 syllables");
  });
});
