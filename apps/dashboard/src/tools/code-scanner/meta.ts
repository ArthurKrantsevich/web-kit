import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "code-scanner",
  title: "Code Scanner",
  description: "Read QR codes from an image: file, drop or paste, decoded on your device.",
  preview: `ticket.png  640×480
QR Code · 25×25
https://example.com/t/42
corrected 0 of 10 · 28 ms`,
  category: "media",
  tags: ["qr", "qr code", "micro qr", "rmqr", "barcode", "scanner", "decoder", "reader", "image"],
  pkg: "@web-kit/code-scanner",
  usage: `import { CodeScanner } from "@web-kit/code-scanner";
import "@web-kit/code-scanner/styles.css";

export function Page() {
  return <CodeScanner />;
}

// Logic only, no React (a browser, a worker or Node):
import { scan } from "@web-kit/code-scanner/core";
import { qrFamily } from "@web-kit/code-scanner/qr";

const results = scan({ width, height, data, format: "rgba" }, { decoders: [qrFamily], tryHarder: true });
results[0]?.text; // "https://example.com/t/42"`,
  api: [
    {
      name: "scan",
      signature: "scan(image: ScanImage, { decoders, tryHarder?, multiple?, roi?, deadlineMs? }): ScanResult[]",
      description: "Decodes the codes in a gray or RGBA buffer with the given symbology decoders: a pyramid, a binarization cascade, Reed–Solomon with erasures and a piecewise grid. Empty when nothing is found; never throws on an image, only on a buffer of the wrong size.",
    },
    {
      name: "qrFamily",
      signature: 'import { qrFamily } from "@web-kit/code-scanner/qr"',
      description: "QR Code versions 1–40 (every level and mode, ECI, FNC1, structured append, mirrored and inverted), Micro QR M1–M4 and rMQR in all 32 sizes, from photos, screenshots and rotated or tilted images.",
    },
    {
      name: "ScanResult",
      signature: "{ symbology, text, bytes, segments, eci, charset, gs1, structuredAppend, points, orientation, mirrored, inverted, symbol, ecc, confidence }",
      description: "What a code says and how it was read: its corners in the image, its orientation, the error correction used and a confidence 0–1.",
    },
    {
      name: "createScanJobRunner",
      signature: 'import { createScanJobRunner } from "@web-kit/code-scanner"',
      description: "Scans frames in the package's Web Worker (./worker), one at a time; a newer waiting frame replaces an older one.",
    },
    {
      name: "CodeScanner",
      signature: "<CodeScanner initialSettings? className? />",
      description: "Ready-made UI: open, drop or paste an image (PNG, JPEG, WebP, GIF, BMP, SVG, up to 25 MB), Try harder and Multiple codes, the results of the session with Copy and Download; images and results never leave the device.",
    },
  ],
};
