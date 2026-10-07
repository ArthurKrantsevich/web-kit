# @web-kit/code-scanner

Read QR Code, Micro QR and rMQR from an image, with every decoder written in the package: no ZXing, no native `BarcodeDetector`, no model files. Data Matrix, Aztec, PDF417, the linear symbologies and the camera follow in later releases.

> Not published to npm yet. The package name will change before the first release.

## Logic only (no React)

```ts
import { scan } from "@web-kit/code-scanner/core";
import { qrFamily } from "@web-kit/code-scanner/qr";

// Any RGBA or gray buffer: a canvas's ImageData, sharp's raw output in Node, a video frame.
const results = scan({ width, height, data, format: "rgba" }, { decoders: [qrFamily], tryHarder: true, multiple: true });
for (const r of results) console.log(r.symbology, r.text, r.points, r.ecc.corrected, r.confidence);
```

- `scan(image, options)` runs a gray pyramid, a cascade of binarizations (hybrid, Sauvola, Otsu, then the same inverted; with `tryHarder` also Wolf–Jolion, its inversion, edges, and a ×2 upscaled plane for tiny modules), and the decoders you pass, in that priority. The cascade also runs on a lighting-corrected plane: first, when the lighting is uneven (the frame's quarters differ in brightness); after the plain plane, with `tryHarder`; otherwise not at all. Contrast is stretched between the 0.05th and 99.95th percentiles first, so a small code on a plain background keeps its modules. It stops at the first code unless `multiple`, keeps its `deadlineMs` (40 by default, 500 with `tryHarder`) between steps, and merges a code found twice. It returns `[]` when there is nothing; it throws only on a buffer that does not fit `width × height`.
- `ScanResult`: `symbology`, `text`, `bytes`, `segments` (mode, bytes, ECI), `eci`, `charset`, `gs1`, `structuredAppend`, `points` (the symbol's corners in image pixels, in the symbol's own frame: top-left, top-right, bottom-right, bottom-left as the code is meant to be read, so a mirrored code runs counter-clockwise in the image), `orientation` (degrees 0–359, the angle of the top-left → top-right edge in the image), `mirrored`, `inverted`, `symbol` (rows, cols, version), `ecc` (level, capacity, corrected, erasures), `confidence` (0–1).
- `qrFamily` (`./qr`) decodes QR Code versions 1–40 at every level and mode (Numeric, Alphanumeric, Byte, Kanji, ECI, FNC1 first and second position, Structured Append), Micro QR M1–M4 and rMQR in all 32 sizes, from photos, screenshots and rotated, tilted, blurred, inverted or mirrored images. With `tryHarder` it also searches the finer pyramid levels when the start level holds nothing, so a small code in a large photo is found. Its tables are checked against zxing-cpp's writer in the tests, and its encoders (in `test/`, not shipped) make the same matrices as zxing-cpp for the same content and mask.
- `./core` also exports the pieces: `toGray`, the pyramid, the five binarizers with threshold and contrast maps, `GenericGF` over GF(2^m) and prime fields with `rsEncode` and `rsDecode` (erasures), `bchEncode`/`bchDecode`, homographies with a deterministic RANSAC, `piecewiseMap`, `sampleGrid` (a bit and a confidence per module), `ScanContext` and the `SymbologyDecoder` interface for your own symbology.
- Everything is deterministic: the same input gives the same result; there is no `Math.random`.

## Web Worker

```ts
import { createScanJobRunner } from "@web-kit/code-scanner";

const runner = createScanJobRunner(); // starts ./worker on first use
const { results, ms } = await runner.run({ image, symbologies: ["qr", "micro-qr", "rmqr"], tryHarder: false, multiple: false });
```

One frame runs at a time; a frame given while one runs waits, and a newer one replaces it (the replaced promise rejects with reason `"dropped"`). The frame's buffer is transferred, not copied. `cancel()` rejects the running frame, `dispose()` terminates the worker. A job takes `deadlineMs` too; the component gives a still image 500 ms in both modes.

## React component

```tsx
import { CodeScanner } from "@web-kit/code-scanner";
import "@web-kit/code-scanner/styles.css";

export function Page() {
  return <CodeScanner />;
}
```

Open an image (PNG, JPEG, WebP, GIF, BMP or SVG, up to 25 MB and 50 Mpx), drop it on the Image pane, paste it from the clipboard or try the sample; it is decoded in the worker and the results of the session are listed newest first, each with its symbology, text, time and Copy, a repeated code counting up. Try harder and Multiple codes rescan the open image; Ctrl+Enter scans it again. Download saves `scan-results.json`, More actions has `scan-results.csv` and the share link, which carries the two switches and nothing else; images and results never reach a link, storage or the console. `useCodeScanner()` gives the same state without markup; set `--wk-scanner-height` to change the height of the panes.

## Benchmark

`pnpm bench:fetch` downloads ZXing's black-box corpus (Apache-2.0, tag `zxing-3.5.3`, checked by SHA-256) into `bench/.corpus/` (never committed); `pnpm bench` runs its QR categories at four rotations and the generated stress corpus against zxing-cpp (`zxing-wasm`), both sides in the same mode, and `pnpm bench:report` writes `docs/bench/code-scanner.md`. With the corpus cached, `pnpm test` runs a shortened benchmark as a test. `zxing-wasm` and `sharp` are devDependencies of the benchmark and the tests only.

## Entries and sizes

| Entry | Holds | Brotli |
|---|---|---|
| `.` | `CodeScanner`, `useCodeScanner`, the worker runner, and `./core` again | — |
| `./core` | types, image, binarizers, Reed–Solomon, BCH, geometry, sampling, `scan` | 7 kB |
| `./qr` | the QR family (imports `./core`) | 13.5 kB |
| `./worker` | the worker script (imports `./qr`; size-limit measures the file alone) | 0.5 kB |
| `./styles.css` | the component's styles over `@web-kit/ui`'s | — |

## License

MIT
