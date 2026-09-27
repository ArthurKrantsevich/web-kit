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

/** Keywords whose value is one subschema. */
const SUBSCHEMA = new Set([
  "additionalProperties",
  "propertyNames",
  "items",
  "contains",
  "not",
  "if",
  "then",
  "else",
  "unevaluatedItems",
  "unevaluatedProperties",
  "contentSchema",
]);
/** Keywords whose value maps names to subschemas. */
const SUBSCHEMA_MAP = new Set(["properties", "patternProperties", "dependentSchemas", "$defs", "definitions"]);
/** Keywords whose value is an array of subschemas. */
const SUBSCHEMA_LIST = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
/** Draft 2020-12 keywords this compiler does not check but whose values are known not to be schemas. */
const OTHER_KNOWN = new Set(["dependentRequired", "$dynamicRef", "$recursiveRef", "$recursiveAnchor"]);

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

/**
 * Whether the pointer ends at a place that holds a schema: the root, a subschema keyword's value, an entry of
 * `properties` or `allOf`, and so on. The `properties` map itself and values of `enum`, `const`, `required`,
 * `examples`, `default` and other known keywords are data. Below an unknown keyword anything may be a schema.
 */
function isSchemaLocation(tokens: string[], known: (keyword: string) => boolean): boolean {
  let place: "schema" | "map" | "list" | "data" | "free" = "schema";
  for (const token of tokens) {
    if (place === "map" || place === "list") place = "schema";
    else if (place === "schema") {
      if (SUBSCHEMA.has(token)) place = "schema";
      else if (SUBSCHEMA_MAP.has(token)) place = "map";
      else if (SUBSCHEMA_LIST.has(token)) place = "list";
      else place = known(token) || OTHER_KNOWN.has(token) ? "data" : "free";
    }
  }
  return place === "schema" || place === "free";
}

/** `ref` resolved against `base`, without its fragment; null when it cannot be resolved (a relative URI without a base). */
function absolute(ref: string, base: string | null): string | null {
  try {
    return new URL(ref, base ?? undefined).href.replace(/#.*$/, "");
  } catch {
    return null;
  }
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
  // Absolute URIs of the subschemas with their own $id, each resolved against its nearest parent's $id:
  // a $ref to one of them is not remote, only unsupported.
  const embeddedIds = new Set<string>();
  const collectIds = (node: JsonNode, scope: string | null): void => {
    if (node.type === "array") for (const item of node.items) collectIds(item, scope);
    if (node.type !== "object") return;
    const id = membersOf(node).get("$id")?.value;
    if (id?.type === "string") {
      scope = absolute(id.value, scope);
      if (node !== root && scope !== null) embeddedIds.add(scope);
    }
    for (const member of node.members) collectIds(member.value, scope);
  };
  collectIds(root, null);

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
    if (ref.embedded) return void note("$ref inside a subschema with its own $id is not supported");
    if (uri !== "" && uri !== base) {
      const target = absolute(uri, base === null ? null : absolute(base, null));
      return void note(target !== null && embeddedIds.has(target) ? "$ref to a subschema with its own $id is not supported" : "remote $ref is not supported");
    }
    if (fragment !== "" && !fragment.startsWith("/")) return void note("$ref to an anchor is not supported");
    let tokens: string[];
    try {
      // RFC 6901 §6: the fragment is percent-decoded as a whole, then split, so "%2F" separates tokens.
      const pointer = decodeURIComponent(fragment);
      tokens = pointer === "" ? [] : pointer.slice(1).split("/").map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
    } catch {
      return void note("$ref is not a valid JSON Pointer");
    }
    const target = resolvePointer(root, tokens);
    if (!target) return void note(`$ref points to nothing: ${value}`);
    if (!isSchemaLocation(tokens, (keyword) => ANNOTATIONS.has(keyword) || table.has(keyword))) {
      return void note(`$ref points to a value that is not a schema: ${value}`);
    }
    if (!isSchema(target)) return void note(`$ref does not point to a schema: ${value}`);
    ref.holder.target = compile(target, `#${tokens.map((token) => `/${pointerToken(token)}`).join("")}`, false);
  }

  const schema = compile(root, "#", false);
  // Resolving may compile new subschemas with their own $refs.
  for (let i = 0; i < pending.length; i++) resolve(pending[i]!);
  return { root: schema, problems, warnings };
}
