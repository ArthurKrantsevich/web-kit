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

export interface JsonStringNode {
  type: "string";
  start: number;
  end: number;
  /** Exactly as written, including quotes and escapes. */
  raw: string;
  /** Decoded value. */
  value: string;
}

export interface JsonNumberNode {
  type: "number";
  start: number;
  end: number;
  /** Exactly as written. Never converted with Number(). */
  raw: string;
}

export interface JsonBooleanNode {
  type: "boolean";
  start: number;
  end: number;
  value: boolean;
}

export interface JsonNullNode {
  type: "null";
  start: number;
  end: number;
}

export interface JsonMember {
  key: JsonStringNode;
  value: JsonNode;
}

export interface JsonObjectNode {
  type: "object";
  start: number;
  end: number;
  members: JsonMember[];
}

export interface JsonArrayNode {
  type: "array";
  start: number;
  end: number;
  items: JsonNode[];
}

/** Offsets are UTF-16 indexes in the text without a leading BOM; `end` is exclusive. */
export type JsonNode = JsonObjectNode | JsonArrayNode | JsonStringNode | JsonNumberNode | JsonBooleanNode | JsonNullNode;

/** Object keys and array indexes from the root. */
export type JsonPath = (string | number)[];
