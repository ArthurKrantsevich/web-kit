---
"@web-kit/json-schema-validator": patch
---

`$ref` fragments are percent-decoded as a whole before they are split (RFC 6901 §6), so `#/$defs/a%2Fb` means `$defs` → `a` → `b`. A `$ref` to a value that is not a schema (the `properties` map, a value inside `enum`, `const`, `required`, `examples`, `default`) is a schema error. A schema that needs more than 1,000,000 subschema evaluations stops with "The schema is too expensive to check" instead of freezing the page. UI: the result, a parse error included, is announced through one live region that is always present; backtick-quoted keyword names in messages are shown as code.
