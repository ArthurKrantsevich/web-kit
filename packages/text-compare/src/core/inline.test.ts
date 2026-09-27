import { describe, expect, it } from "vitest";
import { inlineDiff, splitGraphemes, splitWords } from "./inline";
import { random, randomText } from "./seeded";

const marked = (segments: { text: string; changed: boolean }[]) => segments.map((s) => (s.changed ? `[${s.text}]` : s.text)).join("");

describe("splitWords", () => {
  it("keeps runs of letters and digits and of whitespace, and every other character alone", () => {
    expect(splitWords("foo_bar(1, 22)  тест")).toEqual(["foo", "_", "bar", "(", "1", ",", " ", "22", ")", "  ", "тест"]);
  });

  it("keeps accents with their letters and emoji whole", () => {
    expect(splitWords("cafe\u0301 👍🏽!")).toEqual(["cafe\u0301", " ", "👍🏽", "!"]);
  });
});

describe("splitGraphemes", () => {
  it("never cuts an emoji or a letter with its accent", () => {
    expect(splitGraphemes("a👍🏽e\u0301")).toEqual(["a", "👍🏽", "e\u0301"]);
  });
});

describe("inlineDiff", () => {
  it("marks the changed words on both sides", () => {
    const { left, right } = inlineDiff("the quick brown fox", "the slow brown fox", "word");
    expect([marked(left), marked(right)]).toEqual(["the [quick] brown fox", "the [slow] brown fox"]);
  });

  it("marks changed characters", () => {
    const { left, right } = inlineDiff("colour", "color", "char");
    expect([marked(left), marked(right)]).toEqual(["colo[u]r", "color"]);
  });

  it("highlights the space between two changed words with them", () => {
    const { left, right } = inlineDiff("a b c d", "a x y d", "word");
    expect([marked(left), marked(right)]).toEqual(["a [b c] d", "a [x y] d"]);
  });

  it("never highlights what the options ignore", () => {
    expect(marked(inlineDiff("Hello  World", "hello World!", "word", { ignoreCase: true, ignoreWhitespace: true }).left)).toBe("Hello  World");
    expect(marked(inlineDiff("Hello  World", "hello World!", "word", { ignoreCase: true, ignoreWhitespace: true }).right)).toBe("hello World[!]");
    expect(marked(inlineDiff("a  b", "a b", "char", { ignoreWhitespace: true }).left)).toBe("a  b");
  });

  it("does not cut an emoji in character mode", () => {
    const { left, right } = inlineDiff("ok 👍🏽", "ok 👍🏿", "char");
    expect([marked(left), marked(right)]).toEqual(["ok [👍🏽]", "ok [👍🏿]"]);
  });

  it("marks nothing for equal lines, and a whole long line that differs", () => {
    expect(inlineDiff("same", "same", "word")).toEqual({ left: [{ text: "same", changed: false }], right: [{ text: "same", changed: false }] });
    const long = "x".repeat(10_001);
    expect(inlineDiff(long, `${long}y`, "char").right).toEqual([{ text: `${long}y`, changed: true }]);
  });

  it("gives back each line whole, in order, on random lines (seeded)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = random(seed);
      const a = randomText(next, 6).replace(/[\r\n\uFEFF]/g, " ");
      const b = randomText(next, 6).replace(/[\r\n\uFEFF]/g, " ");
      for (const granularity of ["word", "char"] as const) {
        const { left, right } = inlineDiff(a, b, granularity, { ignoreCase: next() < 0.5 });
        expect([seed, left.map((s) => s.text).join(""), right.map((s) => s.text).join("")]).toEqual([seed, a, b]);
      }
    }
  });
});
