import {
  compareNumbers,
  formatPath,
  parseJson,
  stripBom,
  type JsonError,
  type JsonNode,
  type JsonPath,
} from "@web-kit/json-core";
import type { DiffOptions, DiffResult, JsonChange, JsonDiff, JsonSpan } from "./types";

type Side = "left" | "right";
type ObjectNode = Extract<JsonNode, { type: "object" }>;
type ArrayNode = Extract<JsonNode, { type: "array" }>;

interface Context {
  left: string;
  right: string;
  numbers: "value" | "raw";
  arrayKey: string | undefined;
  changes: JsonChange[];
  wholeArrays: JsonDiff["wholeArrays"];
}

class KeyError extends Error {
  constructor(
    readonly side: Side,
    readonly offset: number,
    message: string,
  ) {
    super(message);
  }
}

/** 1-based line and column; the column counts code points, like json-core errors. */
function position(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: [...text.slice(lineStart, offset)].length + 1 };
}

const span = (node: JsonNode, text: string): JsonSpan => ({ raw: text.slice(node.start, node.end), start: node.start, end: node.end });

/** Object members by key; the last duplicate wins, in the order keys first appear. */
function membersOf(node: ObjectNode): Map<string, JsonNode> {
  const members = new Map<string, JsonNode>();
  for (const member of node.members) members.set(member.key.value, member.value);
  return members;
}

function sameScalar(a: JsonNode, b: JsonNode, numbers: Context["numbers"]): boolean {
  switch (a.type) {
    case "string":
      return b.type === "string" && a.value === b.value;
    case "number":
      return b.type === "number" && (numbers === "raw" ? a.raw === b.raw : compareNumbers(a.raw, b.raw) === 0);
    case "boolean":
      return b.type === "boolean" && a.value === b.value;
    case "null":
      return b.type === "null";
    default:
      return false;
  }
}

function walk(a: JsonNode, b: JsonNode, path: JsonPath, ctx: Context): void {
  if (a.type === "object" && b.type === "object") return walkObjects(a, b, path, ctx);
  if (a.type === "array" && b.type === "array") return walkArrays(a, b, path, ctx);
  if (sameScalar(a, b, ctx.numbers)) return;
  ctx.changes.push({ kind: "changed", path, left: span(a, ctx.left), right: span(b, ctx.right) });
}

function walkObjects(a: ObjectNode, b: ObjectNode, path: JsonPath, ctx: Context): void {
  const left = membersOf(a);
  const right = membersOf(b);
  for (const [key, value] of left) {
    const other = right.get(key);
    if (other) walk(value, other, [...path, key], ctx);
    else ctx.changes.push({ kind: "removed", path: [...path, key], left: span(value, ctx.left) });
  }
  for (const [key, value] of right) {
    if (!left.has(key)) ctx.changes.push({ kind: "added", path: [...path, key], right: span(value, ctx.right) });
  }
}

/** True for an array of objects, false for an array without objects; a mix is an error. */
function usesKeys(node: ArrayNode, path: JsonPath, key: string, side: Side): boolean {
  const objects = node.items.filter((item) => item.type === "object").length;
  if (objects === 0) return false;
  if (objects === node.items.length) return true;
  throw new KeyError(side, node.start, `Array ${formatPath(path)} mixes objects and other values; cannot match items by "${key}"`);
}

function walkArrays(a: ArrayNode, b: ArrayNode, path: JsonPath, ctx: Context): void {
  const key = ctx.arrayKey;
  if (key !== undefined) {
    const leftKeyed = usesKeys(a, path, key, "left");
    const rightKeyed = usesKeys(b, path, key, "right");
    if (leftKeyed || rightKeyed) return walkKeyed(a, b, path, key, ctx);
  }
  const common = Math.min(a.items.length, b.items.length);
  for (let i = 0; i < common; i++) walk(a.items[i]!, b.items[i]!, [...path, i], ctx);
  for (let i = common; i < a.items.length; i++) {
    ctx.changes.push({ kind: "removed", path: [...path, i], left: span(a.items[i]!, ctx.left) });
  }
  for (let i = common; i < b.items.length; i++) {
    ctx.changes.push({ kind: "added", path: [...path, i], right: span(b.items[i]!, ctx.right) });
  }
}

/** Type and exact spelling of each item's key value, e.g. "number:1" or "string:ann". */
function keysOf(node: ArrayNode, path: JsonPath, key: string, side: Side, text: string): string[] {
  const seen = new Map<string, number>();
  return node.items.map((item, index) => {
    const value = item.type === "object" ? membersOf(item).get(key) : undefined;
    if (!value) throw new KeyError(side, item.start, `Item ${formatPath([...path, index])} has no "${key}"`);
    if (value.type === "object" || value.type === "array") {
      throw new KeyError(side, value.start, `Item ${formatPath([...path, index])}: "${key}" must be a string, number, boolean or null`);
    }
    const written = text.slice(value.start, value.end);
    const id = `${value.type}:${value.type === "string" ? value.value : written}`;
    const first = seen.get(id);
    if (first !== undefined) {
      throw new KeyError(side, item.start, `Items ${formatPath([...path, first])} and ${formatPath([...path, index])} have the same "${key}": ${written}`);
    }
    seen.set(id, index);
    return id;
  });
}

function walkKeyed(a: ArrayNode, b: ArrayNode, path: JsonPath, key: string, ctx: Context): void {
  const leftKeys = keysOf(a, path, key, "left", ctx.left);
  const rightKeys = keysOf(b, path, key, "right", ctx.right);
  const leftIndex = new Map(leftKeys.map((id, index) => [id, index]));
  const rightSet = new Set(rightKeys);
  rightKeys.forEach((id, index) => {
    const from = leftIndex.get(id);
    if (from === undefined) ctx.changes.push({ kind: "added", path: [...path, index], right: span(b.items[index]!, ctx.right) });
    else walk(a.items[from]!, b.items[index]!, [...path, index], ctx);
  });
  leftKeys.forEach((id, index) => {
    if (!rightSet.has(id)) ctx.changes.push({ kind: "removed", path: [...path, index], left: span(a.items[index]!, ctx.left) });
  });
  const sameOrder = leftKeys.length === rightKeys.length && leftKeys.every((id, i) => rightKeys[i] === id);
  if (!sameOrder) ctx.wholeArrays.push({ path, right: span(b, ctx.right) });
}

/** Compares two JSON documents exactly. Numbers are never converted with Number(). */
export function diffJson(left: string, right: string, options: DiffOptions = {}): DiffResult {
  const a = parseJson(left);
  if (!a.ok) return { ok: false, side: "left", error: a.error };
  const b = parseJson(right);
  if (!b.ok) return { ok: false, side: "right", error: b.error };
  const ctx: Context = {
    left: stripBom(left),
    right: stripBom(right),
    numbers: options.numbers ?? "value",
    arrayKey: options.arrayKey === "" ? undefined : options.arrayKey,
    changes: [],
    wholeArrays: [],
  };
  try {
    walk(a.value, b.value, [], ctx);
  } catch (error) {
    if (!(error instanceof KeyError)) throw error;
    const text = error.side === "left" ? ctx.left : ctx.right;
    const where: JsonError = { message: error.message, offset: error.offset, ...position(text, error.offset) };
    return { ok: false, side: error.side, error: where };
  }
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const change of ctx.changes) counts[change.kind]++;
  return { ok: true, value: { changes: ctx.changes, counts, wholeArrays: ctx.wholeArrays } };
}
