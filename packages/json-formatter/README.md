# @web-kit/json-formatter

Format, minify and validate JSON in the browser. Errors point to the exact line and column. Numbers, key order and duplicate keys stay exactly as written.

> Not published to npm yet. The package name will change before the first release.

The logic lives in [`@web-kit/json-core`](../json-core); `@web-kit/json-formatter/core` re-exports the functions below.

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

## Sort keys, Escape, Unescape

- **Sort keys** (Format and Minify): recursive, by code point, stable for duplicate keys; numbers and strings keep their exact spelling.
- **Escape**: any text → a JSON string literal, ready to paste into code or config.
- **Unescape**: a JSON string → its text. If the text is JSON, it is shown formatted. Escaped JSON pasted without the outer quotes (`{\"a\":1}`) is accepted only when it decodes to valid JSON, and the UI says so.

```ts
import { escapeJson, unescapeJson, parseJson, printJson } from "@web-kit/json-formatter";

escapeJson('{"a":1}'); // "{\"a\":1}"
unescapeJson('"{\\"a\\":1}"'); // { ok: true, value: { text: '{"a":1}', isJson: true, wrapped: false } }
```

## Tree, highlighting and stats

`JsonFormatter` has a Text | Tree switch and a stats line. The pieces are also exported on their own:

```tsx
import { parseJson, getStats, JsonTree, HighlightedJson, JsonStats } from "@web-kit/json-formatter";

const parsed = parseJson(text);
if (parsed.ok) {
  <JsonTree root={parsed.value} source={text} />;
  <JsonStats stats={getStats(parsed.value, text)} />;
}
<HighlightedJson text={formatted} />;
```

The tree is keyboard accessible (arrows, Home/End, Enter), shows the path of the selected node, copies paths and values, pages large arrays by 500, and stops "Expand all" at 5 000 rows. Syntax colors: `--wk-syntax-key`, `--wk-syntax-string`, `--wk-syntax-number`, `--wk-syntax-literal`, `--wk-syntax-punct`.

## Theming

The default styles use CSS variables: `--wk-fg`, `--wk-muted`, `--wk-surface`, `--wk-border`, `--wk-accent`, `--wk-accent-fg`, `--wk-danger`, `--wk-radius`, `--wk-font-sans`, `--wk-font-mono`.

## License

MIT
