import { compareNumbers, isMultipleOf, type JsonMember, type JsonNode, type JsonPath } from "@web-kit/json-core";
import { evaluate, quietly, RefLoop, worst, type Check, type Run, type Schema, type Status } from "./evaluate";
import { FORMATS } from "./formats";
import { codePoints, pointerToken, valueKey } from "./text";

/** What a keyword needs from the compiler. */
export interface Context {
  /** The keywords of the schema object; the last duplicate wins. */
  members: Map<string, JsonMember>;
  /** JSON Pointer of the schema object. */
  path: string;
  /** Compiles a subschema; `path` is its JSON Pointer. */
  child(node: JsonNode, path: string): Schema;
  /** Records a schema error; the data will not be checked. */
  problem(path: string, start: number, end: number, message: string): void;
  /** Records a keyword that is not checked and marks this schema "unchecked". */
  warn(keyword: string, member: JsonMember, message: string): void;
  /** Resolves a $ref once the whole schema is compiled. */
  ref(member: JsonMember): { target: Schema | null };
}

/** Builds the check for one keyword, or null when it has nothing to check or the value is wrong. */
export type Keyword = (member: JsonMember, ctx: Context) => Check | null;

type ObjectNode = Extract<JsonNode, { type: "object" }>;

const TYPES = new Set(["null", "boolean", "object", "array", "number", "string", "integer"]);

const at = (ctx: Context, ...tokens: (string | number)[]): string =>
  ctx.path + tokens.map((token) => `/${pointerToken(token)}`).join("");

function problem(ctx: Context, member: JsonMember, message: string): null {
  ctx.problem(at(ctx, member.key.value), member.key.start, member.value.end, message);
  return null;
}

/** Records a failure of `member` for `data`; `range` overrides the selected part of the data. */
function fail(
  run: Run,
  member: JsonMember,
  schemaPath: string,
  data: JsonNode,
  path: JsonPath,
  message: string,
  range: [number, number] = [data.start, data.end],
): "fail" {
  run.failures.push({
    keyword: member.key.value,
    message,
    dataPath: path,
    schemaPath,
    dataStart: range[0],
    dataEnd: range[1],
    schemaStart: member.key.start,
    schemaEnd: member.value.end,
  });
  return "fail";
}

const isInteger = (node: JsonNode): boolean => node.type === "number" && isMultipleOf(node.raw, "1");

function typeOf(node: JsonNode): string {
  return node.type === "number" && isInteger(node) ? "integer" : node.type;
}

function plural(count: string | number, one: string, many: string = `${one}s`): string {
  return `${count} ${String(count) === "1" ? one : many}`;
}

const memberCache = new WeakMap<ObjectNode, Map<string, JsonMember>>();

/** Members of a data object by key; the last duplicate wins, in the order keys first appear. */
function membersOf(node: ObjectNode): Map<string, JsonMember> {
  let members = memberCache.get(node);
  if (!members) {
    members = new Map();
    for (const member of node.members) members.set(member.key.value, member);
    memberCache.set(node, members);
  }
  return members;
}

/** The spelling of a non-negative integer (1.0 counts), or null. */
function countOf(node: JsonNode): string | null {
  return node.type === "number" && isInteger(node) && compareNumbers(node.raw, "0") >= 0 ? node.raw : null;
}

/** Like countOf, but a wrong value is a schema problem. */
function limit(member: JsonMember, ctx: Context): string | null {
  return countOf(member.value) ?? problem(ctx, member, `${member.key.value} must be a non-negative integer`);
}

function schemaList(member: JsonMember, ctx: Context): Schema[] | null {
  const value = member.value;
  if (value.type !== "array" || value.items.length === 0) {
    return problem(ctx, member, `${member.key.value} must be a non-empty array of schemas`);
  }
  return value.items.map((item, index) => ctx.child(item, at(ctx, member.key.value, index)));
}

function schemaMap(member: JsonMember, ctx: Context): [string, Schema][] | null {
  const value = member.value;
  if (value.type !== "object") return problem(ctx, member, `${member.key.value} must be an object`);
  const entries = new Map<string, Schema>();
  for (const { key, value: node } of value.members) entries.set(key.value, ctx.child(node, at(ctx, member.key.value, key.value)));
  return [...entries];
}

function regex(source: string): RegExp | string {
  try {
    return new RegExp(source, "u");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Compiled `patternProperties` keys; bad ones are reported by the patternProperties keyword. */
function patterns(ctx: Context): RegExp[] {
  const member = ctx.members.get("patternProperties");
  if (member?.value.type !== "object") return [];
  return member.value.members.map((m) => regex(m.key.value)).filter((r): r is RegExp => r instanceof RegExp);
}

/** A property value checked against a subschema; for a `false` subschema the message names the property. */
function checkMember(schema: Schema, keyword: JsonMember, member: JsonMember, path: JsonPath, run: Run): Status {
  const memberPath = [...path, member.key.value];
  if (schema.value === false) {
    return fail(run, keyword, schema.path, member.value, memberPath, `Property ${JSON.stringify(member.key.value)} is not allowed`, [
      member.key.start,
      member.value.end,
    ]);
  }
  return evaluate(schema, member.value, memberPath, run);
}

function numberKeyword(test: (order: -1 | 0 | 1) => boolean, words: string): Keyword {
  return (member, ctx) => {
    const value = member.value;
    if (value.type !== "number") return problem(ctx, member, `${member.key.value} must be a number`);
    const path = at(ctx, member.key.value);
    return (data, dataPath, run) =>
      data.type !== "number" || test(compareNumbers(data.raw, value.raw))
        ? "pass"
        : fail(run, member, path, data, dataPath, `Expected ${words} ${value.raw}, got ${data.raw}`);
  };
}

function sizeKeyword(measure: (data: JsonNode) => number | null, isMin: boolean, one: string, many?: string): Keyword {
  return (member, ctx) => {
    const bound = limit(member, ctx);
    if (bound === null) return null;
    const path = at(ctx, member.key.value);
    return (data, dataPath, run) => {
      const size = measure(data);
      if (size === null) return "pass";
      const order = compareNumbers(String(size), bound);
      if (isMin ? order >= 0 : order <= 0) return "pass";
      return fail(run, member, path, data, dataPath, `Expected ${isMin ? "at least" : "at most"} ${plural(bound, one, many)}, got ${size}`);
    };
  };
}

const objectSize = (data: JsonNode): number | null => (data.type === "object" ? membersOf(data).size : null);
const arraySize = (data: JsonNode): number | null => (data.type === "array" ? data.items.length : null);
const stringSize = (data: JsonNode): number | null => (data.type === "string" ? codePoints(data.value) : null);

/** The values as written, for a message; null when that would be longer than one short line. */
function listed(nodes: JsonNode[], text: (node: JsonNode) => string): string | null {
  const joined = nodes.map(text).join(", ");
  return joined.length <= 80 && !joined.includes("\n") ? joined : null;
}

export function keywords(schemaText: string): Map<string, Keyword> {
  const raw = (node: JsonNode): string => schemaText.slice(node.start, node.end);

  return new Map<string, Keyword>([
    [
      "type",
      (member, ctx) => {
        const value = member.value;
        const names =
          value.type === "string" ? [value.value] : value.type === "array" ? value.items.map((item) => (item.type === "string" ? item.value : "")) : [];
        if (names.length === 0 || names.some((name) => !TYPES.has(name))) {
          return problem(ctx, member, "type must be a type name or an array of type names");
        }
        const path = at(ctx, "type");
        return (data, dataPath, run) => {
          const actual = typeOf(data);
          if (names.includes(actual) || (actual === "integer" && names.includes("number"))) return "pass";
          return fail(run, member, path, data, dataPath, `Expected ${names.join(" or ")}, got ${data.type}`);
        };
      },
    ],
    [
      "enum",
      (member, ctx) => {
        const value = member.value;
        if (value.type !== "array") return problem(ctx, member, "enum must be an array");
        const allowed = new Set(value.items.map(valueKey));
        const shown = listed(value.items, raw);
        const message = shown === null ? `Expected one of the ${value.items.length} values in enum` : `Expected one of: ${shown}`;
        const path = at(ctx, "enum");
        return (data, dataPath, run) => (allowed.has(valueKey(data)) ? "pass" : fail(run, member, path, data, dataPath, message));
      },
    ],
    [
      "const",
      (member, ctx) => {
        const expected = valueKey(member.value);
        const shown = listed([member.value], raw);
        const message = shown === null ? "Expected the value in const" : `Expected ${shown}`;
        const path = at(ctx, "const");
        return (data, dataPath, run) => (valueKey(data) === expected ? "pass" : fail(run, member, path, data, dataPath, message));
      },
    ],
    [
      "properties",
      (member, ctx) => {
        const entries = schemaMap(member, ctx);
        if (entries === null) return null;
        return (data, path, run) => {
          if (data.type !== "object") return "pass";
          const present = membersOf(data);
          let status: Status = "pass";
          for (const [key, schema] of entries) {
            const found = present.get(key);
            if (found) status = worst(status, checkMember(schema, member, found, path, run));
          }
          return status;
        };
      },
    ],
    [
      "patternProperties",
      (member, ctx) => {
        const value = member.value;
        if (value.type !== "object") return problem(ctx, member, "patternProperties must be an object");
        const entries: [RegExp, Schema][] = [];
        const seen = new Map<string, JsonMember>();
        for (const m of value.members) seen.set(m.key.value, m);
        for (const [source, m] of seen) {
          const compiled = regex(source);
          const schema = ctx.child(m.value, at(ctx, "patternProperties", source));
          if (typeof compiled === "string") {
            ctx.problem(at(ctx, "patternProperties", source), m.key.start, m.key.end, `patternProperties key is not a valid regular expression: ${compiled}`);
          } else entries.push([compiled, schema]);
        }
        return (data, path, run) => {
          if (data.type !== "object") return "pass";
          let status: Status = "pass";
          for (const found of membersOf(data).values()) {
            for (const [pattern, schema] of entries) {
              if (pattern.test(found.key.value)) status = worst(status, checkMember(schema, member, found, path, run));
            }
          }
          return status;
        };
      },
    ],
    [
      "additionalProperties",
      (member, ctx) => {
        const schema = ctx.child(member.value, at(ctx, "additionalProperties"));
        const properties = ctx.members.get("properties")?.value;
        const named = new Set(properties?.type === "object" ? properties.members.map((m) => m.key.value) : []);
        const matchers = patterns(ctx);
        return (data, path, run) => {
          if (data.type !== "object") return "pass";
          let status: Status = "pass";
          for (const [key, found] of membersOf(data)) {
            if (named.has(key) || matchers.some((pattern) => pattern.test(key))) continue;
            status = worst(status, checkMember(schema, member, found, path, run));
          }
          return status;
        };
      },
    ],
    [
      "required",
      (member, ctx) => {
        const value = member.value;
        if (value.type !== "array" || value.items.some((item) => item.type !== "string")) {
          return problem(ctx, member, "required must be an array of strings");
        }
        const names = value.items.map((item) => (item.type === "string" ? item.value : ""));
        const path = at(ctx, "required");
        return (data, dataPath, run) => {
          if (data.type !== "object") return "pass";
          const present = membersOf(data);
          let status: Status = "pass";
          for (const name of names) {
            // The object's opening brace is selected: the property is not there to point at.
            if (!present.has(name)) {
              status = fail(run, member, path, data, dataPath, `Missing required property ${JSON.stringify(name)}`, [data.start, data.start + 1]);
            }
          }
          return status;
        };
      },
    ],
    ["minProperties", sizeKeyword(objectSize, true, "property", "properties")],
    ["maxProperties", sizeKeyword(objectSize, false, "property", "properties")],
    [
      "prefixItems",
      (member, ctx) => {
        const schemas = schemaList(member, ctx);
        if (schemas === null) return null;
        return (data, path, run) => {
          if (data.type !== "array") return "pass";
          let status: Status = "pass";
          schemas.forEach((schema, index) => {
            const item = data.items[index];
            if (item) status = worst(status, evaluate(schema, item, [...path, index], run));
          });
          return status;
        };
      },
    ],
    [
      "items",
      (member, ctx) => {
        if (member.value.type === "array") {
          return problem(ctx, member, "items must be a schema; for a list of schemas use prefixItems (draft 2020-12)");
        }
        const schema = ctx.child(member.value, at(ctx, "items"));
        const prefix = ctx.members.get("prefixItems")?.value;
        const skip = prefix?.type === "array" ? prefix.items.length : 0;
        return (data, path, run) => {
          if (data.type !== "array" || data.items.length <= skip) return "pass";
          if (schema.value === false) {
            return fail(run, member, schema.path, data, path, `Expected at most ${plural(skip, "item")}, got ${data.items.length}`);
          }
          let status: Status = "pass";
          for (let index = skip; index < data.items.length; index++) {
            status = worst(status, evaluate(schema, data.items[index]!, [...path, index], run));
          }
          return status;
        };
      },
    ],
    ["minItems", sizeKeyword(arraySize, true, "item")],
    ["maxItems", sizeKeyword(arraySize, false, "item")],
    [
      "uniqueItems",
      (member, ctx) => {
        if (member.value.type !== "boolean") return problem(ctx, member, "uniqueItems must be true or false");
        if (!member.value.value) return null;
        const path = at(ctx, "uniqueItems");
        return (data, dataPath, run) => {
          if (data.type !== "array") return "pass";
          const seen = new Map<string, number>();
          let status: Status = "pass";
          data.items.forEach((item, index) => {
            const key = valueKey(item);
            const first = seen.get(key);
            if (first === undefined) seen.set(key, index);
            else status = fail(run, member, path, item, [...dataPath, index], `Item ${index} equals item ${first}`);
          });
          return status;
        };
      },
    ],
    [
      "contains",
      (member, ctx) => {
        const schema = ctx.child(member.value, at(ctx, "contains"));
        const minMember = ctx.members.get("minContains");
        const maxMember = ctx.members.get("maxContains");
        // A wrong minContains or maxContains is reported by its own keyword.
        const min = minMember ? countOf(minMember.value) : "1";
        const max = maxMember ? countOf(maxMember.value) : null;
        if (min === null || (maxMember && max === null)) return null;
        const path = at(ctx, "contains");
        return (data, dataPath, run) => {
          if (data.type !== "array") return "pass";
          let matched = 0;
          let maybe = 0;
          data.items.forEach((item, index) => {
            const status = quietly(run, () => evaluate(schema, item, [...dataPath, index], run));
            if (status === "pass") matched++;
            else if (status === "unknown") maybe++;
          });
          if (compareNumbers(String(matched + maybe), min) < 0) {
            const message =
              min === "1" && !minMember
                ? "No item matches the schema in contains"
                : `Expected at least ${plural(min, "item")} matching contains, got ${matched}`;
            return fail(run, minMember ?? member, minMember ? at(ctx, "minContains") : path, data, dataPath, message);
          }
          if (max !== null && maxMember && compareNumbers(String(matched), max) > 0) {
            return fail(run, maxMember, at(ctx, "maxContains"), data, dataPath, `Expected at most ${plural(max, "item")} matching contains, got ${matched}`);
          }
          const sure = compareNumbers(String(matched), min) >= 0 && (max === null || compareNumbers(String(matched + maybe), max) <= 0);
          return sure ? "pass" : "unknown";
        };
      },
    ],
    // Checked by `contains`; alone they have no effect.
    ["minContains", (member, ctx) => (limit(member, ctx), null)],
    ["maxContains", (member, ctx) => (limit(member, ctx), null)],
    ["minLength", sizeKeyword(stringSize, true, "character")],
    ["maxLength", sizeKeyword(stringSize, false, "character")],
    [
      "pattern",
      (member, ctx) => {
        const value = member.value;
        if (value.type !== "string") return problem(ctx, member, "pattern must be a string");
        const compiled = regex(value.value);
        if (typeof compiled === "string") return problem(ctx, member, `pattern is not a valid regular expression: ${compiled}`);
        const path = at(ctx, "pattern");
        return (data, dataPath, run) =>
          data.type !== "string" || compiled.test(data.value)
            ? "pass"
            : fail(run, member, path, data, dataPath, `Does not match the pattern ${value.value}`);
      },
    ],
    ["minimum", numberKeyword((order) => order >= 0, "at least")],
    ["maximum", numberKeyword((order) => order <= 0, "at most")],
    ["exclusiveMinimum", numberKeyword((order) => order > 0, "more than")],
    ["exclusiveMaximum", numberKeyword((order) => order < 0, "less than")],
    [
      "multipleOf",
      (member, ctx) => {
        const value = member.value;
        if (value.type !== "number" || compareNumbers(value.raw, "0") <= 0) {
          return problem(ctx, member, "multipleOf must be a number greater than 0");
        }
        const path = at(ctx, "multipleOf");
        return (data, dataPath, run) =>
          data.type !== "number" || isMultipleOf(data.raw, value.raw)
            ? "pass"
            : fail(run, member, path, data, dataPath, `Expected a multiple of ${value.raw}, got ${data.raw}`);
      },
    ],
    [
      "allOf",
      (member, ctx) => {
        const schemas = schemaList(member, ctx);
        if (schemas === null) return null;
        return (data, path, run) => schemas.reduce<Status>((status, schema) => worst(status, evaluate(schema, data, path, run)), "pass");
      },
    ],
    [
      "anyOf",
      (member, ctx) => {
        const schemas = schemaList(member, ctx);
        if (schemas === null) return null;
        const path = at(ctx, "anyOf");
        return (data, dataPath, run) => {
          let maybe = false;
          for (const schema of schemas) {
            const status = quietly(run, () => evaluate(schema, data, dataPath, run));
            if (status === "pass") return "pass";
            if (status === "unknown") maybe = true;
          }
          return maybe ? "unknown" : fail(run, member, path, data, dataPath, "Does not match any schema in anyOf");
        };
      },
    ],
    [
      "oneOf",
      (member, ctx) => {
        const schemas = schemaList(member, ctx);
        if (schemas === null) return null;
        const path = at(ctx, "oneOf");
        return (data, dataPath, run) => {
          const matched: number[] = [];
          let maybe = 0;
          schemas.forEach((schema, index) => {
            const status = quietly(run, () => evaluate(schema, data, dataPath, run));
            if (status === "pass") matched.push(index);
            else if (status === "unknown") maybe++;
          });
          if (matched.length > 1) {
            return fail(run, member, path, data, dataPath, `Matches ${matched.length} schemas in oneOf (${matched.join(", ")}); exactly one is allowed`);
          }
          if (maybe > 0) return "unknown";
          return matched.length === 1 ? "pass" : fail(run, member, path, data, dataPath, "Does not match any schema in oneOf");
        };
      },
    ],
    [
      "not",
      (member, ctx) => {
        const schema = ctx.child(member.value, at(ctx, "not"));
        const path = at(ctx, "not");
        return (data, dataPath, run) => {
          const status = quietly(run, () => evaluate(schema, data, dataPath, run));
          if (status === "unknown") return "unknown";
          return status === "fail" ? "pass" : fail(run, member, path, data, dataPath, "Must not match the schema in not");
        };
      },
    ],
    [
      "if",
      (member, ctx) => {
        const condition = ctx.child(member.value, at(ctx, "if"));
        const thenMember = ctx.members.get("then");
        const elseMember = ctx.members.get("else");
        const then = thenMember ? ctx.child(thenMember.value, at(ctx, "then")) : null;
        const otherwise = elseMember ? ctx.child(elseMember.value, at(ctx, "else")) : null;
        const path = at(ctx, "if");
        return (data, dataPath, run) => {
          const status = quietly(run, () => evaluate(condition, data, dataPath, run));
          if (status === "pass") return then ? evaluate(then, data, dataPath, run) : "pass";
          if (status === "fail") return otherwise ? evaluate(otherwise, data, dataPath, run) : "pass";
          // The condition is unknown: the answer is sure only when both branches agree.
          const a = then ? quietly(run, () => evaluate(then, data, dataPath, run)) : "pass";
          const b = otherwise ? quietly(run, () => evaluate(otherwise, data, dataPath, run)) : "pass";
          if (a === "pass" && b === "pass") return "pass";
          if (a === "fail" && b === "fail") return fail(run, member, path, data, dataPath, "Matches neither then nor else");
          return "unknown";
        };
      },
    ],
    // Compiled for their own errors and warnings; `if` uses them.
    ["then", (member, ctx) => (ctx.child(member.value, at(ctx, "then")), null)],
    ["else", (member, ctx) => (ctx.child(member.value, at(ctx, "else")), null)],
    [
      "$ref",
      (member, ctx) => {
        if (member.value.type !== "string") return problem(ctx, member, "$ref must be a string");
        const holder = ctx.ref(member);
        const path = at(ctx, "$ref");
        return (data, dataPath, run) => {
          const target = holder.target;
          if (!target) return "pass";
          const key = `${target.id}:${data.start}`;
          if (run.active.has(key)) throw new RefLoop(path, member.key.start, member.value.end);
          run.active.add(key);
          try {
            return evaluate(target, data, dataPath, run);
          } finally {
            run.active.delete(key);
          }
        };
      },
    ],
    [
      "format",
      (member, ctx) => {
        const value = member.value;
        if (value.type !== "string") return problem(ctx, member, "format must be a string");
        const rule = FORMATS.get(value.value);
        if (!rule) {
          ctx.warn("format", member, `format \`${value.value}\` is not checked`);
          return null;
        }
        const path = at(ctx, "format");
        return (data, dataPath, run) =>
          data.type !== "string" || rule.test(data.value) ? "pass" : fail(run, member, path, data, dataPath, rule.message);
      },
    ],
  ]);
}
