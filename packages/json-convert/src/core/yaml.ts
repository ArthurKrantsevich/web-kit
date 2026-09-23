import type { JsonNode, JsonPath } from "@web-kit/json-core";
import { fail, parseInput, run } from "./common";
import type { ConvertResult } from "./types";

// YAML 1.1 and 1.2 literals, the merge key and the "value" key; parsers may read these as something else.
const RESERVED = /^(?:true|false|null|yes|no|on|off|y|n|~|<<|=)$/i;
// Document markers at the start of a line end or start a YAML document.
const DOCUMENT_MARKER = /^(?:---|\.\.\.)/;
// Implicit keys longer than this are invalid YAML.
const MAX_IMPLICIT_KEY = 1024;
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
    !DOCUMENT_MARKER.test(value) &&
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
      const keyText = yamlString(key);
      // Long keys need the explicit "? key" form.
      const head = keyText.length > MAX_IMPLICIT_KEY ? [`${indent}? ${keyText}`, `${indent}:`] : [`${indent}${keyText}:`];
      if (isBlock(member.value)) {
        lines.push(...head, ...block(member.value, `${indent}  `, [...path, key]));
      } else {
        const last = head.pop()!;
        lines.push(...head, `${last} ${scalar(member.value)}`);
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
