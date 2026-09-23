import { describe, expect, it } from "vitest";
import { toXml, xmlName } from "./xml";

function wellFormed(xml: string): boolean {
  return new DOMParser().parseFromString(xml, "application/xml").getElementsByTagName("parsererror").length === 0;
}

describe("toXml", () => {
  it("writes elements, items and escaped text", () => {
    const result = toXml('{"name":"Ann & <Bob>","tags":["a","b"],"age":31,"ok":true,"none":null,"empty":{},"n":12345678901234567890}');
    expect(result).toEqual({
      ok: true,
      value: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<root>",
        "  <name>Ann &amp; &lt;Bob&gt;</name>",
        "  <tags>",
        "    <item>a</item>",
        "    <item>b</item>",
        "  </tags>",
        "  <age>31</age>",
        "  <ok>true</ok>",
        "  <none/>",
        "  <empty/>",
        "  <n>12345678901234567890</n>",
        "</root>",
        "",
      ].join("\n"),
    });
    if (result.ok) expect(wellFormed(result.value)).toBe(true);
  });

  it("turns any key into a valid element name", () => {
    expect(["1st", "a b", "xmlns", "", "é", "a-b.c"].map(xmlName)).toEqual(["_1st", "a_b", "_xmlns", "_", "é", "a-b.c"]);
    const result = toXml('{"1st":1,"a b":2,"xmlns":3,"":4,"é":5}');
    expect(result.ok && wellFormed(result.value)).toBe(true);
  });

  it("uses the root name and wraps arrays in items", () => {
    expect(toXml("[1,2]", { rootName: "list" })).toEqual({
      ok: true,
      value: '<?xml version="1.0" encoding="UTF-8"?>\n<list>\n  <item>1</item>\n  <item>2</item>\n</list>\n',
    });
    expect(toXml('"x"')).toEqual({ ok: true, value: '<?xml version="1.0" encoding="UTF-8"?>\n<root>x</root>\n' });
  });

  it("rejects an invalid root name", () => {
    expect(toXml("1", { rootName: "1root" })).toEqual({ ok: false, error: { message: '"1root" is not a valid XML element name' } });
  });

  it("refuses characters XML 1.0 cannot hold", () => {
    expect(toXml('{"a":"x\\u0001"}')).toEqual({
      ok: false,
      error: { message: "XML 1.0 cannot contain the character U+0001", path: "$.a" },
    });
  });
});
