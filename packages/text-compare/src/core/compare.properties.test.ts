import { describe, expect, it } from "vitest";
import { compareTexts } from "./compare";
import { splitLines } from "./lines";
import { editText, pick, random, randomText } from "./seeded";
import type { CompareOptions, TextDiff } from "./types";

const SEEDS = 500;

const OPTION_SETS: CompareOptions[] = [
  {},
  { ignoreLineEndings: false },
  { ignoreWhitespace: true },
  { ignoreCase: true },
  { ignoreBlankLines: true },
  { ignoreWhitespace: true, ignoreCase: true, ignoreBlankLines: true },
];

/**
 * Applies the diff to the left text: equal blocks keep the left lines, change blocks take the right ones. With
 * `lf`, every line ends with "\n": joining a line that ends with a lone CR and an empty line that ends with LF from
 * the other side would otherwise make one CRLF of them.
 */
function rebuild(left: string, right: string, diff: TextDiff, lf = false): string {
  const a = splitLines(left);
  const b = splitLines(right);
  let text = b.bom ? "\uFEFF" : "";
  for (const block of diff.blocks) {
    const [side, range] = block.kind === "equal" ? [a, block.left] : [b, block.right];
    for (let i = range.start; i < range.end; i++) text += side.lines[i]! + (lf ? "\n" : side.endings[i]!);
  }
  return text;
}

function pair(seed: number): [string, string, CompareOptions] {
  const next = random(seed);
  const left = randomText(next, 40);
  const right = next() < 0.75 ? editText(next, left) : randomText(next, 40);
  return [left, right, pick(next, OPTION_SETS)];
}

const changes = (diff: TextDiff) => diff.blocks.filter((block) => block.kind === "change").length;

describe("compareTexts on random texts (seeded)", () => {
  it("covers both texts with blocks in order, without gaps", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const [left, right, options] = pair(seed);
      const diff = compareTexts(left, right, options);
      let [i, j] = [0, 0];
      for (const block of diff.blocks) {
        expect([seed, block.left.start, block.right.start]).toEqual([seed, i, j]);
        [i, j] = [block.left.end, block.right.end];
      }
      expect([seed, i, j]).toEqual([seed, splitLines(left).lines.length, splitLines(right).lines.length]);
    }
  });

  it("applying every block to the left text gives the right text exactly, with nothing ignored", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const [left, right] = pair(seed);
      const diff = compareTexts(left, right, { ignoreLineEndings: false });
      expect([seed, rebuild(left, right, diff)]).toEqual([seed, right]);
    }
  });

  it("applying every block gives a text equal to the right one under the same options", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const [left, right, options] = pair(seed);
      const rebuilt = rebuild(left, right, compareTexts(left, right, options), options.ignoreLineEndings !== false);
      expect([seed, changes(compareTexts(rebuilt, right, options))]).toEqual([seed, 0]);
    }
  });

  it("is still correct when the search is cut short", () => {
    let approximate = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const [left, right] = pair(seed);
      const diff = compareTexts(left, right, { ignoreLineEndings: false }, 1);
      if (diff.approximate) approximate++;
      expect([seed, rebuild(left, right, diff)]).toEqual([seed, right]);
    }
    expect(approximate).toBeGreaterThan(20);
  });

  it("pairs every line of a change block once, in order on both sides, and counts them", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const [left, right, options] = pair(seed);
      const diff = compareTexts(left, right, options);
      const counts = { added: 0, removed: 0, changed: 0 };
      for (const block of diff.blocks) {
        if (block.kind !== "change") continue;
        const lefts = block.pairs!.flatMap((p) => (p.left === undefined ? [] : [p.left]));
        const rights = block.pairs!.flatMap((p) => (p.right === undefined ? [] : [p.right]));
        const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k);
        expect([seed, lefts, rights]).toEqual([seed, range(block.left.start, block.left.end), range(block.right.start, block.right.end)]);
        for (const p of block.pairs!) {
          if (p.left !== undefined && p.right !== undefined) counts.changed++;
          else if (p.left !== undefined) counts.removed++;
          else counts.added++;
        }
      }
      expect([seed, diff.counts]).toEqual([seed, counts]);
    }
  });

  it("finds no change between a text and itself, whatever the options", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const [left, , options] = pair(seed);
      expect([seed, changes(compareTexts(left, left, options))]).toEqual([seed, 0]);
    }
  });
});
