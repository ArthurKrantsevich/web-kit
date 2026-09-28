<div align="center">

# web-kit

**Small, careful web utilities as React + TypeScript packages. Everything runs in your browser.**

[![Deploy](https://github.com/ArthurKrantsevich/web-kit/actions/workflows/deploy.yml/badge.svg)](https://github.com/ArthurKrantsevich/web-kit/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspace-f69220?logo=pnpm&logoColor=white)

[**Live demo**](https://arthurkrantsevich.github.io/web-kit/) · [Flutter version](https://github.com/ArthurKrantsevich/flutter-kit) · [Русский](README.ru.md)

</div>

---

## What is this

`web-kit` is a collection of small tools for everyday work with data. Each tool is its own package (not on npm yet, see Status): you can use only its logic, which needs no React and no DOM, or the logic together with a ready-made React UI. The [live demo](https://arthurkrantsevich.github.io/web-kit/) runs every tool.

The same tools are planned for Flutter in [flutter-kit](https://github.com/ArthurKrantsevich/flutter-kit). The two collections share the design, not the code.

**No backend.** All processing happens on your device. Files and text are never uploaded.

## Status

Eight tools are ready: four for JSON, Text Compare, and the UUID, password and hash generators. They share one interface through `@web-kit/ui`. Seven more tools are planned. The packages are not published to npm yet: the scope `@web-kit` is a working name and will be chosen before the first release.

## Utilities

### Ready

| Utility | Package | What it does |
|---|---|---|
| [JSON Formatter](https://arthurkrantsevich.github.io/web-kit/tools/json-formatter/) | `@web-kit/json-formatter` | Format with 2 spaces, 4 spaces or tabs, minify, sort keys, escape and unescape. Errors with the exact line and column and a code frame; fixes offered only after they were checked (trailing and missing commas, comments, single and curly quotes, unquoted keys, Python literals, unclosed brackets), and "Fix all". Highlighted text or a tree with search and JSONPath (RFC 9535 subset), paths and copy; stats. Inputs over 1 MB are formatted in a Web Worker. |
| [JSON Convert](https://arthurkrantsevich.github.io/web-kit/tools/json-convert/) | `@web-kit/json-convert` | JSON to YAML 1.2, CSV, XML or TypeScript interfaces, and CSV to JSON. Numbers keep their spelling; CSV output is read back to show how many rows and columns survive; the output is colored by format. |
| [JSON Diff](https://arthurkrantsevich.github.io/web-kit/tools/json-diff/) | `@web-kit/json-diff` | Every change with its path and the old and new value as written; arrays by index or matched by a key; numbers by value or as written; click a change to select it in the input; JSON Patch (RFC 6902) to copy or download. |
| [JSON Schema Validator](https://arthurkrantsevich.github.io/web-kit/tools/json-schema-validator/) | `@web-kit/json-schema-validator` | Draft 2020-12: every error with its path in the data and in the schema, exact numbers, keywords it does not check reported as warnings (never a silent "valid"), a schema generated from the data. Tested against the official JSON Schema Test Suite. |
| [Text Compare](https://arthurkrantsevich.github.io/web-kit/tools/text-compare/) | `@web-kit/text-compare` | Two texts or files side by side or in one column, by line, word or character; whitespace, case, blank lines and line endings ignored on request; changes copied to the other side; a unified diff for `git apply`. Described below. |
| [UUID Generator](https://arthurkrantsevich.github.io/web-kit/tools/uuid-generator/) | `@web-kit/uuid-generator` | UUID v1, v3, v4, v5, v6 and v7, Nil and Max, ULID and NanoID, up to 1,000 at a time, as lines or JSON; Inspect reads the version, variant and time of any UUID or ULID. Described below. |
| [Password Generator](https://arthurkrantsevich.github.io/web-kit/tools/password-generator/) | `@web-kit/password-generator` | Passwords of characters, passphrases from the EFF word list, pronounceable passwords and PINs, with their exact entropy, strength and time to crack; never saved or shared. Described below. |
| [Hash Generator](https://arthurkrantsevich.github.io/web-kit/tools/hash-generator/) | `@web-kit/hash-generator` | MD5, SHA-1, SHA-2, SHA-3, BLAKE2, BLAKE3, RIPEMD-160, CRC32 and CRC32C of a text or a file up to 512 MB, HMAC, and Verify for a checksum you were given. Described below. |

Shared packages: `@web-kit/json-core` (a lossless JSON parser and AST, fixes, paths, exact number comparison, a worker for large inputs) and `@web-kit/ui` (the editor layout, buttons, menus, dialogs and the convenience features below).

### Planned

| Utility | Category | What it will do |
|---|---|---|
| Base64 | data | Encode and decode text and files, with correct UTF-8. |
| URL Encoder | data | Encode and decode URLs and their parts; take a query string apart. |
| JWT Decoder | data | Show the header and payload and when the token expires. The signature is not checked, and the tool says so. |
| QR Code Generator | generators | Text or a link to a QR code, saved as PNG or SVG. |
| Palette Generator | generators | A palette from one color, with WCAG contrast checks. |
| Image Converter | media | PNG, JPG and WebP, resizing and quality. |
| Video Player | media | Speed control, VTT subtitles, keyboard shortcuts, picture-in-picture. |

#### Text Compare

[`text-compare`](https://arthurkrantsevich.github.io/web-kit/tools/text-compare/), in the data category, compares two texts or two files:

- side by side, in two columns that scroll together, or in one column with removed lines above added ones;
- changed lines paired and their changed words or characters highlighted (an emoji or an accented letter is never cut);
- options to ignore whitespace (as `git diff -w`), case, blank lines and line endings; the result says when texts are identical only because of them;
- unchanged runs folded to three lines of context, Previous and Next change (Alt+↑/↓, F7), and at most 5,000 rows drawn at once;
- "Use left" and "Use right" copy a change to the other side, and Ctrl+Z in that input undoes it. The exception is a side opened from a file with CRLF or CR line breaks: a text field keeps only LF, so such a side is replaced as a whole to keep its line endings, and Ctrl+Z cannot undo that merge;
- counts (+ added, − removed, ~ changed lines) and a unified diff to copy or download as `compare.patch`, with the file names. It always applies to Left with `git apply` or `patch`. With nothing ignored it gives Right exactly; with ignore options on it gives Right apart from the ignored differences (unchanged lines keep Left's spacing, case or line endings). It matches `git diff --no-index -U3` on the recorded examples, except that for `-w` git takes context lines from the right file;
- notes on different line endings and a missing line break at the end; files opened or dropped on a side, up to 10 MB; texts over 1 MB compared in a Web Worker.

#### UUID Generator

[`uuid-generator`](https://arthurkrantsevich.github.io/web-kit/tools/uuid-generator/), in the generators category, makes IDs and reads them:

- UUID v4 (random), v7 (Unix milliseconds, a 12-bit counter and random bits: strictly increasing on one page, even within one millisecond), v1 and v6 (Gregorian time with a random node that has the multicast bit set, never your MAC address), v3 and v5 (MD5 or SHA-1 of the DNS, URL, OID or X.500 namespace, or your own, and a name: each UUID beside its name, empty lines skipped), Nil and Max; ULID (monotonic within a millisecond) and NanoID (your size and alphabet, without bias);
- 1 to 1,000 at a time, in lower or upper case, with or without hyphens, in braces or as a URN, one per line or as a JSON array; Copy, and Download as `uuids.txt` or `uuids.json`; Ctrl+Enter makes new ones;
- Inspect takes any spelling of a UUID or a ULID and shows its version, variant, time (to 100 ns for v1 and v6), clock sequence and node, or the ULID's time and the same 128 bits as a UUID; it says why an ID cannot be read (its length, a wrong character, an unknown version);
- randomness only from `crypto.getRandomValues`; the RFC 9562 test vectors pass. A share link and the saved input keep the settings, never the IDs.

#### Password Generator

[`password-generator`](https://arthurkrantsevich.github.io/web-kit/tools/password-generator/), in the generators category, makes one to 50 at a time:

- **Characters**: 4 to 128 of lowercase, uppercase, digits and the 32 ASCII symbols, without look-alikes (`Il1O0o`) or characters you exclude; Require each redraws a password until it has every chosen set, so all allowed passwords stay equally likely;
- **Words**: 3 to 12 words of the EFF large wordlist (7,776 words; loaded only when you choose Words), with a separator, capitals and a digit;
- **Memorable**: groups of syllables you can say, such as `Bolanu-Tekiro-Vasemi`;
- **PIN**: 4 to 12 digits, without repeated digits, runs such as 1234, repeated pairs or years;
- the exact entropy of the chosen way (counted, not estimated), the strength and the average time to crack at 10¹⁰ guesses per second; Copy each or all, Download as `passwords.txt`, Clear forgets them.

Passwords come only from `crypto.getRandomValues` without modulo bias. They are never put into a share link, the saved input or the console: those keep the settings only.

#### Hash Generator

[`hash-generator`](https://arthurkrantsevich.github.io/web-kit/tools/hash-generator/), in the generators category, hashes a text or a file:

- MD5, SHA-1, SHA-256, SHA-384, SHA-512 and CRC32 at once; More algorithms adds SHA-224, SHA-512/256, SHA3-224/256/384/512, BLAKE2b-512, BLAKE2s-256, BLAKE3-256, RIPEMD-160 and CRC32C (loaded only then);
- hex, HEX, Base64 or Base64url; Copy each value, or Copy and Download all as `hashes.txt`, one BSD tagged line per algorithm (`SHA256 (file) = …`) that `cksum -c` and `sha256sum -c` check, HMACs left out;
- HMAC with SHA-1 or SHA-2 and a key as text or hex; the key is never saved or shared;
- Verify: paste a checksum (hex, Base64, with a `sha256:` or SRI `sha256-` prefix, or a whole `sha256sum` or BSD line, as in `hashes.txt`) and the matching row lights up; when none matches but More algorithms has one of that length, it offers to check them;
- files up to 512 MB (and texts over 1 MB) are read in 4 MB parts by a few Web Workers at once, with progress; a new file or Clear cancels the work. Every algorithm passes its official test vectors.

## Convenience in every tool

- **Files.** Open file or drop a file on an input (UTF-8, byte order mark removed, up to 10 MB), and Download the result with a name that fits it (`formatted.json`, `converted.yaml`, `patch.json`, `schema.json`, `compare.patch`, `uuids.txt`, `passwords.txt`, `hashes.txt`). Hash Generator opens any file up to 512 MB.
- **Load from URL.** The browser fetches the address directly: `http:` and `https:` only, no cookies, up to 10 MB. The server must allow reading from other sites (CORS); nothing goes through a proxy.
- **Share link.** The input and the options are compressed into the part of the link after `#`, which browsers never send to a server. Anyone with the link can see the data; the tool warns when a link is longer than messengers usually keep.
- **Saved input.** Off by default. Turned on, the input is kept in this browser's storage for that tool until you turn it off or clear it.
- **Keyboard shortcuts.** Ctrl+Enter (⌘+Enter on a Mac) formats in the formatter, swaps direction in the converter (JSON → CSV and CSV → JSON), swaps Left and Right in the diff and in Text Compare, and generates a schema from the data in the validator; the formatter also has Ctrl+Shift+M (minify) and Ctrl+Shift+F (fix all), and Text Compare F7/Shift+F7 and, outside the text fields, Alt+↓/Alt+↑ (next and previous change); Ctrl+Z in a field does not undo Text Compare's swap. In the UUID and password generators Ctrl+Enter makes new ones. `?` shows the list. Browser shortcuts are left alone.
- **Large inputs.** The formatter works on inputs over 1 MB, and Text Compare on texts over 1 MB together, in a Web Worker, so the page stays responsive, and each says so while it works. Hash Generator reads files in parts in several workers at once and shows its progress.
- **One interface.** The same actions look the same in every tool: Open file and Paste in the header of each input, Download and Copy in the header of the output, Sample, Clear and "More actions" in the toolbar. Every button has a tooltip that says what it will do, and nothing moves when a label changes or the page finishes loading.
- **Light and dark themes**, following the system until you choose.

## Privacy

There is no backend, no account and no analytics. The site is static files on GitHub Pages. Your text and files are processed in your browser. Generated passwords, IDs and HMAC keys are never saved, put into a link or logged. The only network requests with your data are the ones you ask for: Load from URL fetches that address from your browser, without cookies. A share link keeps the data in the link itself.

## Using the packages

Every tool is one package with two entry points:

```ts
// Logic only. No React needed: works in Node, workers, any framework.
import { formatJson, suggestFixes } from "@web-kit/json-formatter/core";

// Logic + React UI.
import { JsonFormatter, useJsonFormatter } from "@web-kit/json-formatter";
import "@web-kit/json-formatter/styles.css";
```

- ESM only, with types; React is an optional peer dependency, so `/core` works without it.
- Functions return `{ ok: true, value }` or `{ ok: false, error }` instead of throwing on bad input.
- One CSS file per tool, built on CSS variables (`--wk-*` from `@web-kit/tokens`) that you can override. The shared styles sit in the `wk-ui` cascade layer, so your own rules win.
- The React UI works in the Next.js App Router: the UI entry keeps its `"use client"` directive.

See each package's README for its API: [json-core](packages/json-core), [json-formatter](packages/json-formatter), [json-convert](packages/json-convert), [json-diff](packages/json-diff), [json-schema-validator](packages/json-schema-validator), [text-compare](packages/text-compare), [uuid-generator](packages/uuid-generator), [password-generator](packages/password-generator), [hash-generator](packages/hash-generator), [ui](packages/ui).

## Repository layout

```
apps/
  dashboard/          Next.js showcase, static export to GitHub Pages
packages/
  json-core/          lossless JSON parser, AST, fixes, worker
  ui/                 shared React pieces of every tool
  tokens/             design tokens (CSS variables) and the contrast check
  json-formatter/     one package per tool: src/core (no React) and src/ui
  json-convert/
  json-diff/
  json-schema-validator/
  text-compare/       its core also has a worker entry for large texts
  uuid-generator/
  password-generator/ also a wordlist entry (the EFF large wordlist)
  hash-generator/     also an extra entry (more algorithms) and a worker entry
tooling/scripts/      build and package checks
turbo/generators/     the template of `pnpm turbo gen utility`
.github/workflows/    build, check and deploy
```

## Development

Requirements: Node 22+, pnpm (enabled through `corepack`).

```bash
corepack enable
pnpm install
pnpm --filter @web-kit/dashboard dev   # dev server at http://localhost:3000/web-kit
pnpm verify                            # typecheck, unit tests, package checks, e2e
pnpm test:generator                    # generates a throwaway tool and runs every check on it
```

`pnpm verify` runs, for every package, TypeScript, Vitest with Testing Library, publint, @arethetypeswrong, size-limit and a check that `/core` imports no React and no source uses `Math.random`; for the dashboard, Vitest unit tests (the catalog and the registry), a check of the static export and the Playwright tests; and a WCAG contrast check of the tokens in both themes. The e2e tests serve the export on port 4173; set `PORT` to use another.

### Add a utility

```bash
pnpm turbo gen utility
```

The generator creates `packages/<id>` (core, React UI, tests) and registers its page in the dashboard.

Every push to `main` runs `pnpm verify`, builds the dashboard and deploys it to GitHub Pages.

## License

[MIT](LICENSE) © Arthur Krantsevich. The EFF large wordlist in `@web-kit/password-generator` is by the Electronic Frontier Foundation, under CC BY 3.0 US (https://www.eff.org/dice).
