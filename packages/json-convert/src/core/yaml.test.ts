import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { toYaml } from "./yaml";

const CASES = [
  '{"a":1,"b":[1,2,{"c":null}],"d":{}}',
  "[]",
  '"yes"',
  '{"true":"no","k: v":"# not a comment","":" padded ","multi":"line\\nbreak","num":"1e3","date":"2024-01-01","emoji":"😀","dash":"- x","nested":[[1,2],[]],"tab":"a\\tb","tilde":"~","quote":"\\"q\\""}',
  '[{"a":[{"b":1}]},[[]]]',
  '"\\u2028 \\u007f \\ufeff \\u0085"',
  "0.5",
  "true",
  "null",
];

describe("toYaml", () => {
  it.each(CASES)("round-trips %s through a YAML parser", (input) => {
    const result = toYaml(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(parse(result.value)).toEqual(JSON.parse(input));
  });

  it("writes readable block YAML", () => {
    expect(toYaml('{"a":1,"list":[1,{"b":2,"c":[3]}],"e":{}}')).toEqual({
      ok: true,
      value: "a: 1\nlist:\n  - 1\n  - b: 2\n    c:\n      - 3\ne: {}\n",
    });
  });

  it("keeps big numbers exactly", () => {
    expect(toYaml('{"num":12345678901234567890}')).toEqual({ ok: true, value: "num: 12345678901234567890\n" });
    expect(toYaml('{"n":1}')).toEqual({ ok: true, value: '"n": 1\n' });
  });

  it("refuses duplicate keys", () => {
    expect(toYaml('{"a":1,"a":2}')).toEqual({ ok: false, error: { message: 'YAML does not allow duplicate key "a"', path: "$.a" } });
  });

  it("reports JSON syntax errors with their position", () => {
    expect(toYaml('{"a":}')).toEqual({ ok: false, error: { message: "Unexpected character '}'", line: 1, column: 6 } });
  });
});
