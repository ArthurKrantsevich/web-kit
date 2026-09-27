import { describe, expect, it } from "vitest";
import { compareTexts } from "./compare";
import { MAX_PAIR_LENGTH, pairBudget, pairLines, similarity } from "./pair";

const shape = (left: string, right: string, options = {}) =>
  compareTexts(left, right, options).blocks.map((block) => `${block.kind} ${block.left.start}-${block.left.end} ${block.right.start}-${block.right.end}`);

describe("compareTexts", () => {
  it("splits the texts into equal and change blocks", () => {
    expect(shape("a\nb\nc\nd\n", "a\nB\nc\nd\ne\n")).toEqual(["equal 0-1 0-1", "change 1-2 1-2", "equal 2-4 2-4", "change 4-4 4-5"]);
  });

  it("has no change blocks for equal texts, and no blocks at all for two empty ones", () => {
    expect(shape("a\nb", "a\nb")).toEqual(["equal 0-2 0-2"]);
    expect(compareTexts("", "")).toEqual({
      blocks: [],
      counts: { added: 0, removed: 0, changed: 0 },
      approximate: false,
      lineEndings: { left: "none", right: "none" },
      finalNewline: { left: true, right: true },
    });
  });

  it("pairs similar lines and counts them as changed, the rest as added or removed", () => {
    const diff = compareTexts("keep\nhello world\nold line\n", "keep\nhello, world\nsomething else entirely\nnew\n");
    expect(diff.blocks[1]!.pairs).toEqual([{ left: 1, right: 1 }, { left: 2 }, { right: 2 }, { right: 3 }]);
    expect(diff.counts).toEqual({ added: 2, removed: 1, changed: 1 });
  });

  it("keeps the order of both sides when pairing", () => {
    const diff = compareTexts("alpha one\nbeta two\n", "beta two!\nalpha one!\n");
    const pairs = diff.blocks[0]!.pairs!;
    const lefts = pairs.flatMap((pair) => (pair.left === undefined ? [] : [pair.left]));
    const rights = pairs.flatMap((pair) => (pair.right === undefined ? [] : [pair.right]));
    expect([lefts, rights]).toEqual([[0, 1], [0, 1]]);
    expect(pairs.filter((pair) => pair.left !== undefined && pair.right !== undefined)).toHaveLength(1);
  });

  it("treats CRLF, LF, CR and a missing last line break as equal by default", () => {
    expect(shape("a\r\nb\r\n", "a\nb")).toEqual(["equal 0-2 0-2"]);
    expect(shape("a\rb\r", "a\nb\n")).toEqual(["equal 0-2 0-2"]);
  });

  it("sees line endings when ignoreLineEndings is off", () => {
    expect(shape("a\r\nb\n", "a\nb\n", { ignoreLineEndings: false })).toEqual(["change 0-1 0-1", "equal 1-2 1-2"]);
    expect(shape("a\nb", "a\nb\n", { ignoreLineEndings: false })).toEqual(["equal 0-1 0-1", "change 1-2 1-2"]);
  });

  it("ignores whitespace and case when asked", () => {
    expect(shape("if (a)  {\n", "if(a) {\n", { ignoreWhitespace: true })).toEqual(["equal 0-1 0-1"]);
    expect(shape("Hello\n", "hELLO\n", { ignoreCase: true })).toEqual(["equal 0-1 0-1"]);
    expect(shape("Hello\n", "hELLO\n")).toEqual(["change 0-1 0-1"]);
  });

  it("with ignoreBlankLines, blank lines never make a change, and equal blocks pair their lines", () => {
    const diff = compareTexts("a\nb\n", "a\n\n\nb\n", { ignoreBlankLines: true });
    expect(diff.blocks).toEqual([
      { kind: "equal", left: { start: 0, end: 2 }, right: { start: 0, end: 4 }, pairs: [{ left: 0, right: 0 }, { right: 1 }, { right: 2 }, { left: 1, right: 3 }] },
    ]);
    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it("with ignoreBlankLines, moves blank lines at the edges of a change out of it", () => {
    expect(shape("a\nb\n", "a\n  \nc\n\n", { ignoreBlankLines: true })).toEqual(["equal 0-1 0-2", "change 1-2 2-3", "equal 2-2 3-4"]);
  });

  it("does not pair lines longer than 10,000 characters", () => {
    const long = "x".repeat(MAX_PAIR_LENGTH + 1);
    expect(compareTexts(`${long}\n`, `${long}y\n`).counts).toEqual({ added: 1, removed: 1, changed: 0 });
  });

  it("reports the line endings and the last line break of each side", () => {
    const diff = compareTexts("a\r\nb\r\n", "a\nb");
    expect([diff.lineEndings, diff.finalNewline]).toEqual([{ left: "crlf", right: "lf" }, { left: true, right: false }]);
  });

  it("ignores a BOM", () => {
    expect(shape("\uFEFFa\n", "a\n")).toEqual(["equal 0-1 0-1"]);
  });

  it("marks a result as approximate when the search was cut short, and it still covers both texts", () => {
    const left = Array.from({ length: 300 }, (_, i) => (i % 3 === 0 ? "a" : i % 3 === 1 ? "b" : "c")).join("\n");
    const right = Array.from({ length: 300 }, (_, i) => (i % 2 === 0 ? "c" : "a")).join("\n");
    const diff = compareTexts(left, right, {}, 2);
    expect(diff.approximate).toBe(true);
    expect([diff.blocks.at(-1)!.left.end, diff.blocks.at(-1)!.right.end]).toEqual([300, 300]);
    expect(compareTexts(left, right).approximate).toBe(false);
  });

  // A guard against quadratic work (it would take minutes), with room for a busy machine.
  it("compares two 5 MB texts with scattered changes in seconds", { timeout: 30_000 }, () => {
    const lines = Array.from({ length: 100_000 }, (_, i) => `line ${i}: the quick brown fox jumps over the lazy dog`);
    const left = `${lines.join("\n")}\n`;
    for (let i = 500; i < lines.length; i += 1000) lines[i] = `${lines[i]} (edited)`;
    const right = `${lines.join("\n")}\n`;
    const started = performance.now();
    const diff = compareTexts(left, right);
    expect(performance.now() - started).toBeLessThan(15_000);
    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 100 });
  });
});

describe("similarity", () => {
  it("is the share of matching characters from 0.5 up, and 0 below", () => {
    expect(similarity("abcd", "abcd", pairBudget())).toBe(1);
    expect(similarity("abcd", "abce", pairBudget())).toBe(0.75);
    expect(similarity("abcd", "wxyz", pairBudget())).toBe(0);
    expect(similarity("a", "abcdefgh", pairBudget())).toBe(0);
  });

  it("stops when the budget is spent", () => {
    expect(similarity("abcd", "abce", { steps: 3 })).toBe(0);
  });
});

describe("pairLines", () => {
  it("pairs in order, removed lines before added ones between pairs", () => {
    // "gone" and "new" are similar enough, but pairing them would cross the better pair.
    expect(pairLines(["same line", "gone"], ["new", "same line!"], 10, 20, pairBudget())).toEqual([
      { right: 20 },
      { left: 10, right: 21 },
      { left: 11 },
    ]);
  });

  it("pairs line by line in blocks too large to align in full", () => {
    const left = Array.from({ length: 60 }, (_, i) => `row ${i}`);
    const right = Array.from({ length: 60 }, (_, i) => (i === 3 ? "something else" : `row ${i}!`));
    const pairs = pairLines(left, right, 0, 0, pairBudget());
    expect(pairs.filter((pair) => pair.left !== undefined && pair.right !== undefined)).toHaveLength(59);
    expect(pairs.slice(3, 5)).toEqual([{ left: 3 }, { right: 3 }]);
  });
});
