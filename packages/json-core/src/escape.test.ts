import { describe, expect, it } from "vitest";
import { escapeJson, unescapeJson } from "./escape";

describe("escapeJson", () => {
  it("turns any text into a JSON string literal", () => {
    expect(escapeJson('{"a":"x"}')).toBe('"{\\"a\\":\\"x\\"}"');
    expect(escapeJson("line\nbreak")).toBe('"line\\nbreak"');
  });

  it("round-trips through unescapeJson exactly", () => {
    for (const text of ['{"a":1}', 'say "hi" \\ é 😀\t\n', "", "\uD800 lone"]) {
      const result = unescapeJson(escapeJson(text));
      expect(result.ok && result.value.text).toBe(text);
    }
  });
});

describe("unescapeJson", () => {
  it("decodes a string that contains JSON", () => {
    expect(unescapeJson('"{\\"a\\":[1,2]}"')).toEqual({
      ok: true,
      value: { text: '{"a":[1,2]}', isJson: true, wrapped: false },
    });
  });

  it("decodes a string that is plain text", () => {
    expect(unescapeJson('"hello"')).toEqual({ ok: true, value: { text: "hello", isJson: false, wrapped: false } });
  });

  it("reads input without quotes only when it decodes to JSON", () => {
    expect(unescapeJson('{\\"a\\":1}')).toEqual({ ok: true, value: { text: '{"a":1}', isJson: true, wrapped: true } });
    const plain = unescapeJson('hello \\"x\\"');
    expect(plain.ok).toBe(false);
    if (!plain.ok) expect(plain.error).toMatchObject({ message: "Unescape needs a JSON string literal", line: 1, column: 1 });
  });

  it("does not treat non-JSON whitespace as removable", () => {
    const result = unescapeJson("\u00A0[1]");
    expect(result.ok).toBe(false);
  });

  it("asks for a string when the input is broken JSON that is not a string", () => {
    const result = unescapeJson('{"a":1,}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ message: "Unescape needs a JSON string literal", line: 1, column: 1 });
    const unterminated = unescapeJson('"abc');
    expect(!unterminated.ok && unterminated.error.message).toBe("Unterminated string");
  });

  it("explains that it needs a string", () => {
    const result = unescapeJson('  {"a":1}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ message: "Unescape needs a JSON string literal", offset: 2, line: 1, column: 3 });
  });
});
