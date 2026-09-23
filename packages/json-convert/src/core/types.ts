export interface ConvertError {
  message: string;
  /** JSON path of the value that could not be converted. */
  path?: string;
  /** 1-based position in the input, for syntax errors. */
  line?: number;
  column?: number;
}

export type ConvertResult = { ok: true; value: string } | { ok: false; error: ConvertError };
