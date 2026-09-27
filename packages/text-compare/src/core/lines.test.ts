import { describe, expect, it } from "vitest";
import { dominantEnding, isBlank, lineKeys, normalizeLine, splitLines } from "./lines";

describe("splitLines", () => {
  it("cuts at LF, CRLF and CR and keeps each line's ending", () => {
    expect(splitLines("a\nb\r\nc\rd")).toEqual({
      lines: ["a", "b", "c", "d"],
      endings: ["\n", "\r\n", "\r", ""],
      bom: false,
      finalNewline: false,
      lineEndings: "mixed",
    });
  });

  it("does not start a line after the last line break", () => {
    expect(splitLines("a\n").lines).toEqual(["a"]);
    expect(splitLines("a\n\n").lines).toEqual(["a", ""]);
    expect(splitLines("\n").lines).toEqual([""]);
  });

  it("has no lines for an empty text, which counts as ending with a line break", () => {
    expect(splitLines("")).toEqual({ lines: [], endings: [], bom: false, finalNewline: true, lineEndings: "none" });
  });

  it("removes a BOM at the start, and only there", () => {
    const split = splitLines("\uFEFFa\n\uFEFFb");
    expect(split.bom).toBe(true);
    expect(split.lines).toEqual(["a", "\uFEFFb"]);
  });

  it("names the line endings of a side", () => {
    expect(splitLines("a\nb\n").lineEndings).toBe("lf");
    expect(splitLines("a\r\nb").lineEndings).toBe("crlf");
    expect(splitLines("a\rb\r").lineEndings).toBe("cr");
    expect(splitLines("a\r\nb\n").lineEndings).toBe("mixed");
    expect(splitLines("one line").lineEndings).toBe("none");
  });

  it("joins back to the text without its BOM", () => {
    for (const text of ["", "a", "a\r\n\r\nb\r", "\uFEFFx\ny", "\r\n\n\r"]) {
      const split = splitLines(text);
      expect(split.lines.map((line, i) => line + split.endings[i]).join("")).toBe(text.replace(/^\uFEFF/, ""));
    }
  });

  // A guard against quadratic work, not a benchmark: the limit leaves room for a busy machine.
  it("cuts a large text quickly", () => {
    const text = "some line of text\r\n".repeat(200_000);
    const started = performance.now();
    expect(splitLines(text).lines).toHaveLength(200_000);
    expect(performance.now() - started).toBeLessThan(3000);
  });
});

describe("dominantEnding", () => {
  it("is the ending most lines have, LF on a tie, null without any", () => {
    expect(dominantEnding(splitLines("a\r\nb\r\nc\n"))).toBe("\r\n");
    expect(dominantEnding(splitLines("a\r\nb\n"))).toBe("\n");
    expect(dominantEnding(splitLines("a\rb\r"))).toBe("\r");
    expect(dominantEnding(splitLines("a"))).toBeNull();
  });
});

describe("isBlank", () => {
  it("is true for empty and whitespace-only lines", () => {
    expect([isBlank(""), isBlank(" \t\u00A0"), isBlank(" a ")]).toEqual([true, true, false]);
  });
});

describe("normalizeLine", () => {
  it("ignores line endings by default", () => {
    expect(normalizeLine("a", "\r\n", {})).toBe(normalizeLine("a", "\n", {}));
    expect(normalizeLine("a", "", {})).toBe(normalizeLine("a", "\r", {}));
  });

  it("keeps line endings when asked", () => {
    const exact = { ignoreLineEndings: false };
    expect(normalizeLine("a", "\r\n", exact)).not.toBe(normalizeLine("a", "\n", exact));
    expect(normalizeLine("a", "", exact)).not.toBe(normalizeLine("a", "\n", exact));
  });

  it("drops every whitespace character, a line break too, as git diff -w", () => {
    const options = { ignoreWhitespace: true, ignoreLineEndings: false };
    expect(normalizeLine(" a\t b ", "\r\n", options)).toBe(normalizeLine("ab", "\n", options));
    expect(normalizeLine("a b", "\n", options)).not.toBe(normalizeLine("a c", "\n", options));
  });

  it("lowercases with Unicode rules", () => {
    expect(normalizeLine("ÄBC Straße", "\n", { ignoreCase: true })).toBe("äbc straße");
  });
});

describe("lineKeys", () => {
  it("gives equal lines of both sides the same number", () => {
    const [a, b] = lineKeys(splitLines("x\ny\nx\n"), splitLines("y\r\nz\n"), {});
    expect(Array.from(a)).toEqual([0, 1, 0]);
    expect(Array.from(b)).toEqual([1, 2]);
  });

  it("follows the options", () => {
    const [a, b] = lineKeys(splitLines("A  b\n"), splitLines("a b\n"), { ignoreCase: true, ignoreWhitespace: true });
    expect(a[0]).toBe(b[0]);
  });
});
