# @web-kit/json-formatter

Format, minify and validate JSON in the browser. Errors point to the exact line and column. Numbers, key order and duplicate keys stay exactly as written.

> Not published to npm yet. The package name will change before the first release.

## Logic only (no React)

```ts
import { formatJson, minifyJson, validateJson } from "@web-kit/json-formatter/core";

const result = formatJson('{"a":1}', { indent: 2 });
if (result.ok) console.log(result.value);
else console.error(`Line ${result.error.line}, column ${result.error.column}: ${result.error.message}`);
```

## React component

```tsx
import { JsonFormatter } from "@web-kit/json-formatter";
import "@web-kit/json-formatter/styles.css";

export function Page() {
  return <JsonFormatter initialInput='{"hello":"world"}' />;
}
```

## Errors and fixes

```ts
import { codeFrame, repairJson, suggestFixes, validateJson } from "@web-kit/json-formatter/core";

const error = validateJson("{a: 1,}");
if (error) console.log(codeFrame("{a: 1,}", error));

suggestFixes("[1,2,]"); // [{ rule: "trailing-comma", description: "Remove trailing comma", text: "[1,2]" }]
repairJson("{a: 1, b: [True,]}"); // { ok: true, value: '{"a": 1, "b": [true]}', changes: [...] }
```

Every suggestion comes from a fixed rule (trailing or missing commas, comments, single or curly quotes, unquoted keys, Python literals, raw line breaks, unclosed brackets) and is re-checked by the validator before it is offered. If no rule provably helps, you get the error and no suggestion.

## Headless hook

```tsx
import { useJsonFormatter } from "@web-kit/json-formatter";

const { input, setInput, mode, setMode, indent, setIndent, result } = useJsonFormatter();
```

In React Server Components, import functions from `/core`: the main entry is a client module.

## Theming

The default styles use CSS variables: `--wk-fg`, `--wk-muted`, `--wk-surface`, `--wk-border`, `--wk-accent`, `--wk-accent-fg`, `--wk-danger`, `--wk-radius`, `--wk-font-sans`, `--wk-font-mono`.

## License

MIT
