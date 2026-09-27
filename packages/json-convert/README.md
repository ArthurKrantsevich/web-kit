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

Good to know:

- YAML output follows YAML 1.2 and keeps number spelling. Older YAML 1.1 parsers (for example PyYAML) read numbers like `1e5` as strings.
- CSV cells are written exactly as the data says. Cells that start with `=`, `+`, `-` or `@` can be treated as formulas by spreadsheet apps; clean them before opening untrusted data in a spreadsheet.

```tsx
import { JsonConvert } from "@web-kit/json-convert";
import "@web-kit/json-convert/styles.css";

<JsonConvert initialTarget="typescript" />;
```

The component is an editor built with `@web-kit/ui`: JSON → YAML, CSV, XML or TypeScript, or CSV → JSON, input and output side by side from 1024 px of component width, Open file, Paste, Sample, Clear, Download (named by format), Copy and Swap direction between JSON and CSV. The status line claims only what was done: JSON → CSV output is read back and reported as "Reads back as N rows × M columns" (with "nested values are flattened" when objects or arrays became `a.b` columns or JSON cells), CSV → JSON says how many rows it made, and JSON → XML says it is one-way whenever XML is the target. The output is colored by format (keys, strings, numbers, `true`/`false`/`null`, punctuation; plain text above 200,000 characters) with the `--wk-syntax-*` colors of `@web-kit/tokens`. Set `--wk-editor-height` to change the pane height.

## License

MIT
