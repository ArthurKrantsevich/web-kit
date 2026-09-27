---
"@web-kit/ui": minor
"@web-kit/json-core": minor
"@web-kit/json-formatter": minor
"@web-kit/json-convert": minor
"@web-kit/json-diff": minor
"@web-kit/json-schema-validator": minor
---

Convenience for every tool. `@web-kit/ui` adds drag and drop of files (`useFileDrop`), loading from a URL (`loadFromUrl`: http and https only, no cookies, size limit while streaming), share links with the data compressed into the hash (`useShareHash`), saving the input in the browser (`usePersistentState`, off by default), keyboard shortcuts (`useHotkeys`), `Menu`, `Dialog` and `ToolMenu`, which puts them together in a "More actions" menu. `@web-kit/json-core` adds the worker entry `@web-kit/json-core/worker` and `@web-kit/json-core/worker-client`; JSON Formatter formats inputs over 1 MB there. JSON Convert colors its output by format. JsonTree's buttons have tooltips and fixed widths; `CopyButton` takes a function and a `disabled` flag.
