# @web-kit/json-schema-validator

Check JSON data against a JSON Schema (draft 2020-12). Every error has its path in the data, its path in the schema and its place in both texts. Numbers are compared exactly. A keyword that is not checked is reported, so a result is never "valid" by accident. `inferSchema` writes a schema from example data.

## Logic only (no React)

```ts
import { inferSchema, summarizeSchemaResult, validateSchema } from "@web-kit/json-schema-validator/core";

const result = validateSchema('{"age": -1}', '{"properties": {"age": {"minimum": 0}}, "required": ["name"]}');
if (result.ok) {
  result.valid; // false
  result.errors[1]; // { message: "Expected at least 0, got -1", keyword: "minimum", dataPath: ["age"],
  //                    schemaPath: "#/properties/age/minimum", data: { offset: 8, end: 10, line: 1, column: 9 }, schema: { … } }
  result.warnings; // [] — keywords that were not checked
}
summarizeSchemaResult(result); // "Not valid: 2 errors"

inferSchema('{"id": 1, "tags": ["a"]}'); // { ok: true, value: "{\n  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\", …" }
```

- **Checked:** `type`, `enum`, `const`; `properties`, `required`, `additionalProperties`, `patternProperties`, `minProperties`, `maxProperties`; `items`, `prefixItems`, `minItems`, `maxItems`, `uniqueItems`, `contains` with `minContains` and `maxContains`; `minLength`, `maxLength` (in code points), `pattern` (`RegExp` with the `u` flag); `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` (exact decimals, so `0.075` is not a multiple of `0.01` and `19.99` is); `allOf`, `anyOf`, `oneOf`, `not`, `if` / `then` / `else`; `$ref` inside the document (`#`, `#/$defs/…`, `#/definitions/…`, any JSON Pointer); `format`: `email`, `uri`, `date`, `date-time`, `uuid`, `ipv4`, `ipv6`.
- **Accepted without a check:** `title`, `description`, `default`, `examples`, `$schema`, `$id`, `$comment`, `$anchor`, `$dynamicAnchor`, `$vocabulary`, `deprecated`, `readOnly`, `writeOnly`, `content*`, `$defs`, `definitions`.
- **Anything else** (for example `propertyNames`, `dependentRequired`, `unevaluatedProperties`, `$dynamicRef`, or another format) gives a warning ``keyword `x` is not checked`` with its schema path. Such a result is "Valid, but N keywords were not checked", never plain "Valid", and an unchecked keyword inside `not`, `oneOf` or `if` never produces an error.
- **Schema errors** stop the check: `{ ok: false, stage: "schema", problems, warnings }` for a remote `$ref`, a `$ref` to an anchor, to a subschema with its own `$id` or inside one, a `$ref` loop, a pattern that does not compile, or a malformed keyword.
- **Parse errors** name the input: `{ ok: false, stage: "parse", parseErrors: [{ input: "data", error }] }`.
- Tested against the official [JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite) (draft 2020-12, supported keywords); see `test-suite/README.md`.

## React component

```tsx
import { JsonSchemaValidator } from "@web-kit/json-schema-validator";
import "@web-kit/json-schema-validator/styles.css";

export function Page() {
  return <JsonSchemaValidator initialData='{"age": 1}' initialSchema='{"type": "object"}' />;
}
```

Data and Schema each have Paste and Open file; Schema also has Download (`schema.json`) and Copy. `useJsonSchemaValidator()` gives the same state without markup. Set `--wk-schema-height` to change the height of the two inputs.

## License

MIT
