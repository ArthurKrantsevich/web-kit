import type { JsonNode, JsonPath } from "@web-kit/json-core";
import { fail, parseInput, run } from "./common";
import type { ConvertResult } from "./types";

export interface ToXmlOptions {
  /** Name of the root element. Default "root". */
  rootName?: string;
}

// XML 1.0 (5th edition) NameStartChar and NameChar, without ":" (reserved for namespaces).
const START_RANGES =
  "A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const NAME_START = new RegExp(`^[${START_RANGES}]`, "u");
const NAME_CHAR = new RegExp(`[${START_RANGES}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F\\u2040]`, "u");
const INVALID_CHAR =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** A valid XML element name for a JSON key: invalid characters become `_`; names that cannot start an element get a `_` prefix. */
export function xmlName(key: string): string {
  const name = Array.from(key, (ch) => (NAME_CHAR.test(ch) ? ch : "_")).join("");
  return name === "" || !NAME_START.test(name) || /^xml/i.test(name) ? `_${name}` : name;
}

function text(value: string, path: JsonPath): string {
  const bad = INVALID_CHAR.exec(value);
  if (bad) {
    const code = bad[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
    fail(`XML 1.0 cannot contain the character U+${code}`, path);
  }
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Parsers turn a literal CR into LF; a character reference keeps it.
    .replace(/\r/g, "&#13;");
}

function element(name: string, node: JsonNode, indent: string, path: JsonPath, lines: string[]): void {
  switch (node.type) {
    case "object":
      if (node.members.length === 0) {
        lines.push(`${indent}<${name}/>`);
        return;
      }
      lines.push(`${indent}<${name}>`);
      for (const member of node.members) {
        element(xmlName(member.key.value), member.value, `${indent}  `, [...path, member.key.value], lines);
      }
      lines.push(`${indent}</${name}>`);
      return;
    case "array":
      if (node.items.length === 0) {
        lines.push(`${indent}<${name}/>`);
        return;
      }
      lines.push(`${indent}<${name}>`);
      node.items.forEach((item, index) => element("item", item, `${indent}  `, [...path, index], lines));
      lines.push(`${indent}</${name}>`);
      return;
    case "null":
      lines.push(`${indent}<${name}/>`);
      return;
    case "string":
      lines.push(`${indent}<${name}>${text(node.value, path)}</${name}>`);
      return;
    case "number":
      lines.push(`${indent}<${name}>${node.raw}</${name}>`);
      return;
    case "boolean":
      lines.push(`${indent}<${name}>${node.value}</${name}>`);
      return;
  }
}

/** JSON → XML 1.0. One-way: XML has no arrays or types, so the result cannot be turned back into the same JSON. */
export function toXml(input: string, options: ToXmlOptions = {}): ConvertResult {
  const rootName = options.rootName ?? "root";
  if (xmlName(rootName) !== rootName) {
    return { ok: false, error: { message: `"${rootName}" is not a valid XML element name` } };
  }
  const parsed = parseInput(input);
  if (!parsed.ok) return parsed;
  return run(() => {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
    element(rootName, parsed.root, "", [], lines);
    return `${lines.join("\n")}\n`;
  });
}
