# @web-kit/json-core

Lossless JSON tooling with no dependencies and no UI: a parser that reports exact error positions, an AST that keeps numbers and strings exactly as written, verified fix suggestions, code frames, paths and exact number comparison.

> Not published to npm yet. The package name will change before the first release.

```ts
import { parseJson, printJson, formatPath, pathOf, getStats, compareNumbers } from "@web-kit/json-core";

const result = parseJson('{"b": 12345678901234567890, "a": 1}');
if (result.ok) {
  printJson(result.value, { sortKeys: true }); // {"a": 1, "b": 12345678901234567890}, nothing rounded
}
```

Used by `@web-kit/json-formatter` and the other JSON tools in web-kit.

## License

MIT
