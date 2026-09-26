import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "json-schema-validator",
  title: "JSON Schema Validator",
  description:
    "Check JSON against a JSON Schema: every error with its path and place in the data, exact numbers, and a schema generated from the data.",
  preview: `✕ $.stars  at least 0, got -3
✕ $.homepage  not a URI
✕ $  missing "license"
Not valid: 3 errors`,
  category: "data",
  tags: ["json", "schema", "json schema", "validate", "draft 2020-12"],
  pkg: "@web-kit/json-schema-validator",
  usage: `import { JsonSchemaValidator } from "@web-kit/json-schema-validator";
import "@web-kit/json-schema-validator/styles.css";

export function Page() {
  return <JsonSchemaValidator />;
}

// Logic only, no React:
import { inferSchema, summarizeSchemaResult, validateSchema } from "@web-kit/json-schema-validator/core";

const result = validateSchema('{"age":-1}', '{"properties":{"age":{"minimum":0}}}');
console.log(summarizeSchemaResult(result)); // "Not valid: 1 error"`,
  api: [
    {
      name: "validateSchema",
      signature: "validateSchema(data, schema): SchemaResult",
      description:
        "Draft 2020-12. Errors with data path, schema path, message and positions; warnings for keywords that are not checked; parse and schema errors name their input.",
    },
    {
      name: "summarizeSchemaResult",
      signature: "summarizeSchemaResult(result): string",
      description: 'One line such as "Valid, but 1 keyword was not checked". Never plain "Valid" while there are warnings.',
    },
    {
      name: "inferSchema",
      signature: "inferSchema(data): Result<string>",
      description: "A draft 2020-12 schema with type, properties, required and items, inferred like the TypeScript converter.",
    },
    {
      name: "JsonSchemaValidator",
      signature: "<JsonSchemaValidator initialData? initialSchema? className? />",
      description: "Ready-made UI: Data and Schema side by side, Generate schema from data, a clickable list of errors and warnings.",
    },
    {
      name: "useJsonSchemaValidator",
      signature: "useJsonSchemaValidator({ initialData?, initialSchema? }): UseJsonSchemaValidator",
      description: "Headless state: both texts, the result, generate and undo.",
    },
  ],
};
