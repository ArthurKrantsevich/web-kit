// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ScanResult } from "../core/types";
import { resultsCsv, type ScanEntry } from "./useCodeScanner";

const entry = (text: string): ScanEntry => {
  const bytes = new TextEncoder().encode(text);
  const result = { symbology: "qr", text, bytes, confidence: 0.5 } as unknown as ScanResult;
  return { key: `qr:${text}`, result, count: 1, time: new Date("2026-10-07T10:00:00Z"), ms: 12 };
};
/** The text cell of the one row: what sits between the symbology and the bytes, line breaks included. */
const row = (text: string): string => {
  const csv = resultsCsv([entry(text)]);
  const body = csv.slice(csv.indexOf("\n") + 1, -1);
  return /^qr,([\s\S]*),[0-9a-f]*,2026-10-07T10:00:00\.000Z,0\.500$/.exec(body)![1]!;
};

describe("resultsCsv", () => {
  it("writes a header and one row per entry", () => {
    expect(resultsCsv([entry("one")])).toBe("symbology,text,bytes,time,confidence\nqr,one,6f6e65,2026-10-07T10:00:00.000Z,0.500\n");
  });

  it("quotes a text with a comma, a quote or a line break", () => {
    expect([row("a,b"), row('say "hi"'), row("two\nlines")]).toEqual(['"a,b"', '"say ""hi"""', '"two\nlines"']);
  });

  it("neutralizes a text a spreadsheet would run as a formula", () => {
    expect([row("=1+1"), row("+1"), row("-1"), row("@SUM(A1)"), row("\tx"), row("\rx")]).toEqual(["'=1+1", "'+1", "'-1", "'@SUM(A1)", "'\tx", '"\'\rx"']);
    expect(row("plain")).toBe("plain");
  });
});
