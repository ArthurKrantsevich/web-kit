import { describe, expect, it } from "vitest";
import { tokenizeJson } from "./tokens";

describe("tokenizeJson", () => {
  it("labels keys, values and punctuation", () => {
    expect(tokenizeJson('{"a": [1, true, "x"]}').map((token) => token.type)).toEqual([
      "punctuation",
      "key",
      "punctuation",
      "whitespace",
      "punctuation",
      "number",
      "punctuation",
      "whitespace",
      "literal",
      "punctuation",
      "whitespace",
      "string",
      "punctuation",
      "punctuation",
    ]);
  });

  it("treats a string followed by a colon as a key, even with spaces", () => {
    expect(tokenizeJson('{"a" : "b"}').map((token) => token.type)).toEqual([
      "punctuation",
      "key",
      "whitespace",
      "punctuation",
      "whitespace",
      "string",
      "punctuation",
    ]);
  });

  it("keeps escaped quotes inside one string token", () => {
    expect(tokenizeJson('["a\\"b"]')[1]).toEqual({ type: "string", start: 1, end: 7 });
  });

  it("covers the whole text without gaps", () => {
    const text = '{\n  "n": -1.5e3,\n  "s": "é 😀",\n  "z": null\n}';
    const tokens = tokenizeJson(text);
    expect(tokens.map((token) => text.slice(token.start, token.end)).join("")).toBe(text);
    tokens.forEach((token, index) => expect(token.start).toBe(index === 0 ? 0 : tokens[index - 1]!.end));
  });
});
