import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "json-schema-validator",
  title: "JSON Schema Validator",
  description: "Check JSON against a JSON Schema: every error with its path and place in the data, exact numbers, and a schema generated from the data.",
  preview: `jsonSchemaValidator("…")`,
  category: "data",
  tags: ["json-schema-validator"],
  pkg: "@web-kit/json-schema-validator",
  usage: `import { JsonSchemaValidator } from "@web-kit/json-schema-validator";
import "@web-kit/json-schema-validator/styles.css";

export function Page() {
  return <JsonSchemaValidator />;
}`,
  api: [
    {
      name: "jsonSchemaValidator",
      signature: "jsonSchemaValidator(input: string): Result<string>",
      description: "Check JSON against a JSON Schema: every error with its path and place in the data, exact numbers, and a schema generated from the data.",
    },
    {
      name: "JsonSchemaValidator",
      signature: "<JsonSchemaValidator initialInput? className? />",
      description: "Ready-made React UI.",
    },
  ],
};
