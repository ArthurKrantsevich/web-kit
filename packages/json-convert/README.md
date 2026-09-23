# @web-kit/json-convert

Convert JSON to YAML, CSV, XML and TypeScript, and CSV to JSON — in the browser, with numbers kept exactly as written.

> Not published to npm yet. The package name will change before the first release.

```ts
import { toYaml, toCsv, fromCsv, toXml, toTypeScript } from "@web-kit/json-convert/core";

toYaml('{"a":[1,2]}');                       // { ok: true, value: "a:\n  - 1\n  - 2\n" }
toCsv('[{"a":1,"b":{"c":2}}]');              // "a,b.c\r\n1,2\r\n"
fromCsv("n\n1", { inferTypes: true });       // '[\n  {\n    "n": 1\n  }\n]'
toXml("[1]", { rootName: "list" });
toTypeScript('{"users":[{"id":1}]}');         // export interface Root { users: User[]; } …
```

Every function returns `{ ok: true, value }` or `{ ok: false, error }`; errors carry a line/column for syntax problems or a JSON path for values that cannot be converted (for example two fields that would share one CSV column).

How the results are checked in tests: YAML is parsed back with an independent YAML parser; CSV round-trips through `fromCsv`; generated TypeScript is compiled with `tsc` together with the data it came from.

JSON → XML is one-way: XML has no arrays or types.

```tsx
import { JsonConvert } from "@web-kit/json-convert";
import "@web-kit/json-convert/styles.css";

<JsonConvert initialTarget="typescript" />;
```

## License

MIT
