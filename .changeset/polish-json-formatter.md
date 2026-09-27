---
"@web-kit/json-formatter": patch
---

Status line: a message on empty input is shown alone; Unescape says "Valid JSON" with stats when the unescaped text is JSON. A file that finishes reading after the input changed no longer overwrites it ("File not loaded: the input changed while reading"). Sizes are measured with json-core's `utf8Length`, the output only when its size is shown. Code line numbers meet 4.5:1 contrast.
