export type Indent = 2 | 4 | "\t";

export interface JsonError {
  message: string;
  /** Index in the input (after a leading BOM is removed). */
  offset: number;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: JsonError };
