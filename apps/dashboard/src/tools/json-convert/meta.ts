import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "json-convert",
  title: "JSON Convert",
  description: "Convert JSON to YAML, CSV, XML and TypeScript, and CSV to JSON. Every result is checked.",
  category: "data",
  tags: ["json-convert"],
  pkg: "@web-kit/json-convert",
  usage: `import { JsonConvert } from "@web-kit/json-convert";
import "@web-kit/json-convert/styles.css";

export function Page() {
  return <JsonConvert />;
}`,
  api: [
    {
      name: "jsonConvert",
      signature: "jsonConvert(input: string): Result<string>",
      description: "Convert JSON to YAML, CSV, XML and TypeScript, and CSV to JSON. Every result is checked.",
    },
    {
      name: "JsonConvert",
      signature: "<JsonConvert initialInput? className? />",
      description: "Ready-made React UI.",
    },
  ],
};
