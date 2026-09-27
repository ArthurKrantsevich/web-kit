---
"@web-kit/json-diff": patch
---

Change rows have accessible names such as "Changed $.b: 2 → 3". The result ("No differences", "3 changes", a parse error) is announced through one live region that is always present. Copy JSON Patch and Download are disabled while the result lags behind the text. `applyJsonPatch` rejects a `~` not followed by `0` or `1` in a path, and a `move` onto its own path (the root included) is a no-op.
