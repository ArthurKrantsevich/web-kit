---
"@web-kit/ui": minor
"@web-kit/tokens": minor
"@web-kit/json-formatter": minor
"@web-kit/json-convert": minor
"@web-kit/json-diff": minor
"@web-kit/json-schema-validator": minor
---

One look for the actions every tool shares. `@web-kit/ui` adds `ACTIONS` (label, icon, tooltip template, place and order of Open file, Paste, the tool's own action, Download, Copy, Sample, Clear and More actions), `ActionButton`, `actionTooltip` and `EmptyState`; `OpenFileButton` and `PasteButton` show their label and take an `aria-label` and tooltip `words`; Paste keeps its place hidden until the clipboard can be read; `CopyButton` gets an `icon` option; `EditorPane` gets `kind`; `FileDrop` exposes `accept` and `maxBytes`; scrolling areas get thin scrollbars; toolbar fields are 8 to 12 rem wide. `@web-kit/tokens` adds `--wk-scrollbar` and `--wk-scrollbar-hover`. In every tool Open file and Paste sit in each input's header, Download and Copy in the output's, with labels; empty results use `EmptyState`; option fields take at most 64 characters.
