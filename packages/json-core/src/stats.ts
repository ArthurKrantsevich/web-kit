import type { JsonNode } from "./types";

export interface JsonStats {
  /** UTF-8 size of the input. */
  bytes: number;
  /** Object keys, counting duplicates. */
  keys: number;
  /** Nesting depth of objects and arrays; 0 for a scalar root. */
  depth: number;
  /** Value nodes by type (keys are not counted as strings). */
  counts: Record<JsonNode["type"], number>;
  longestArray: number;
}

export function getStats(root: JsonNode, input: string): JsonStats {
  const counts: Record<JsonNode["type"], number> = { object: 0, array: 0, string: 0, number: 0, boolean: 0, null: 0 };
  let keys = 0;
  let depth = 0;
  let longestArray = 0;

  const visit = (node: JsonNode, level: number): void => {
    counts[node.type]++;
    if (node.type === "object") {
      keys += node.members.length;
      depth = Math.max(depth, level);
      for (const member of node.members) visit(member.value, level + 1);
    } else if (node.type === "array") {
      longestArray = Math.max(longestArray, node.items.length);
      depth = Math.max(depth, level);
      for (const item of node.items) visit(item, level + 1);
    }
  };

  visit(root, 1);
  return { bytes: utf8Length(input), keys, depth, counts, longestArray };
}

/** UTF-8 byte length; a lone surrogate counts as 3 bytes, like TextEncoder's replacement character. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}
