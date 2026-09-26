import type { JsonNode, JsonPath } from "@web-kit/json-core";

/**
 * "unknown" means no checked keyword failed but a keyword that is not checked might have.
 * It keeps `not`, `oneOf` and `if` from turning an unchecked keyword into a wrong error.
 */
export type Status = "pass" | "unknown" | "fail";

/** A validation error before its offsets become lines and columns. */
export interface Failure {
  keyword: string;
  message: string;
  dataPath: JsonPath;
  schemaPath: string;
  dataStart: number;
  dataEnd: number;
  schemaStart: number;
  schemaEnd: number;
}

export interface Run {
  failures: Failure[];
  /** "schema id:data offset" pairs being evaluated; meeting one again means a $ref loop that never ends. */
  active: Set<string>;
}

export type Check = (data: JsonNode, path: JsonPath, run: Run) => Status;

export interface Schema {
  id: number;
  /** JSON Pointer in the schema, e.g. "#/$defs/user". */
  path: string;
  node: JsonNode;
  /** Set for the `true` and `false` schemas. */
  value: boolean | null;
  checks: Check[];
  /** Has keywords that are not checked: when every check passes, the result is "unknown". */
  unchecked: boolean;
}

export class RefLoop extends Error {
  constructor(
    readonly schemaPath: string,
    readonly start: number,
    readonly end: number,
  ) {
    super("$ref loop");
  }
}

const RANK: Record<Status, number> = { pass: 0, unknown: 1, fail: 2 };

export function worst(a: Status, b: Status): Status {
  return RANK[a] >= RANK[b] ? a : b;
}

export function evaluate(schema: Schema, data: JsonNode, path: JsonPath, run: Run): Status {
  if (schema.value === true) return "pass";
  if (schema.value === false) {
    run.failures.push({
      keyword: "false",
      message: "No value is allowed here",
      dataPath: path,
      schemaPath: schema.path,
      dataStart: data.start,
      dataEnd: data.end,
      schemaStart: schema.node.start,
      schemaEnd: schema.node.end,
    });
    return "fail";
  }
  let status: Status = schema.unchecked ? "unknown" : "pass";
  for (const check of schema.checks) status = worst(status, check(data, path, run));
  return status;
}

/** Runs `fn` and drops the failures it recorded: for branches whose own errors are not the answer. */
export function quietly(run: Run, fn: () => Status): Status {
  const mark = run.failures.length;
  const status = fn();
  run.failures.length = mark;
  return status;
}
