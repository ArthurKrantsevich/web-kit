import { describe, expect, it } from "vitest";
import { codeFrame } from "./frame";
import { validateJson } from "./validate";

function frameFor(input: string): string {
  const error = validateJson(input);
  if (!error) throw new Error("expected an error");
  return codeFrame(input, error);
}

describe("codeFrame", () => {
  it("shows the lines around the error with a caret", () => {
    expect(frameFor('{\n  "a": 1\n  "b": 2\n}')).toBe(
      ["  1 | {", '  2 |   "a": 1', '> 3 |   "b": 2', "    |   ^", "  4 | }"].join("\n"),
    );
  });

  it("keeps tabs so the caret lines up", () => {
    expect(frameFor('{\n\t"a" 1\n}')).toBe(["  1 | {", '> 2 | \t"a" 1', "    | \t    ^", "  3 | }"].join("\n"));
  });

  it("pads line numbers to the same width", () => {
    const input = "[\n" + "1,\n".repeat(9) + "1 2\n]";
    expect(frameFor(input)).toBe(["   9 | 1,", "  10 | 1,", "> 11 | 1 2", "     |   ^", "  12 | ]"].join("\n"));
  });

  it("cuts very long lines to a window around the error", () => {
    const [line, caret] = frameFor("[" + "1,".repeat(100) + "x]").split("\n");
    expect(line!.length).toBeLessThanOrEqual(89);
    expect(line).toContain("…");
    expect(caret!.indexOf("^")).toBe(line!.indexOf("x"));
  });

  it("puts the caret under the right character after an emoji", () => {
    expect(frameFor('["😀", x]')).toBe('> 1 | ["😀", x]\n    |       ^');
  });

  it("never splits an emoji at the edge of the window", () => {
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    for (const prefix of ["", "a"]) {
      expect(lone.test(frameFor(`["${prefix}${"😀".repeat(100)}", x]`))).toBe(false);
    }
  });
});
