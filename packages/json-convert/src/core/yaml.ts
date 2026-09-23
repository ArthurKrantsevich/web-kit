import type { JsonNode, JsonPath } from "@web-kit/json-core";
import { fail, parseInput, run } from "./common";
import type { ConvertResult } from "./types";

const RESERVED = /^(?:true|false|null|yes|no|on|off|y|n|~)$/i;
const NUMBER_LIKE = /^[-+.]?\d|^[-+]?\.(?:inf|nan)$/i;
const INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/;
const UNSAFE =
  /: |\s#|:$|[\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const NEEDS_ESCAPE = /[\u007f-\u009f\u2028\u2029\ufeff]/g;

/** A YAML scalar that reads back as exactly this string: plain when safe, otherwise double-quoted. */
export function yamlString(value: string): string {
  const plain =
    value !== "" &&
    value.trim() === value &&
    !RESERVED.test(value) &&
    !NUMBER_LIKE.test(value) &&
    !INDICATOR.test(value) &&
    !UNSAFE.test(value);
  if (plain) return value;
  return JSON.stringify(value).replace(NEEDS_ESCAPE, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

const isBlock = (node: JsonNode): boolean =>
  (node.type === "object" && node.members.length > 0) || (node.type === "array" && node.items.length > 0);

function scalar(node: JsonNode): string {
  switch (node.type) {
    case "string":
      return yamlString(node.value);
    case "number":
      return node.raw;
    case "boolean":
      return String(node.value);
    case "null":
      return "null";
    case "object":
      return "{}";
    case "array":
      return "[]";
  }
}

function block(node: JsonNode, indent: string, path: JsonPath): string[] {
  const lines: string[] = [];
  if (node.type === "object") {
    const seen = new Set<string>();
    for (const member of node.members) {
      const key = member.key.value;
      if (seen.has(key)) fail(`YAML does not allow duplicate key "${key}"`, [...path, key]);
      seen.add(key);
      if (isBlock(member.value)) {
        lines.push(`${indent}${yamlString(key)}:`, ...block(member.value, `${indent}  `, [...path, key]));
      } else {
        lines.push(`${indent}${yamlString(key)}: ${scalar(member.value)}`);
      }
    }
  } else if (node.type === "array") {
    node.items.forEach((item, index) => {
      if (!isBlock(item)) {
        lines.push(`${indent}- ${scalar(item)}`);
        return;
      }
      const inner = block(item, `${indent}  `, [...path, index]);
      inner[0] = `${indent}- ${inner[0]!.slice(indent.length + 2)}`;
      lines.push(...inner);
    });
  }
  return lines;
}

/** JSON → block-style YAML 1.2. Numbers keep their spelling; duplicate keys are an error. */
export function toYaml(input: string): ConvertResult {
  const parsed = parseInput(input);
  if (!parsed.ok) return parsed;
  const { root } = parsed;
  return run(() => `${(isBlock(root) ? block(root, "", []) : [scalar(root)]).join("\n")}\n`);
}
