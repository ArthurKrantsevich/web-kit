import { inferShape, parseJson, type Result, type TypeShape } from "@web-kit/json-core";

type Json = string | Json[] | Map<string, Json>;

const PRIMITIVES = ["string", "number", "boolean", "null"] as const;

function schemaOf(shape: TypeShape): Map<string, Json> {
  const schema = new Map<string, Json>();
  const types: string[] = [];
  if (shape.object) types.push("object");
  if (shape.array) types.push("array");
  for (const primitive of PRIMITIVES) if (shape.primitives.has(primitive)) types.push(primitive);
  if (types.length === 1) schema.set("type", types[0]!);
  else if (types.length > 1) schema.set("type", types);
  if (shape.object && shape.object.fields.size > 0) {
    const object = shape.object;
    schema.set("properties", new Map([...object.fields].map(([key, field]) => [key, schemaOf(field)])));
    const required = [...object.fields.keys()].filter((key) => object.counts.get(key) === object.samples);
    if (required.length > 0) schema.set("required", required);
  }
  if (shape.array?.item) schema.set("items", schemaOf(shape.array.item));
  return schema;
}

function print(value: Json, indent: string): string {
  if (typeof value === "string") return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : `[\n${value.map((item) => inner + print(item, inner)).join(",\n")}\n${indent}]`;
  }
  if (value.size === 0) return "{}";
  const members = [...value].map(([key, item]) => `${inner}${JSON.stringify(key)}: ${print(item, inner)}`);
  return `{\n${members.join(",\n")}\n${indent}}`;
}

/**
 * A draft 2020-12 schema that describes the data: `type`, `properties`, `required` and `items`,
 * inferred like `toTypeScript` in @web-kit/json-convert. Keys missing from some objects of an array are optional.
 */
export function inferSchema(data: string): Result<string> {
  const parsed = parseJson(data);
  if (!parsed.ok) return parsed;
  const schema = new Map<string, Json>([["$schema", "https://json-schema.org/draft/2020-12/schema"]]);
  for (const [key, value] of schemaOf(inferShape(parsed.value))) schema.set(key, value);
  return { ok: true, value: print(schema, "") };
}
