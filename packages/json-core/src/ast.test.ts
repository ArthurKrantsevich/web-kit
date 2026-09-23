import { describe, expect, it } from "vitest";
import type { JsonNode } from "./types";
import { parseJson, validateJson } from "./validate";

function parsed(input: string): JsonNode {
  const result = parseJson(input);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("parseJson", () => {
  it("keeps positions and original spelling", () => {
    expect(parsed('{"a": [1, "x"]}')).toEqual({
      type: "object",
      start: 0,
      end: 15,
      members: [
        {
          key: { type: "string", start: 1, end: 4, raw: '"a"', value: "a" },
          value: {
            type: "array",
            start: 6,
            end: 14,
            items: [
              { type: "number", start: 7, end: 8, raw: "1" },
              { type: "string", start: 10, end: 13, raw: '"x"', value: "x" },
            ],
          },
        },
      ],
    });
  });

  it("never rounds numbers", () => {
    expect(parsed("12345678901234567890")).toEqual({ type: "number", start: 0, end: 20, raw: "12345678901234567890" });
  });

  it("decodes string values and keeps the raw text", () => {
    expect(parsed('"\\u00e9\\n"')).toEqual({ type: "string", start: 0, end: 10, raw: '"\\u00e9\\n"', value: "é\n" });
  });

  it("parses literals", () => {
    const root = parsed("[true,false,null]");
    expect(root.type === "array" && root.items).toEqual([
      { type: "boolean", start: 1, end: 5, value: true },
      { type: "boolean", start: 6, end: 11, value: false },
      { type: "null", start: 12, end: 16 },
    ]);
  });

  it("keeps duplicate keys in order", () => {
    const root = parsed('{"a":1,"a":2}');
    expect(root.type === "object" && root.members.map((m) => [m.key.value, m.value.type === "number" && m.value.raw])).toEqual([
      ["a", "1"],
      ["a", "2"],
    ]);
  });

  it("reports exactly the same errors as validateJson", () => {
    for (const input of ['{"a": }', "[1,2", '"abc', "[".repeat(600), "", "[1] x"]) {
      expect(parseJson(input)).toEqual({ ok: false, error: validateJson(input) });
    }
  });

  it("uses offsets in the text without a BOM", () => {
    const root = parsed("﻿[1]");
    expect(root.type === "array" && root.items[0]).toEqual({ type: "number", start: 1, end: 2, raw: "1" });
  });
});
