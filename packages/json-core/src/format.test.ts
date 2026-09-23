import { describe, expect, it } from "vitest";
import { formatJson, minifyJson } from "./format";

function ok(result: ReturnType<typeof formatJson>): string {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("formatJson", () => {
  it("pretty-prints with 2 spaces by default", () => {
    expect(ok(formatJson('{"a":[1,2],"b":{}}'))).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {}\n}');
  });

  it("supports 4 spaces and tabs", () => {
    expect(ok(formatJson('{"a":1}', { indent: 4 }))).toBe('{\n    "a": 1\n}');
    expect(ok(formatJson('{"a":1}', { indent: "\t" }))).toBe('{\n\t"a": 1\n}');
  });

  it("keeps empty containers on one line, even with inner whitespace", () => {
    expect(ok(formatJson('{ "a": [ ], "b": { } }'))).toBe('{\n  "a": [],\n  "b": {}\n}');
  });

  it("formats top-level scalars", () => {
    expect(ok(formatJson(" 42 "))).toBe("42");
    expect(ok(formatJson('"x"'))).toBe('"x"');
  });

  it("keeps numbers exactly as written", () => {
    expect(ok(formatJson('{"n":12345678901234567890,"f":1.0,"e":1E+2}'))).toBe(
      '{\n  "n": 12345678901234567890,\n  "f": 1.0,\n  "e": 1E+2\n}',
    );
  });

  it("copies strings byte-for-byte", () => {
    const input = '{"a b":"x \\" , : { [ y","e":"\\u00e9 😀"}';
    expect(ok(minifyJson(input))).toBe(input);
    expect(ok(formatJson(input))).toBe('{\n  "a b": "x \\" , : { [ y",\n  "e": "\\u00e9 😀"\n}');
  });

  it("keeps duplicate keys and key order", () => {
    expect(ok(minifyJson('{"b":1,"a":2,"b":3}'))).toBe('{"b":1,"a":2,"b":3}');
  });

  it("accepts a BOM and Windows line endings", () => {
    expect(ok(formatJson('﻿{\r\n"a":1\r\n}'))).toBe('{\n  "a": 1\n}');
  });

  it("returns the error for invalid input", () => {
    const result = formatJson('{"a": }');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ line: 1, column: 7 });
  });
});

describe("minifyJson", () => {
  it("removes insignificant whitespace", () => {
    expect(ok(minifyJson('{\n  "a" : [ 1 , 2 ],\n  "b": { }\n}'))).toBe('{"a":[1,2],"b":{}}');
  });
});
