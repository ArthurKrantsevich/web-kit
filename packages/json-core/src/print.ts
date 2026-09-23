import type { Indent, JsonMember, JsonNode } from "./types";

export interface PrintOptions {
  indent?: Indent;
  minify?: boolean;
  /** Sort object keys recursively by code point. Stable: duplicate keys keep their order. */
  sortKeys?: boolean;
}

/** Prints an AST. Numbers and strings keep their original spelling; only whitespace and key order can change. */
export function printJson(node: JsonNode, options: PrintOptions = {}): string {
  const unit = options.minify ? "" : options.indent === "\t" ? "\t" : " ".repeat(options.indent ?? 2);
  const newline = unit === "" ? "" : "\n";
  const colon = unit === "" ? ":" : ": ";
  const sortKeys = options.sortKeys ?? false;
  const parts: string[] = [];

  const write = (current: JsonNode, depth: number): void => {
    switch (current.type) {
      case "object": {
        if (current.members.length === 0) {
          parts.push("{}");
          return;
        }
        const members = sortKeys ? sortMembers(current.members) : current.members;
        parts.push("{");
        members.forEach((member, index) => {
          parts.push(index === 0 ? "" : ",", newline, unit.repeat(depth + 1), member.key.raw, colon);
          write(member.value, depth + 1);
        });
        parts.push(newline, unit.repeat(depth), "}");
        return;
      }
      case "array": {
        if (current.items.length === 0) {
          parts.push("[]");
          return;
        }
        parts.push("[");
        current.items.forEach((item, index) => {
          parts.push(index === 0 ? "" : ",", newline, unit.repeat(depth + 1));
          write(item, depth + 1);
        });
        parts.push(newline, unit.repeat(depth), "]");
        return;
      }
      case "string":
      case "number":
        parts.push(current.raw);
        return;
      case "boolean":
        parts.push(String(current.value));
        return;
      case "null":
        parts.push("null");
        return;
    }
  };

  write(node, 0);
  return parts.join("");
}

function sortMembers(members: JsonMember[]): JsonMember[] {
  return [...members].sort((a, b) => compareCodePoints(a.key.value, b.key.value));
}

function compareCodePoints(a: string, b: string): number {
  const left = a[Symbol.iterator]();
  const right = b[Symbol.iterator]();
  for (;;) {
    const x = left.next();
    const y = right.next();
    if (x.done || y.done) return x.done && y.done ? 0 : x.done ? -1 : 1;
    const diff = x.value.codePointAt(0)! - y.value.codePointAt(0)!;
    if (diff !== 0) return diff;
  }
}
