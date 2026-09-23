import type { CsvDelimiter } from "../core/csv";
import { fromCsv, toCsv, toTypeScript, toXml, toYaml, type ConvertError, type ConvertResult } from "../core/index";

export type ConvertTarget = "yaml" | "csv" | "xml" | "typescript" | "csv-to-json";

export interface ConvertOptions {
  delimiter: CsvDelimiter;
  inferTypes: boolean;
  xmlRoot: string;
  typeName: string;
}

export const DEFAULT_OPTIONS: ConvertOptions = { delimiter: ",", inferTypes: false, xmlRoot: "root", typeName: "Root" };

export const TARGETS: { value: ConvertTarget; label: string }[] = [
  { value: "yaml", label: "JSON → YAML" },
  { value: "csv", label: "JSON → CSV" },
  { value: "xml", label: "JSON → XML" },
  { value: "typescript", label: "JSON → TypeScript" },
  { value: "csv-to-json", label: "CSV → JSON" },
];

export function convert(input: string, target: ConvertTarget, options: ConvertOptions): ConvertResult {
  switch (target) {
    case "yaml":
      return toYaml(input);
    case "csv":
      return toCsv(input, { delimiter: options.delimiter });
    case "xml":
      return toXml(input, { rootName: options.xmlRoot });
    case "typescript":
      return toTypeScript(input, { rootName: options.typeName });
    case "csv-to-json":
      return fromCsv(input, { delimiter: options.delimiter, inferTypes: options.inferTypes });
  }
}

export function describeError(error: ConvertError): string {
  if (error.line !== undefined) {
    return `Line ${error.line}${error.column !== undefined ? `, column ${error.column}` : ""}: ${error.message}`;
  }
  return error.path !== undefined ? `${error.message} (at ${error.path})` : error.message;
}
