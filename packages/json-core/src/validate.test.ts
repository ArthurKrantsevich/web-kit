import { describe, expect, it } from "vitest";
import { validateJson } from "./validate";

function errorAt(input: string) {
  const error = validateJson(input);
  if (!error) throw new Error("expected an error");
  return { message: error.message, line: error.line, column: error.column };
}

describe("validateJson", () => {
  it("returns null for valid JSON", () => {
    for (const input of ['{"a":[1,2,{"b":null}]}', " 42 ", '"x"', "[]", "{}", "-0.5e+10", "true"]) {
      expect(validateJson(input)).toBeNull();
    }
  });

  it("reports an unexpected character with its position", () => {
    expect(errorAt('{"a": }')).toEqual({ message: "Unexpected character '}'", line: 1, column: 7 });
  });

  it("reports a trailing comma in an object", () => {
    expect(errorAt('{"a":1,}')).toEqual({ message: "Expected a double-quoted property name", line: 1, column: 8 });
  });

  it("reports unexpected end of input", () => {
    expect(errorAt("[1,2")).toEqual({ message: "Unexpected end of input", line: 1, column: 5 });
    expect(errorAt("")).toEqual({ message: "Unexpected end of input", line: 1, column: 1 });
    expect(errorAt("   ")).toEqual({ message: "Unexpected end of input", line: 1, column: 4 });
  });

  it("counts lines and columns across newlines", () => {
    expect(errorAt('{\n  "a": 1\n  "b": 2\n}')).toEqual({
      message: "Expected ',' or '}' after property value",
      line: 3,
      column: 3,
    });
  });

  it("rejects bad strings", () => {
    expect(errorAt('"a\\x"')).toEqual({ message: "Invalid escape sequence", line: 1, column: 3 });
    expect(errorAt('"\\u12G4"')).toEqual({ message: "Invalid unicode escape", line: 1, column: 2 });
    expect(errorAt('"line\nbreak"')).toEqual({ message: "Control character in string", line: 1, column: 6 });
    expect(errorAt('"abc')).toEqual({ message: "Unterminated string", line: 1, column: 5 });
  });

  it("rejects bad numbers and literals", () => {
    expect(errorAt("-")).toEqual({ message: "Invalid number", line: 1, column: 1 });
    expect(errorAt("01")).toEqual({ message: "Unexpected character after JSON value", line: 1, column: 2 });
    expect(errorAt("tru")).toEqual({ message: "Unexpected character 't'", line: 1, column: 1 });
  });

  it("rejects content after the value", () => {
    expect(errorAt("[1] x")).toEqual({ message: "Unexpected character after JSON value", line: 1, column: 5 });
  });

  it("stops on very deep nesting instead of overflowing the stack", () => {
    expect(errorAt("[".repeat(10_000)).message).toBe("Nesting too deep");
  });

  it("ignores a leading BOM", () => {
    expect(validateJson("﻿{}")).toBeNull();
  });

  it("counts columns in characters, not UTF-16 units", () => {
    expect(validateJson('["😀", x]')).toEqual({ message: "Unexpected character 'x'", offset: 7, line: 1, column: 7 });
  });

  it("names a whole emoji in the message, not half of it", () => {
    expect(validateJson("[😀]")).toEqual({ message: "Unexpected character '😀'", offset: 1, line: 1, column: 2 });
  });
});
