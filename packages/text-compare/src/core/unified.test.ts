import { describe, expect, it } from "vitest";
import { compareTexts } from "./compare";
import { editText, random, randomText } from "./seeded";
import { toUnifiedDiff } from "./unified";

const exact = { ignoreLineEndings: false };
const patch = (left: string, right: string, options = {}, names = {}) =>
  toUnifiedDiff(left, right, compareTexts(left, right, options), names);

/**
 * Applies a unified diff the way `patch` does, strictly: context and removed lines must match the old text. Returns
 * the new text. Only for these tests (lines end with LF or CRLF).
 */
function applyPatch(old: string, diff: string): string {
  if (diff === "") return old;
  const source = old.split(/(?<=\n)/);
  const lines = diff.split(/(?<=\n)/);
  const out: string[] = [];
  let at = 0;
  let k = 2;
  while (k < lines.length) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@\n$/.exec(lines[k]!);
    if (!header) throw new Error(`bad hunk header: ${lines[k]}`);
    const start = Number(header[1]) - (header[2] === "0" ? 0 : 1);
    while (at < start) out.push(source[at++]!);
    k++;
    while (k < lines.length && !lines[k]!.startsWith("@@")) {
      const line = lines[k]!;
      const next = lines[k + 1];
      // "\ No newline at end of file" drops the line break of the line before it.
      const text = next?.startsWith("\\ ") ? line.slice(1).replace(/\r?\n$/, "") : line.slice(1);
      if (line[0] === " " || line[0] === "-") {
        if (source[at] !== text) throw new Error(`context does not match at line ${at + 1}: ${JSON.stringify(source[at])} ≠ ${JSON.stringify(text)}`);
        at++;
      }
      if (line[0] === " " || line[0] === "+") out.push(text);
      k += next?.startsWith("\\ ") ? 2 : 1;
    }
  }
  while (at < source.length) out.push(source[at++]!);
  return out.join("");
}

describe("toUnifiedDiff", () => {
  it("writes headers and one hunk per group of changes", () => {
    expect(patch("a\nb\nc\n", "a\nB\nc\n")).toBe("--- left\n+++ right\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n");
  });

  it("uses the given names and context", () => {
    expect(patch("a\nb\nc\n", "a\nB\nc\n", {}, { leftName: "old.txt", rightName: "new.txt", context: 0 })).toBe(
      "--- old.txt\n+++ new.txt\n@@ -2 +2 @@\n-b\n+B\n",
    );
  });

  it("ends a name with spaces with a tab, as git does, and drops control characters from names", () => {
    expect(patch("a\n", "b\n", {}, { leftName: "my old.txt", rightName: "new\r\n+++ evil\u0007.txt" })).toBe(
      "--- my old.txt\t\n+++ new+++ evil.txt\t\n@@ -1 +1 @@\n-a\n+b\n",
    );
  });

  it("is empty when nothing changed", () => {
    expect(patch("a\n", "a\n")).toBe("");
    expect(patch("", "")).toBe("");
  });

  it("numbers an empty side as the line before it", () => {
    expect(patch("", "a\n")).toBe("--- left\n+++ right\n@@ -0,0 +1 @@\n+a\n");
    expect(patch("a\nb\n", "a\nb\nc\n", {}, { context: 0 })).toBe("--- left\n+++ right\n@@ -2,0 +3 @@\n+c\n");
  });

  it("says when a last line has no line break", () => {
    expect(patch("a\nb", "a\nc\n", exact)).toBe(
      "--- left\n+++ right\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n",
    );
  });

  it("keeps CRLF endings and writes others as LF", () => {
    expect(patch("a\r\nb\r\n", "a\r\nc\r\n", exact)).toBe("--- left\n+++ right\n@@ -1,2 +1,2 @@\n a\r\n-b\r\n+c\r\n");
  });

  it("prints context lines from the left side, so the patch applies to the left file", () => {
    expect(patch("x  y\nold\n", "x y\nnew\n", { ignoreWhitespace: true })).toBe("--- left\n+++ right\n@@ -1,2 +1,2 @@\n x  y\n-old\n+new\n");
  });

  it("applies to a CRLF left file when the right one has LF, with the default options", () => {
    const left = "a\r\nb\r\nc\r\n";
    const right = "a\nB\nc\n";
    const diff = patch(left, right, {});
    expect(diff).toBe("--- left\n+++ right\n@@ -1,3 +1,3 @@\n a\r\n-b\r\n+B\n c\r\n");
    expect(applyPatch(left, diff)).toBe("a\r\nB\nc\r\n");
  });

  it("does not glue lines onto a context line without a line break when the right side goes on", () => {
    const diff = patch("x\na", "x\na\nb\n", {});
    expect(applyPatch("x\na", diff)).toBe("x\na\nb\n");
  });

  it("gives a patch that turns the left text into the right one, on random texts (seeded)", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const next = random(seed);
      // patch and git apply read LF and CRLF files; a lone CR is not a line break for them.
      const left = randomText(next, 40).replace(/^\uFEFF/, "").replace(/\r(?!\n)/g, "\n");
      const right = (next() < 0.75 ? editText(next, left) : randomText(next, 40)).replace(/^\uFEFF/, "").replace(/\r(?!\n)/g, "\n");
      const context = Math.floor(next() * 4);
      const diff = toUnifiedDiff(left, right, compareTexts(left, right, exact), { context });
      expect([seed, applyPatch(left, diff)]).toEqual([seed, right]);
    }
  });

  // Every combination of the four ignore options: the patch always applies to Left, and the text it gives equals
  // Right under the same options (exactly Right when nothing is ignored).
  const COMBINATIONS = Array.from({ length: 16 }, (_, bits) => ({
    ignoreWhitespace: (bits & 1) !== 0,
    ignoreCase: (bits & 2) !== 0,
    ignoreBlankLines: (bits & 4) !== 0,
    ignoreLineEndings: (bits & 8) !== 0,
  }));
  for (const options of COMBINATIONS) {
    const on = Object.entries(options).filter(([, value]) => value).map(([key]) => key);
    it(`applies to Left with ${on.length === 0 ? "nothing ignored" : on.join(", ")}, on random texts (seeded)`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const next = random(seed);
        const left = randomText(next, 30).replace(/^\uFEFF/, "").replace(/\r(?!\n)/g, "\n");
        const right = (next() < 0.75 ? editText(next, left) : randomText(next, 30)).replace(/^\uFEFF/, "").replace(/\r(?!\n)/g, "\n");
        const diff = toUnifiedDiff(left, right, compareTexts(left, right, options));
        let applied: string;
        try {
          applied = applyPatch(left, diff);
        } catch (error) {
          throw new Error(`seed ${seed}: ${(error as Error).message}`);
        }
        if (on.length === 0) expect([seed, applied]).toEqual([seed, right]);
        else expect([seed, compareTexts(applied, right, options).blocks.filter((block) => block.kind === "change").length]).toEqual([seed, 0]);
      }
    });
  }
});
