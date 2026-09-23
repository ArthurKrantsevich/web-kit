import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "json-convert",
  title: "JSON Convert",
  description: "JSON to YAML, CSV, XML and TypeScript, and CSV to JSON. Numbers stay exact; every format is checked.",
  category: "data",
  tags: ["json", "yaml", "csv", "xml", "typescript", "convert"],
  pkg: "@web-kit/json-convert",
  usage: `import { JsonConvert } from "@web-kit/json-convert";
import "@web-kit/json-convert/styles.css";

export function Page() {
  return <JsonConvert initialTarget="yaml" />;
}

// Logic only:
import { toYaml, toCsv, fromCsv, toXml, toTypeScript } from "@web-kit/json-convert/core";`,
  api: [
    { name: "toYaml", signature: "toYaml(input: string): ConvertResult", description: "Block YAML 1.2; ambiguous strings are quoted; duplicate keys are an error." },
    { name: "toCsv", signature: 'toCsv(input, { delimiter?: "," | ";" | "\\t" }): ConvertResult', description: "Array of objects → RFC 4180 CSV; nested objects become a.b columns." },
    { name: "fromCsv", signature: "fromCsv(input, { delimiter?, inferTypes? }): ConvertResult", description: "CSV with a header row → JSON array; types only for exact matches." },
    { name: "toXml", signature: "toXml(input, { rootName? }): ConvertResult", description: "JSON → XML 1.0 (one-way). Keys become valid element names." },
    { name: "toTypeScript", signature: "toTypeScript(input, { rootName? }): ConvertResult", description: "Interfaces inferred from the data; keys missing in some objects are optional." },
    { name: "JsonConvert", signature: "<JsonConvert initialInput? initialTarget? className? />", description: "Ready-made UI with per-format options and copy." },
  ],
};
