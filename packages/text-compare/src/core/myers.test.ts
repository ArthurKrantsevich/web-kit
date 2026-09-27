import { describe, expect, it } from "vitest";
import { defaultCost, diffKeys, indentOf, MIN_COST } from "./myers";
import { random } from "./seeded";

const keys = (...items: number[]) => Int32Array.from(items);
const marks = (diff: { left: Uint8Array; right: Uint8Array }) => [Array.from(diff.left), Array.from(diff.right)];

/** Length of the longest common subsequence, by dynamic programming: the reference for small inputs. */
function lcs(a: Int32Array, b: Int32Array): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : Math.max(row[j]!, row[j - 1]!);
      diagonal = up;
    }
  }
  return row[b.length]!;
}

/** The unchanged items of both sides, in order, are the same keys: the marks describe a real common subsequence. */
function kept(a: Int32Array, b: Int32Array, diff: { left: Uint8Array; right: Uint8Array }): [number[], number[]] {
  return [Array.from(a).filter((_, i) => !diff.left[i]), Array.from(b).filter((_, j) => !diff.right[j])];
}

function randomKeys(next: () => number, size: number, alphabet: number): Int32Array {
  return Int32Array.from({ length: Math.floor(next() * (size + 1)) }, () => Math.floor(next() * alphabet));
}

describe("diffKeys", () => {
  it("marks nothing for equal sequences, everything against an empty one", () => {
    expect(marks(diffKeys(keys(1, 2, 3), keys(1, 2, 3)))).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(marks(diffKeys(keys(1, 2), keys()))).toEqual([[1, 1], []]);
    expect(marks(diffKeys(keys(), keys(1)))).toEqual([[], [1]]);
  });

  it("marks a replaced item on both sides", () => {
    expect(marks(diffKeys(keys(1, 2, 3), keys(1, 9, 3)))).toEqual([[0, 1, 0], [0, 1, 0]]);
  });

  it("finds a shortest diff", () => {
    const diff = diffKeys(keys(1, 2, 3, 4, 5, 6), keys(2, 3, 9, 5, 6, 7));
    expect(marks(diff)).toEqual([[1, 0, 0, 1, 0, 0], [0, 0, 1, 0, 0, 1]]);
    expect(diff.approximate).toBe(false);
  });

  it("slides an insertion among equal items down, as git does", () => {
    // Inserting one of three equal items: git shows the last one as new.
    expect(marks(diffKeys(keys(1, 5, 5, 2), keys(1, 5, 5, 5, 2)))).toEqual([[0, 0, 0, 0], [0, 0, 0, 1, 0]]);
  });

  it("moves an inserted run to end on a blank line when the indent heuristic applies", () => {
    // }, "", g {, }, "", h {  ← the insertion of "g {", "}", "" can be shown in three places.
    const lines = ["f {", "}", "", "g {", "}", "", "h {", "}"];
    const ids = new Map<string, number>();
    const id = (line: string) => ids.get(line) ?? (ids.set(line, ids.size), ids.size - 1);
    const left = ["f {", "}", "", "h {", "}"];
    const diff = diffKeys(
      Int32Array.from(left, id),
      Int32Array.from(lines, id),
      undefined,
      Int32Array.from(left, indentOf),
      Int32Array.from(lines, indentOf),
    );
    expect(lines.filter((_, j) => diff.right[j])).toEqual(["g {", "}", ""]);
    expect(Array.from(diff.right)).toEqual([0, 0, 0, 1, 1, 1, 0, 0]);
  });

  // Time limits here guard against quadratic work (minutes on these sizes); they leave room for a busy machine.
  it("marks items the other side does not have without searching for them", () => {
    const a = Int32Array.from({ length: 50_000 }, (_, i) => i);
    const b = Int32Array.from({ length: 50_000 }, (_, i) => 100_000 + i);
    const started = performance.now();
    const diff = diffKeys(a, b);
    expect(performance.now() - started).toBeLessThan(3000);
    expect([diff.left.every((mark) => mark === 1), diff.right.every((mark) => mark === 1), diff.approximate]).toEqual([true, true, false]);
  });

  it("stays fast on large inputs with a few changes", () => {
    const a = Int32Array.from({ length: 200_000 }, (_, i) => i);
    const b = Int32Array.from(a);
    for (const at of [10, 50_000, 120_000, 199_999]) b[at] = -at - 1;
    const started = performance.now();
    const diff = diffKeys(a, b);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(diff.left.reduce((sum, mark) => sum + mark, 0)).toBe(4);
  });

  it("gives up on a minimal result when the search gets too costly, and says so", () => {
    const next = random(7);
    const a = Int32Array.from({ length: 4000 }, () => Math.floor(next() * 3));
    const b = Int32Array.from({ length: 4000 }, () => Math.floor(next() * 3));
    const started = performance.now();
    const diff = diffKeys(a, b, 20);
    expect(performance.now() - started).toBeLessThan(8000);
    expect(diff.approximate).toBe(true);
    const [left, right] = kept(a, b, diff);
    expect(left).toEqual(right);
  });

  describe("on random sequences (seeded)", () => {
    it("always describes a common subsequence, and a longest one when not cut short", () => {
      for (let seed = 1; seed <= 400; seed++) {
        const next = random(seed);
        const a = randomKeys(next, 40, 4);
        const b = randomKeys(next, 40, 4);
        const diff = diffKeys(a, b);
        const [left, right] = kept(a, b, diff);
        expect([seed, left]).toEqual([seed, right]);
        expect([seed, diff.approximate, left.length]).toEqual([seed, false, lcs(a, b)]);
      }
    });

    it("stays a valid diff with a tiny cost limit", () => {
      let approximate = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const next = random(seed);
        const a = randomKeys(next, 60, 3);
        const b = randomKeys(next, 60, 3);
        const diff = diffKeys(a, b, 1 + Math.floor(next() * 3));
        const [left, right] = kept(a, b, diff);
        expect([seed, left]).toEqual([seed, right]);
        if (diff.approximate) approximate++;
        else expect([seed, left.length]).toEqual([seed, lcs(a, b)]);
      }
      expect(approximate).toBeGreaterThan(100);
    });
  });
});

describe("defaultCost", () => {
  it("is the square root of the size, at least 256, as in git", () => {
    expect(defaultCost(10, 10)).toBe(MIN_COST);
    expect(defaultCost(200_000, 200_000)).toBe(633);
  });
});

describe("indentOf", () => {
  it("counts spaces, moves tabs to the next multiple of 8, and is -1 for a blank line", () => {
    expect([indentOf("a"), indentOf("  a"), indentOf("\ta"), indentOf("  \ta"), indentOf(" \t "), indentOf("")]).toEqual([0, 2, 8, 8, -1, -1]);
  });

  it("stops at 200", () => {
    expect(indentOf(`${" ".repeat(300)}x`)).toBe(200);
  });
});
