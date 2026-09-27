import { describe, expect, it } from "vitest";
import { toCsv } from "../core/csv";
import { toTypeScript } from "../core/typescript";
import { toXml } from "../core/xml";
import { toYaml } from "../core/yaml";
import { convert, DEFAULT_OPTIONS, type ConvertTarget } from "./convert";
import { toLines, tokenizeCsv, tokenizeOutput, tokenizeTypeScript, tokenizeXml, tokenizeYaml, type Token } from "./highlight";

const value = (result: { ok: boolean; value?: string }) => {
  if (!result.ok || result.value === undefined) throw new Error("fixture did not convert");
  return result.value;
};

/** [type, text] pairs without the plain whitespace, for readable expectations. */
const shown = (tokens: Token[]) => tokens.filter((token) => token.type !== null || token.text.trim() !== "").map((token) => [token.type, token.text]);

const INPUTS = [
  '{"name":"Ann","age":31,"tags":["a","b"],"address":{"city":"Oslo"},"empty":{},"none":[],"ok":true,"n":null}',
  '[{"id":1,"note":"a: b","quote":"say \\"hi\\"","multi":"line\\nbreak","emoji":"😀"},{"id":2.50,"note":"# hash","x":-1e3}]',
  '{"true":"yes","123":"no","key: colon":1,"a\\"b":[[1,[2]],{}],"":"blank"}',
  `{"${"k".repeat(1100)}":1}`,
  '"just a string"',
  "[]",
];

describe("tokenizers", () => {
  it("cover every output exactly, so the highlighted text is the text", () => {
    const targets: ConvertTarget[] = ["yaml", "csv", "xml", "typescript"];
    for (const input of INPUTS) {
      for (const target of targets) {
        const result = convert(input, target, DEFAULT_OPTIONS);
        if (!result.ok) continue;
        const tokens = tokenizeOutput(result.value, target, ",");
        expect([input, target, tokens.map((token) => token.text).join("")]).toEqual([input, target, result.value]);
        expect(toLines(tokens).map((line) => line.map((token) => token.text).join("")).join("\n")).toBe(result.value);
      }
    }
    const csv = "a,b\r\n\"x,\"\"y\"\"\r\nz\",2\r\n";
    const json = value(convert(csv, "csv-to-json", DEFAULT_OPTIONS));
    expect(tokenizeOutput(json, "csv-to-json", ",").map((token) => token.text).join("")).toBe(json);
  });

  it("YAML: keys, punctuation, quoted strings, numbers, literals and empty collections", () => {
    const yaml = value(toYaml('{"name":"Ann","age":31,"tags":["a",true],"key: x":null,"e":{}}'));
    expect(shown(tokenizeYaml(yaml))).toEqual([
      ["key", "name"], ["punctuation", ":"], ["string", "Ann"],
      ["key", "age"], ["punctuation", ":"], ["number", "31"],
      ["key", "tags"], ["punctuation", ":"],
      ["punctuation", "-"], ["string", "a"],
      ["punctuation", "-"], ["literal", "true"],
      ["key", '"key: x"'], ["punctuation", ":"], ["literal", "null"],
      ["key", "e"], ["punctuation", ":"], ["punctuation", "{}"],
    ]);
  });

  it("YAML: a quoted value that holds a colon stays one string, and long keys use ? and :", () => {
    expect(shown(tokenizeYaml(value(toYaml('["a: b"]'))))).toEqual([["punctuation", "-"], ["string", '"a: b"']]);
    const long = "k".repeat(1100);
    expect(shown(tokenizeYaml(value(toYaml(`{"${long}":1}`))))).toEqual([
      ["punctuation", "?"], ["key", long], ["punctuation", ":"], ["number", "1"],
    ]);
  });

  it("CSV: header cells are keys, quoted cells stay whole across line breaks", () => {
    const csv = value(toCsv('[{"id":1,"note":"a,\\nb","ok":true}]'));
    expect(shown(tokenizeCsv(csv, ","))).toEqual([
      ["key", "id"], ["punctuation", ","], ["key", "note"], ["punctuation", ","], ["key", "ok"],
      ["number", "1"], ["punctuation", ","], ["string", '"a,\nb"'], ["punctuation", ","], ["literal", "true"],
    ]);
    expect(shown(tokenizeCsv("a;b\r\nx;y\r\n", ";"))).toEqual([
      ["key", "a"], ["punctuation", ";"], ["key", "b"], [null, "x"], ["punctuation", ";"], [null, "y"],
    ]);
  });

  it("XML: the declaration, tag names, text and entities", () => {
    const xml = value(toXml('{"a":"x & y","n":2,"e":null}'));
    expect(shown(tokenizeXml(xml))).toEqual([
      ["punctuation", '<?xml version="1.0" encoding="UTF-8"?>'],
      ["punctuation", "<"], ["key", "root"], ["punctuation", ">"],
      ["punctuation", "<"], ["key", "a"], ["punctuation", ">"],
      ["string", "x "], ["literal", "&amp;"], ["string", " y"],
      ["punctuation", "</"], ["key", "a"], ["punctuation", ">"],
      ["punctuation", "<"], ["key", "n"], ["punctuation", ">"], ["number", "2"],
      ["punctuation", "</"], ["key", "n"], ["punctuation", ">"],
      ["punctuation", "<"], ["key", "e"], ["punctuation", "/>"],
      ["punctuation", "</"], ["key", "root"], ["punctuation", ">"],
    ]);
  });

  it("TypeScript: keywords, type names, plain and quoted property names", () => {
    const ts = value(toTypeScript('{"id":1,"full name":"x","tags":["a"],"n":null}'));
    expect(shown(tokenizeTypeScript(ts))).toEqual([
      ["literal", "export"], ["literal", "interface"], ["number", "Root"], ["punctuation", "{"],
      ["key", "id"], ["punctuation", ":"], ["number", "number"], ["punctuation", ";"],
      ["key", '"full name"'], ["punctuation", ":"], ["number", "string"], ["punctuation", ";"],
      ["key", "tags"], ["punctuation", ":"], ["number", "string"], ["punctuation", "["], ["punctuation", "]"], ["punctuation", ";"],
      ["key", "n"], ["punctuation", ":"], ["number", "null"], ["punctuation", ";"],
      ["punctuation", "}"],
    ]);
    expect(shown(tokenizeTypeScript("  a?: string;"))).toEqual([["key", "a"], ["punctuation", "?"], ["punctuation", ":"], ["number", "string"], ["punctuation", ";"]]);
  });
});
