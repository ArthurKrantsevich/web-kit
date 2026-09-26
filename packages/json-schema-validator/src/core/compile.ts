import type { JsonMember, JsonNode } from "@web-kit/json-core";
import type { Schema } from "./evaluate";
import { keywords, type Context } from "./keywords";
import { pointerToken } from "./text";

/** Accepted without a check and without a warning: they do not change whether data is valid. */
const ANNOTATIONS = new Set([
  "$schema",
  "$id",
  "$comment",
  "$anchor",
  "$dynamicAnchor",
  "$vocabulary",
  "$defs",
  "definitions",
  "title",
  "description",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  "contentEncoding",
  "contentMediaType",
  "contentSchema",
]);

const DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";

/** A schema error or warning before its offsets become lines and columns. */
export interface Note {
  schemaPath: string;
  start: number;
  end: number;
  message: string;
  keyword: string;
}

export interface Compiled {
  root: Schema;
  problems: Note[];
  warnings: Note[];
}

interface PendingRef {
  holder: { target: Schema | null };
  member: JsonMember;
  path: string;
  /** Inside a subschema with its own $id: its pointers would be relative to that resource. */
  embedded: boolean;
}

const isSchema = (node: JsonNode): boolean => node.type === "object" || node.type === "boolean";

function membersOf(node: Extract<JsonNode, { type: "object" }>): Map<string, JsonMember> {
  const members = new Map<string, JsonMember>();
  for (const member of node.members) members.set(member.key.value, member);
  return members;
}

/** The node a JSON Pointer (already decoded) points to, or null. */
function resolvePointer(root: JsonNode, tokens: string[]): JsonNode | null {
  let node: JsonNode | null = root;
  for (const token of tokens) {
    if (node?.type === "object") node = membersOf(node).get(token)?.value ?? null;
    else if (node?.type === "array" && /^(0|[1-9][0-9]*)$/.test(token)) node = node.items[Number(token)] ?? null;
    else return null;
  }
  return node;
}

/** Compiles a draft 2020-12 schema from its AST. Every subschema is visited, so all problems and warnings are found up front. */
export function compileSchema(root: JsonNode, text: string): Compiled {
  const problems: Note[] = [];
  const warnings: Note[] = [];
  const cache = new Map<JsonNode, Schema>();
  const pending: PendingRef[] = [];
  const table = keywords(text);
  let nextId = 0;

  const rootMembers = root.type === "object" ? membersOf(root) : new Map<string, JsonMember>();
  const rootId = rootMembers.get("$id")?.value;
  const base = rootId?.type === "string" ? rootId.value.replace(/#.*$/, "") : null;

  function compile(node: JsonNode, path: string, embedded: boolean): Schema {
    const cached = cache.get(node);
    if (cached) return cached;
    const schema: Schema = { id: nextId++, path, node, value: null, checks: [], unchecked: false };
    cache.set(node, schema);
    if (node.type === "boolean") {
      schema.value = node.value;
      return schema;
    }
    if (node.type !== "object") {
      problems.push({ schemaPath: path, start: node.start, end: node.end, message: "A schema must be an object or a boolean", keyword: "" });
      schema.value = true;
      return schema;
    }
    const members = membersOf(node);
    const inside = embedded || (node !== root && members.get("$id")?.value.type === "string");
    const ctx: Context = {
      members,
      path,
      child: (child, childPath) => compile(child, childPath, inside),
      problem: (schemaPath, start, end, message) => problems.push({ schemaPath, start, end, message, keyword: "" }),
      warn: (keyword, member, message) => {
        schema.unchecked = true;
        warnings.push({ schemaPath: `${path}/${pointerToken(keyword)}`, start: member.key.start, end: member.value.end, message, keyword });
      },
      ref: (member) => {
        const holder = { target: null };
        pending.push({ holder, member, path: `${path}/$ref`, embedded: inside });
        return holder;
      },
    };
    for (const [keyword, member] of members) {
      if (keyword === "$schema" && node === root && member.value.type === "string" && member.value.value.replace(/#$/, "") !== DRAFT_2020_12) {
        ctx.warn(keyword, member, "keyword `$schema` is not checked: only draft 2020-12 is supported");
        continue;
      }
      if (keyword === "$defs" || keyword === "definitions") {
        if (member.value.type !== "object") {
          problems.push({ schemaPath: `${path}/${keyword}`, start: member.key.start, end: member.value.end, message: `${keyword} must be an object`, keyword });
        } else {
          for (const def of member.value.members) ctx.child(def.value, `${path}/${keyword}/${pointerToken(def.key.value)}`);
        }
        continue;
      }
      if (ANNOTATIONS.has(keyword)) continue;
      const build = table.get(keyword);
      if (!build) {
        ctx.warn(keyword, member, `keyword \`${keyword}\` is not checked`);
        continue;
      }
      const check = build(member, ctx);
      if (check) schema.checks.push(check);
    }
    return schema;
  }

  function resolve(ref: PendingRef): void {
    const value = ref.member.value.type === "string" ? ref.member.value.value : "";
    const note = (message: string) =>
      problems.push({ schemaPath: ref.path, start: ref.member.key.start, end: ref.member.value.end, message, keyword: "$ref" });
    const hash = value.indexOf("#");
    const uri = hash === -1 ? value : value.slice(0, hash);
    const fragment = hash === -1 ? "" : value.slice(hash + 1);
    if (uri !== "" && uri !== base) return void note("remote $ref is not supported");
    if (ref.embedded) return void note("$ref inside a subschema with its own $id is not supported");
    if (fragment !== "" && !fragment.startsWith("/")) return void note("$ref to an anchor is not supported");
    let tokens: string[];
    try {
      tokens = fragment === "" ? [] : fragment.slice(1).split("/").map((token) => decodeURIComponent(token).replace(/~1/g, "/").replace(/~0/g, "~"));
    } catch {
      return void note("$ref is not a valid JSON Pointer");
    }
    const target = resolvePointer(root, tokens);
    if (!target) return void note(`$ref points to nothing: ${value}`);
    if (!isSchema(target)) return void note(`$ref does not point to a schema: ${value}`);
    ref.holder.target = compile(target, `#${tokens.map((token) => `/${pointerToken(token)}`).join("")}`, false);
  }

  const schema = compile(root, "#", false);
  // Resolving may compile new subschemas with their own $refs.
  for (let i = 0; i < pending.length; i++) resolve(pending[i]!);
  return { root: schema, problems, warnings };
}
