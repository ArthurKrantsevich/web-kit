import type { JsonNode } from "@web-kit/json-core";
import type { TextRange } from "./types";

/** Number of code points in `text[from..to)`; a surrogate pair counts once. */
export function codePoints(text: string, from: number = 0, to: number = text.length): number {
  let count = 0;
  for (let i = from; i < to; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < to) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    count++;
  }
  return count;
}

/** Turns offsets into ranges with line and column. Line starts are found once; offsets asked in increasing order on one line are cheap. */
export function locator(text: string): (offset: number, end: number) => TextRange {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  let lastLine = -1;
  let lastOffset = 0;
  let lastColumn = 1;
  return (offset, end) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid]! <= offset) low = mid;
      else high = mid - 1;
    }
    const column =
      low === lastLine && offset >= lastOffset
        ? lastColumn + codePoints(text, lastOffset, offset)
        : 1 + codePoints(text, starts[low]!, offset);
    lastLine = low;
    lastOffset = offset;
    lastColumn = column;
    return { offset, end, line: low + 1, column };
  };
}

/** RFC 6901: "~" → "~0", "/" → "~1". */
export function pointerToken(token: string | number): string {
  return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

const NUMBER = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** One spelling per numeric value: "1", "1.0" and "10e-1" all give "1e0"; "-0" gives "0". */
function canonicalNumber(raw: string): string {
  const match = NUMBER.exec(raw);
  if (!match) throw new TypeError(`Not a JSON number: ${raw}`);
  const fraction = match[3] ?? "";
  const digits = (match[2]! + fraction).replace(/^0+/, "");
  if (digits === "") return "0";
  const trimmed = digits.replace(/0+$/, "");
  const exp = BigInt(match[4] ?? "0") - BigInt(fraction.length) + BigInt(digits.length - trimmed.length);
  return `${match[1]}${trimmed}e${exp}`;
}

/**
 * A text that is the same for two values exactly when JSON Schema calls them equal:
 * numbers by value (1.0 = 1), strings by decoded value, objects regardless of key order
 * (the last duplicate key wins), arrays item by item.
 */
export function valueKey(node: JsonNode): string {
  switch (node.type) {
    case "number":
      return `n${canonicalNumber(node.raw)}`;
    case "string":
      return JSON.stringify(node.value);
    case "boolean":
      return node.value ? "t" : "f";
    case "null":
      return "z";
    case "array":
      return `[${node.items.map(valueKey).join(",")}]`;
    case "object": {
      const members = new Map<string, JsonNode>();
      for (const member of node.members) members.set(member.key.value, member.value);
      const keys = [...members.keys()].sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${valueKey(members.get(key)!)}`).join(",")}}`;
    }
  }
}
