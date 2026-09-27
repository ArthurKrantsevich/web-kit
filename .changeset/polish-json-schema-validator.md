---
"@web-kit/json-schema-validator": patch
---

`$ref` fragments are percent-decoded as a whole before they are split (RFC 6901 §6), so `#/$defs/a%2Fb` means `$defs` → `a` → `b`. A `$ref` to a value that is not a schema (the `properties` map, a value inside `enum`, `const`, `required`, `examples`, `default`) is a schema error. A check that needs more than 50 subschema evaluations per data value (at least 1,000,000) stops with "Too expensive to check: the schema re-checks the same data too many times" instead of freezing the page; ordinary data up to the 10 MB file limit is never stopped. UI: the result, a parse error included, is announced through one live region that is always present; the keyword or format name in a "not checked" warning is shown as code.
