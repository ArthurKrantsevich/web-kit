import { formatPath, parseJson, type JsonNode, type JsonPath } from "@web-kit/json-core";
import type { ConvertError, ConvertResult } from "./types";

class ConvertFailure {
  constructor(
    readonly message: string,
    readonly path: JsonPath | null,
    readonly line: number | null = null,
  ) {}
}

/** Stops a conversion with a message about the value at `path`. */
export function fail(message: string, path: JsonPath): never {
  throw new ConvertFailure(message, path);
}

/** Stops a conversion with a message about a line of text input. */
export function failAtLine(message: string, line: number): never {
  throw new ConvertFailure(message, null, line);
}

export function parseInput(input: string): { ok: true; root: JsonNode } | { ok: false; error: ConvertError } {
  const parsed = parseJson(input);
  if (parsed.ok) return { ok: true, root: parsed.value };
  return { ok: false, error: { message: parsed.error.message, line: parsed.error.line, column: parsed.error.column } };
}

/** Runs a conversion and turns `fail` / `failAtLine` into an error result. */
export function run(convert: () => string): ConvertResult {
  try {
    return { ok: true, value: convert() };
  } catch (e) {
    if (!(e instanceof ConvertFailure)) throw e;
    if (e.path) return { ok: false, error: { message: e.message, path: formatPath(e.path) } };
    return { ok: false, error: { message: e.message, line: e.line ?? 1 } };
  }
}
