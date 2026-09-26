"use client";

import { JsonSchemaValidator } from "@web-kit/json-schema-validator";
import "@web-kit/json-schema-validator/styles.css";

const DATA = `{
  "name": "web-kit",
  "version": "1.1",
  "homepage": "not a link",
  "stars": -3,
  "tags": ["json", "schema", "json"]
}`;

const SCHEMA = String.raw`{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "homepage": { "type": "string", "format": "uri" },
    "stars": { "type": "integer", "minimum": 0 },
    "tags": { "type": "array", "items": { "type": "string" }, "uniqueItems": true }
  },
  "required": ["name", "version", "license"]
}`;

export default function JsonSchemaValidatorDemo() {
  return <JsonSchemaValidator initialData={DATA} initialSchema={SCHEMA} />;
}
