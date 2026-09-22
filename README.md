<div align="center">

# web-kit

**Small, useful web utilities as React + TypeScript packages. Everything runs in your browser.**

[![Deploy](https://github.com/ArthurKrantsevich/web-kit/actions/workflows/deploy.yml/badge.svg)](https://github.com/ArthurKrantsevich/web-kit/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspace-f69220?logo=pnpm&logoColor=white)

[**Live demo**](https://arthurkrantsevich.github.io/web-kit/) · [Flutter version](https://github.com/ArthurKrantsevich/flutter-kit) · [Русский](README.ru.md)

</div>

---

## What is this

`web-kit` is a collection of small tools for the web: formatters, converters, generators, a video player and more. Each tool is its own npm package. You can use only its logic, or the logic together with a ready-made React UI.

The same tools also exist in Flutter: [flutter-kit](https://github.com/ArthurKrantsevich/flutter-kit). Both collections have the same features and a similar look, but they share no code.

**No backend.** All processing happens on the user's device. Files and text never leave the browser.

## Status

> Early stage. The monorepo, the dashboard and the deploy pipeline are ready. The first utilities are in progress.

## Utilities

| Utility | Category | Status |
|---|---|---|
| JSON formatter | data | planned |
| Base64 encode/decode | data | planned |
| URL encode/decode | data | planned |
| JWT decoder | data | planned |
| UUID generator (v4, v7) | generators | planned |
| Password generator | generators | planned |
| Hash generator (SHA, MD5) | generators | planned |
| QR code generator | generators | planned |
| Color palette generator | generators | planned |
| Image converter | media | planned |
| Video player | media | planned |

## How a package will look

Every utility is one package with two entry points:

```ts
// Logic only. No React needed: works in Node, workers, any framework.
import { format } from '@scope/json-formatter/core'

// Logic + React UI.
import { JsonFormatter, useJsonFormatter } from '@scope/json-formatter'
import '@scope/json-formatter/styles.css'
```

Packages are ESM-only, typed, and styled with CSS variables you can override. The npm scope will be chosen before the first release.

## Repository layout

```
apps/
  dashboard/        Next.js showcase, static export to GitHub Pages
packages/           one package per utility (coming soon)
.github/workflows/  build, check and deploy
```

## Development

Requirements: Node 22+, pnpm (enabled through `corepack`).

```bash
corepack enable
pnpm install
pnpm --filter @web-kit/dashboard dev   # dev server at http://localhost:3000/web-kit
pnpm check                              # build everything and verify the static export
```

Every push to `main` builds the dashboard and deploys it to GitHub Pages.

## License

[MIT](LICENSE) © Arthur Krantsevich
