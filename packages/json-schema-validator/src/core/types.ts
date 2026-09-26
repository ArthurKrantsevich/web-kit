import type { JsonError, JsonPath } from "@web-kit/json-core";

/** A place in a text. Offsets are UTF-16 indexes in the text without a leading BOM (`end` is exclusive); `line` and `column` are 1-based and describe `offset`; the column counts code points. */
export interface TextRange {
  offset: number;
  end: number;
  line: number;
  column: number;
}

/** A value in the data that breaks a rule of the schema. */
export interface ValidationError {
  message: string;
  /** The keyword that failed, e.g. "minimum"; "false" for a `false` schema. */
  keyword: string;
  /** Path of the value in the data. */
  dataPath: JsonPath;
  /** JSON Pointer of the keyword in the schema, e.g. "#/properties/age/minimum". */
  schemaPath: string;
  /** The value in the data text. */
  data: TextRange;
  /** The keyword in the schema text. */
  schema: TextRange;
}

/** A keyword that is not checked. While there are warnings, a result without errors is not a full "valid". */
export interface SchemaWarning {
  keyword: string;
  /** JSON Pointer of the keyword in the schema. */
  schemaPath: string;
  /** "keyword `x` is not checked", or a format or draft note in the same spirit. */
  message: string;
  schema: TextRange;
}

/** The schema is wrong or needs something unsupported (a remote $ref, a bad pattern); the data is not checked. */
export interface SchemaProblem {
  schemaPath: string;
  message: string;
  schema: TextRange;
}

/** A syntax error in one of the two inputs. */
export interface ParseProblem {
  input: "data" | "schema";
  error: JsonError;
}

export type SchemaResult =
  | { ok: false; stage: "parse"; parseErrors: ParseProblem[] }
  | { ok: false; stage: "schema"; problems: SchemaProblem[]; warnings: SchemaWarning[] }
  | {
      ok: true;
      /** No errors were found. With warnings, some keywords were not checked: never present such a result as plain "valid". */
      valid: boolean;
      /** In data order. */
      errors: ValidationError[];
      /** In schema order, one per keyword. */
      warnings: SchemaWarning[];
    };
