import type { JsonError, JsonPath } from "@web-kit/json-core";

export interface DiffOptions {
  /** Match array items that are objects by this key instead of by index. Empty means by index. */
  arrayKey?: string;
  /** "value" (default): 1.0 equals 1. "raw": numbers must be spelled the same. */
  numbers?: "value" | "raw";
}

/** A value exactly as written, with its offsets in the text without a leading BOM (`end` is exclusive). */
export interface JsonSpan {
  raw: string;
  start: number;
  end: number;
}

export interface JsonChange {
  kind: "added" | "removed" | "changed";
  /** Array indexes are right-side indexes, except for removed items (left-side index). */
  path: JsonPath;
  /** Old value: set for removed and changed. */
  left?: JsonSpan;
  /** New value: set for added and changed. */
  right?: JsonSpan;
}

export interface JsonDiff {
  /** In document order. Empty when the documents are equal (keyed arrays ignore item order). */
  changes: JsonChange[];
  counts: { added: number; removed: number; changed: number };
  /** Arrays compared by key whose items were added, removed or reordered; JSON Patch replaces them whole. */
  wholeArrays: { path: JsonPath; right: JsonSpan }[];
}

export type DiffResult = { ok: true; value: JsonDiff } | { ok: false; side: "left" | "right"; error: JsonError };

/** RFC 6902 operation. `value` is JSON text, so numbers keep their exact spelling. */
export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  from?: string;
  value?: string;
}
