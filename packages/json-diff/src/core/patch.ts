import { compareNumbers, parseJson, stripBom, type JsonNode, type JsonPath, type Result } from "@web-kit/json-core";
import type { JsonDiff, JsonPatchOperation } from "./types";

/** RFC 6901: "~" → "~0", "/" → "~1". The root is "". */
export function toPointer(path: JsonPath): string {
  return path.map((part) => `/${String(part).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

/** Pointers of the path and of every ancestor, root first: "", "/a", "/a/0". */
function pointerPrefixes(path: JsonPath): string[] {
  const out = [""];
  let pointer = "";
  for (const part of path) {
    pointer += toPointer([part]);
    out.push(pointer);
  }
  return out;
}

/** Operations that turn the left document into the right one. Values are copied verbatim from the right text. */
export function toJsonPatch(diff: JsonDiff): JsonPatchOperation[] {
  // Set lookups keep this linear in the number of changes (times path depth) for large documents.
  const replacedPointers = new Set(diff.wholeArrays.map((array) => toPointer(array.path)));
  const whole = diff.wholeArrays.filter((array) => !pointerPrefixes(array.path).slice(0, -1).some((p) => replacedPointers.has(p)));
  const kept = diff.changes.filter((change) => !pointerPrefixes(change.path).some((p) => replacedPointers.has(p)));
  const ops: JsonPatchOperation[] = whole.map((array) => ({ op: "replace", path: toPointer(array.path), value: array.right.raw }));
  for (const change of kept) {
    if (change.kind === "changed") ops.push({ op: "replace", path: toPointer(change.path), value: change.right!.raw });
  }
  // Removed items come in ascending index order per array; reversed, later indexes go first.
  for (const change of [...kept].reverse()) {
    if (change.kind === "removed") ops.push({ op: "remove", path: toPointer(change.path) });
  }
  for (const change of kept) {
    if (change.kind === "added") ops.push({ op: "add", path: toPointer(change.path), value: change.right!.raw });
  }
  return ops;
}

/** The patch as a JSON document; `value` texts are embedded verbatim. */
export function formatJsonPatch(ops: JsonPatchOperation[]): string {
  if (ops.length === 0) return "[]";
  const lines = ops.map((op) => {
    let line = `{"op": ${JSON.stringify(op.op)}, "path": ${JSON.stringify(op.path)}`;
    if (op.from !== undefined) line += `, "from": ${JSON.stringify(op.from)}`;
    if (op.value !== undefined) line += `, "value": ${op.value}`;
    return `  ${line}}`;
  });
  return `[\n${lines.join(",\n")}\n]`;
}

type Value =
  | { kind: "object"; members: Map<string, Value> }
  | { kind: "array"; items: Value[] }
  | { kind: "scalar"; node: JsonNode; raw: string };

function toValue(node: JsonNode, text: string): Value {
  if (node.type === "object") {
    const members = new Map<string, Value>();
    for (const member of node.members) members.set(member.key.value, toValue(member.value, text));
    return { kind: "object", members };
  }
  if (node.type === "array") return { kind: "array", items: node.items.map((item) => toValue(item, text)) };
  return { kind: "scalar", node, raw: text.slice(node.start, node.end) };
}

function clone(value: Value): Value {
  if (value.kind === "object") return { kind: "object", members: new Map([...value.members].map(([k, v]) => [k, clone(v)])) };
  if (value.kind === "array") return { kind: "array", items: value.items.map(clone) };
  return value;
}

function equal(a: Value, b: Value): boolean {
  if (a.kind === "object" && b.kind === "object") {
    return a.members.size === b.members.size && [...a.members].every(([k, v]) => b.members.has(k) && equal(v, b.members.get(k)!));
  }
  if (a.kind === "array" && b.kind === "array") return a.items.length === b.items.length && a.items.every((v, i) => equal(v, b.items[i]!));
  if (a.kind !== "scalar" || b.kind !== "scalar") return false;
  const x = a.node;
  const y = b.node;
  if (x.type === "number" && y.type === "number") return compareNumbers(x.raw, y.raw) === 0;
  if (x.type === "string" && y.type === "string") return x.value === y.value;
  if (x.type === "boolean" && y.type === "boolean") return x.value === y.value;
  return x.type === "null" && y.type === "null";
}

function print(value: Value, indent: string): string {
  const inner = `${indent}  `;
  if (value.kind === "scalar") return value.raw;
  if (value.kind === "array") {
    if (value.items.length === 0) return "[]";
    return `[\n${value.items.map((item) => inner + print(item, inner)).join(",\n")}\n${indent}]`;
  }
  if (value.members.size === 0) return "{}";
  const members = [...value.members].map(([key, item]) => `${inner}${JSON.stringify(key)}: ${print(item, inner)}`);
  return `{\n${members.join(",\n")}\n${indent}}`;
}

class PatchError extends Error {}

function parsePointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new PatchError('a path must be empty or start with "/"');
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function arrayIndex(token: string, length: number, allowEnd: boolean): number {
  if (allowEnd && token === "-") return length;
  if (!/^(0|[1-9][0-9]*)$/.test(token)) throw new PatchError(`"${token}" is not an array index`);
  const index = Number(token);
  if (index > length || (!allowEnd && index === length)) throw new PatchError(`index ${token} is out of range`);
  return index;
}

class Document {
  constructor(public root: Value) {}

  private at(tokens: string[], pointer: string): Value {
    let value = this.root;
    for (const token of tokens) {
      const next =
        value.kind === "object"
          ? value.members.get(token)
          : value.kind === "array"
            ? value.items[arrayIndex(token, value.items.length, false)]
            : undefined;
      if (!next) throw new PatchError(`${pointer} does not exist`);
      value = next;
    }
    return value;
  }

  get(pointer: string): Value {
    return this.at(parsePointer(pointer), pointer);
  }

  add(pointer: string, value: Value): void {
    const tokens = parsePointer(pointer);
    const token = tokens.pop();
    if (token === undefined) {
      this.root = value;
      return;
    }
    const container = this.at(tokens, pointer);
    if (container.kind === "object") container.members.set(token, value);
    else if (container.kind === "array") container.items.splice(arrayIndex(token, container.items.length, true), 0, value);
    else throw new PatchError(`the parent of ${pointer} is not an object or array`);
  }

  remove(pointer: string): Value {
    const tokens = parsePointer(pointer);
    const token = tokens.pop();
    if (token === undefined) throw new PatchError("cannot remove the whole document");
    const removed = this.get(pointer);
    const container = this.at(tokens, pointer);
    if (container.kind === "object") container.members.delete(token);
    else if (container.kind === "array") container.items.splice(arrayIndex(token, container.items.length, false), 1);
    return removed;
  }

  replace(pointer: string, value: Value): void {
    this.get(pointer);
    const tokens = parsePointer(pointer);
    const token = tokens.pop();
    if (token === undefined) {
      this.root = value;
      return;
    }
    const container = this.at(tokens, pointer);
    if (container.kind === "object") container.members.set(token, value);
    else if (container.kind === "array") container.items[arrayIndex(token, container.items.length, false)] = value;
  }
}

function parseValue(op: JsonPatchOperation): Value {
  if (op.value === undefined) throw new PatchError("value is missing");
  const parsed = parseJson(op.value);
  if (!parsed.ok) throw new PatchError("value is not valid JSON");
  return toValue(parsed.value, stripBom(op.value));
}

function fromOf(op: JsonPatchOperation): string {
  if (op.from === undefined) throw new PatchError("from is missing");
  return op.from;
}

/** Applies RFC 6902 operations to JSON text; the result is printed with a two-space indent. */
export function applyJsonPatch(input: string, patch: JsonPatchOperation[]): Result<string> {
  const parsed = parseJson(input);
  if (!parsed.ok) return parsed;
  const doc = new Document(toValue(parsed.value, stripBom(input)));
  for (let i = 0; i < patch.length; i++) {
    const op = patch[i]!;
    try {
      switch (op.op) {
        case "add":
          doc.add(op.path, parseValue(op));
          break;
        case "remove":
          doc.remove(op.path);
          break;
        case "replace":
          doc.replace(op.path, parseValue(op));
          break;
        case "move": {
          const from = fromOf(op);
          // Checked before removing: moving a value into its own child would lose it.
          if (op.path !== from && op.path.startsWith(`${from}/`)) throw new PatchError("cannot move a value into itself");
          doc.add(op.path, doc.remove(from));
          break;
        }
        case "copy":
          doc.add(op.path, clone(doc.get(fromOf(op))));
          break;
        case "test":
          if (!equal(doc.get(op.path), parseValue(op))) throw new PatchError("value differs");
          break;
        default:
          throw new PatchError(`unknown operation "${String((op as { op: unknown }).op)}"`);
      }
    } catch (error) {
      if (!(error instanceof PatchError)) throw error;
      // A patch error has no place in the input text; it points at the start.
      return { ok: false, error: { message: `Operation ${i + 1} (${op.op} ${op.path}): ${error.message}`, offset: 0, line: 1, column: 1 } };
    }
  }
  return { ok: true, value: print(doc.root, "") };
}
