import { formatJson, printJson, stripBom, type JsonNode, type JsonObjectNode, type JsonPath } from "@web-kit/json-core";
import { fail, failAtLine, parseInput, run } from "./common";
import type { ConvertResult } from "./types";

export type CsvDelimiter = "," | ";" | "\t";

export interface ToCsvOptions {
  delimiter?: CsvDelimiter;
}

export interface FromCsvOptions {
  delimiter?: CsvDelimiter;
  /** Turn exact JSON numbers, true/false/null into values and empty cells into null. Default: everything is a string. */
  inferTypes?: boolean;
}

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function cellText(node: JsonNode): string {
  switch (node.type) {
    case "string":
      return node.value;
    case "number":
      return node.raw;
    case "boolean":
      return String(node.value);
    case "null":
      return "";
    case "object":
    case "array":
      return printJson(node, { minify: true });
  }
}

function flatten(node: JsonObjectNode, prefix: string, path: JsonPath, row: Map<string, string>): void {
  for (const member of node.members) {
    const column = prefix + member.key.value;
    const at = [...path, member.key.value];
    if (member.value.type === "object" && member.value.members.length > 0) {
      flatten(member.value, `${column}.`, at, row);
      continue;
    }
    if (row.has(column)) fail(`Two fields map to the CSV column "${column}"`, at);
    row.set(column, cellText(member.value));
  }
}

function csvCell(text: string, delimiter: string): string {
  return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Array of objects → CSV (RFC 4180, CRLF). Nested objects become `a.b` columns, arrays become JSON cells. */
export function toCsv(input: string, options: ToCsvOptions = {}): ConvertResult {
  const delimiter = options.delimiter ?? ",";
  const parsed = parseInput(input);
  if (!parsed.ok) return parsed;
  const { root } = parsed;
  return run(() => {
    if (root.type !== "array") fail("CSV needs an array of objects", []);
    if (root.items.length === 0) return "";
    const columns: string[] = [];
    const known = new Set<string>();
    const rows = root.items.map((item, index) => {
      if (item.type !== "object") fail("CSV needs an array of objects", [index]);
      const row = new Map<string, string>();
      flatten(item, "", [index], row);
      for (const column of row.keys()) {
        if (!known.has(column)) {
          known.add(column);
          columns.push(column);
        }
      }
      return row;
    });
    const lines = [columns, ...rows.map((row) => columns.map((column) => row.get(column) ?? ""))];
    return `${lines.map((cells) => cells.map((cell) => csvCell(cell, delimiter)).join(delimiter)).join("\r\n")}\r\n`;
  });
}

interface CsvRow {
  cells: string[];
  line: number;
}

function parseCsv(text: string, delimiter: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = "";
  let touched = false;
  let rowLine = 1;
  let line = 1;
  let i = 0;

  const endRow = (): void => {
    cells.push(field);
    // A completely empty line is not a record.
    if (touched || cells.length > 1) rows.push({ cells, line: rowLine });
    cells = [];
    field = "";
    touched = false;
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"') {
      if (field !== "") failAtLine("Unexpected quote inside an unquoted field", line);
      touched = true;
      const quoteLine = line;
      i++;
      for (;;) {
        if (i >= text.length) failAtLine("Unterminated quoted field", quoteLine);
        const q = text[i]!;
        if (q === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        if (q === "\n") line++;
        field += q;
        i++;
      }
      const next = text[i];
      if (next !== undefined && next !== delimiter && next !== "\n" && next !== "\r") {
        failAtLine("Unexpected character after a closing quote", line);
      }
      continue;
    }
    if (ch === delimiter) {
      cells.push(field);
      field = "";
      touched = true;
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      endRow();
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      line++;
      rowLine = line;
      continue;
    }
    field += ch;
    touched = true;
    i++;
  }
  if (touched || field !== "" || cells.length > 0) endRow();
  return rows;
}

function jsonValue(cell: string, inferTypes: boolean): string {
  if (!inferTypes) return JSON.stringify(cell);
  if (cell === "") return "null";
  if (JSON_NUMBER.test(cell) || cell === "true" || cell === "false" || cell === "null") return cell;
  return JSON.stringify(cell);
}

/** CSV (RFC 4180) with a header row → JSON array of objects, formatted with 2 spaces. */
export function fromCsv(input: string, options: FromCsvOptions = {}): ConvertResult {
  const delimiter = options.delimiter ?? ",";
  const inferTypes = options.inferTypes ?? false;
  return run(() => {
    const rows = parseCsv(stripBom(input), delimiter);
    if (rows.length === 0) failAtLine("CSV is empty", 1);
    const [header, ...records] = rows;
    const seen = new Set<string>();
    for (const name of header!.cells) {
      if (seen.has(name)) failAtLine(`Duplicate column name "${name}"`, header!.line);
      seen.add(name);
    }
    const objects = records.map((record) => {
      const count = record.cells.length;
      if (count !== header!.cells.length) {
        failAtLine(`Row has ${count} field${count === 1 ? "" : "s"}, expected ${header!.cells.length}`, record.line);
      }
      const members = header!.cells.map((name, index) => `${JSON.stringify(name)}:${jsonValue(record.cells[index]!, inferTypes)}`);
      return `{${members.join(",")}}`;
    });
    const formatted = formatJson(`[${objects.join(",")}]`);
    if (!formatted.ok) throw new Error(`fromCsv produced invalid JSON: ${formatted.error.message}`);
    return formatted.value;
  });
}
