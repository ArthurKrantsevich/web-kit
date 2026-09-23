import { inferShape, type ObjectShape, type TypeShape } from "@web-kit/json-core";
import { parseInput, run } from "./common";
import type { ConvertResult } from "./types";

export interface ToTypeScriptOptions {
  /** Name of the root type. Default "Root". */
  rootName?: string;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const PRIMITIVE_ORDER = ["string", "number", "boolean", "null"] as const;

function pascal(key: string): string {
  const words = key.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const name = words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join("");
  if (name === "") return "Field";
  return /^[0-9]/.test(name) ? `_${name}` : name;
}

/** "users" → "User", "addresses" → "Address"; falls back to "<Name>Item". */
function singular(name: string): string {
  let result = name;
  if (/ies$/.test(name)) result = name.replace(/ies$/, "y");
  else if (/(ches|shes|xes|sses|zes|uses)$/.test(name)) result = name.slice(0, -2);
  else if (/s$/.test(name) && !/(ss|us|is)$/.test(name)) result = name.slice(0, -1);
  return result !== name && result !== "" ? result : `${name}Item`;
}

/** JSON → TypeScript interfaces inferred from the data. Keys seen in only some objects become optional. */
export function toTypeScript(input: string, options: ToTypeScriptOptions = {}): ConvertResult {
  const rootName = options.rootName ?? "Root";
  if (!IDENTIFIER.test(rootName)) {
    return { ok: false, error: { message: `"${rootName}" is not a valid TypeScript type name` } };
  }
  const parsed = parseInput(input);
  if (!parsed.ok) return parsed;

  return run(() => {
    const shape = inferShape(parsed.root);
    // Slots are taken when an object is first visited, so declarations come out root first, then in field order.
    const declarations: (string | null)[] = [];
    const nameByBody = new Map<string, string>();
    const used = new Set<string>();

    const allocate = (hint: string): string => {
      let name = hint;
      for (let n = 2; used.has(name); n++) name = `${hint}${n}`;
      used.add(name);
      return name;
    };

    const interfaceFor = (object: ObjectShape, hint: string): string => {
      const slot = declarations.length;
      declarations.push(null);
      const lines = [...object.fields].map(([key, field]) => {
        const optional = (object.counts.get(key) ?? 0) < object.samples ? "?" : "";
        const property = IDENTIFIER.test(key) ? key : JSON.stringify(key);
        return `  ${property}${optional}: ${typeOf(field, pascal(key))};`;
      });
      const body = lines.join("\n");
      const existing = nameByBody.get(body);
      if (existing) return existing;
      const name = allocate(hint);
      nameByBody.set(body, name);
      declarations[slot] = `export interface ${name} {\n${body}${body ? "\n" : ""}}`;
      return name;
    };

    const typeOf = (value: TypeShape, hint: string): string => {
      const parts: string[] = [];
      if (value.object) parts.push(interfaceFor(value.object, hint));
      if (value.array) {
        const item = value.array.item ? typeOf(value.array.item, singular(hint)) : "unknown";
        parts.push(item.includes(" | ") ? `(${item})[]` : `${item}[]`);
      }
      for (const primitive of PRIMITIVE_ORDER) if (value.primitives.has(primitive)) parts.push(primitive);
      return parts.length > 0 ? parts.join(" | ") : "unknown";
    };

    const isPlainObject = shape.object !== null && shape.array === null && shape.primitives.size === 0;
    if (isPlainObject) {
      interfaceFor(shape.object!, rootName);
    } else {
      used.add(rootName);
      declarations.push(null);
      declarations[0] = `export type ${rootName} = ${typeOf(shape, rootName)};`;
    }
    return `${declarations.filter((declaration): declaration is string => declaration !== null).join("\n\n")}\n`;
  });
}
