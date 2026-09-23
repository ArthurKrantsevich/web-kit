import type { JsonNode, JsonPath } from "@web-kit/json-core";
import { fail, parseInput, run } from "./common";
import type { ConvertResult } from "./types";

export interface ToXmlOptions {
  /** Name of the root element. Default "root". */
  rootName?: string;
}

const NAME_CHAR = /[\p{L}\p{N}_.\-]/u;
const NAME_START = /^[\p{L}_]/u;
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
    .replace(/'/g, "&apos;");
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
