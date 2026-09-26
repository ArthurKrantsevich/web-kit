import { parseJson, type JsonNode } from "@web-kit/json-core";
import { describe, expect, it } from "vitest";
import { codePoints, locator, pointerToken, valueKey } from "./text";

function node(text: string): JsonNode {
  const parsed = parseJson(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

describe("codePoints", () => {
  it("counts a surrogate pair once", () => {
    expect(codePoints("a😀b")).toBe(3);
    expect(codePoints("a😀b", 1, 3)).toBe(1);
    expect(codePoints("")).toBe(0);
  });
});

describe("locator", () => {
  it("gives 1-based lines and code-point columns, in any order", () => {
    const at = locator('{\n  "😀": 1,\n  "b": 2\n}');
    expect(at(10, 11)).toEqual({ offset: 10, end: 11, line: 2, column: 8 });
    expect(at(0, 1)).toEqual({ offset: 0, end: 1, line: 1, column: 1 });
    expect(at(20, 21)).toEqual({ offset: 20, end: 21, line: 3, column: 8 });
    expect(at(11, 12)).toEqual({ offset: 11, end: 12, line: 2, column: 9 });
  });
});

describe("pointerToken", () => {
  it("escapes ~ and / per RFC 6901", () => {
    expect(pointerToken("a/b~c")).toBe("a~1b~0c");
    expect(pointerToken(3)).toBe("3");
  });
});

describe("valueKey", () => {
  it("is equal for values JSON Schema calls equal", () => {
    expect(valueKey(node("1"))).toBe(valueKey(node("1.0")));
    expect(valueKey(node("100"))).toBe(valueKey(node("1e2")));
    expect(valueKey(node("0"))).toBe(valueKey(node("-0.0")));
    expect(valueKey(node('"\\u0041"'))).toBe(valueKey(node('"A"')));
    expect(valueKey(node('{"a":1,"b":[2]}'))).toBe(valueKey(node('{"b":[2.0],"a":1}')));
    expect(valueKey(node('{"a":1,"a":2}'))).toBe(valueKey(node('{"a":2}')));
  });

  it("differs for values that are not equal", () => {
    expect(valueKey(node("12345678901234567890"))).not.toBe(valueKey(node("12345678901234567891")));
    expect(valueKey(node("1"))).not.toBe(valueKey(node('"1"')));
    expect(valueKey(node("0"))).not.toBe(valueKey(node("false")));
    expect(valueKey(node("null"))).not.toBe(valueKey(node("false")));
    expect(valueKey(node("[1,2]"))).not.toBe(valueKey(node("[2,1]")));
    expect(valueKey(node('["a,b"]'))).not.toBe(valueKey(node('["a","b"]')));
  });
});
