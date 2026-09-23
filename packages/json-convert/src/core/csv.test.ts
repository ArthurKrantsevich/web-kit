import { formatJson } from "@web-kit/json-core";
import { describe, expect, it } from "vitest";
import { fromCsv, toCsv } from "./csv";

const ok = (value: string) => ({ ok: true, value });

describe("toCsv", () => {
  it("writes a header from all keys in order of appearance", () => {
    expect(toCsv('[{"a":1,"b":"x"},{"a":2,"c":true}]')).toEqual(ok("a,b,c\r\n1,x,\r\n2,,true\r\n"));
  });

  it("flattens nested objects and writes arrays as JSON", () => {
    expect(toCsv('[{"id":1,"address":{"city":"Oslo","zip":"0150"},"tags":["a","b"],"meta":{}}]')).toEqual(
      ok('id,address.city,address.zip,tags,meta\r\n1,Oslo,0150,"[""a"",""b""]",{}\r\n'),
    );
  });

  it("quotes cells per RFC 4180", () => {
    expect(toCsv('[{"t":"a,b","q":"say \\"hi\\"","n":"line\\nbreak"}]')).toEqual(
      ok('t,q,n\r\n"a,b","say ""hi""","line\nbreak"\r\n'),
    );
  });

  it("supports other delimiters", () => {
    expect(toCsv('[{"a":"1,5","b":2}]', { delimiter: ";" })).toEqual(ok("a;b\r\n1,5;2\r\n"));
  });

  it("keeps numbers exact and writes null as an empty cell", () => {
    expect(toCsv('[{"n":12345678901234567890,"z":null}]')).toEqual(ok("n,z\r\n12345678901234567890,\r\n"));
  });

  it("keeps rows whose cells are all empty", () => {
    const json = '[{"a":1},{"a":null},{"a":""}]';
    expect(toCsv(json)).toEqual(ok('a\r\n1\r\n""\r\n""\r\n'));
    const back = toCsv(json);
    expect(back.ok && fromCsv(back.value)).toEqual(ok('[\n  {\n    "a": "1"\n  },\n  {\n    "a": ""\n  },\n  {\n    "a": ""\n  }\n]'));
  });

  it("refuses objects that have no fields at all", () => {
    expect(toCsv("[{}]")).toEqual({ ok: false, error: { message: "CSV needs at least one column; all objects are empty", path: "$" } });
  });

  it("explains what it needs", () => {
    expect(toCsv('{"a":1}')).toEqual({ ok: false, error: { message: "CSV needs an array of objects", path: "$" } });
    expect(toCsv('[{"a":1},2]')).toEqual({ ok: false, error: { message: "CSV needs an array of objects", path: "$[1]" } });
  });

  it("refuses two fields that map to the same column", () => {
    expect(toCsv('[{"a":{"b":1},"a.b":2}]')).toEqual({
      ok: false,
      error: { message: 'Two fields map to the CSV column "a.b"', path: '$[0]["a.b"]' },
    });
  });
});

describe("fromCsv", () => {
  it("reads rows as objects of strings", () => {
    expect(fromCsv('a,b\r\n1,x\r\n2,"y,z"\r\n')).toEqual(
      ok('[\n  {\n    "a": "1",\n    "b": "x"\n  },\n  {\n    "a": "2",\n    "b": "y,z"\n  }\n]'),
    );
  });

  it("detects only exact numbers and literals", () => {
    expect(fromCsv("n,b,z,s\n12345678901234567890,true,,01\n", { inferTypes: true })).toEqual(
      ok('[\n  {\n    "n": 12345678901234567890,\n    "b": true,\n    "z": null,\n    "s": "01"\n  }\n]'),
    );
  });

  it("handles quoted line breaks, doubled quotes, blank lines and a BOM", () => {
    expect(fromCsv('\uFEFFq\n"a ""b""\nc"\n\nd\n')).toEqual(ok('[\n  {\n    "q": "a \\"b\\"\\nc"\n  },\n  {\n    "q": "d"\n  }\n]'));
  });

  it("reports problems with the line number", () => {
    expect(fromCsv("")).toEqual({ ok: false, error: { message: "CSV is empty", line: 1 } });
    expect(fromCsv("a,b\n1\n")).toEqual({ ok: false, error: { message: "Row has 1 field, expected 2", line: 2 } });
    expect(fromCsv('a\n"x')).toEqual({ ok: false, error: { message: "Unterminated quoted field", line: 2 } });
    expect(fromCsv('a\nx"y\n')).toEqual({ ok: false, error: { message: "Unexpected quote inside an unquoted field", line: 2 } });
    expect(fromCsv('a\n"x"y\n')).toEqual({ ok: false, error: { message: "Unexpected character after a closing quote", line: 2 } });
    expect(fromCsv("a,a\n1,2")).toEqual({ ok: false, error: { message: 'Duplicate column name "a"', line: 1 } });
    expect(fromCsv('a\r"x\ry"\r"b')).toEqual({ ok: false, error: { message: "Unterminated quoted field", line: 4 } });
  });

  it("round-trips flat JSON through toCsv", () => {
    const json = '[{"a":1,"b":"x, \\"y\\"","c":true,"d":null},{"a":-2.5e3,"b":"line\\nbreak","c":false,"d":null}]';
    const csv = toCsv(json);
    expect(csv.ok).toBe(true);
    if (csv.ok) expect(fromCsv(csv.value, { inferTypes: true })).toEqual(formatJson(json));
  });
});
