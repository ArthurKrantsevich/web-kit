---
"@web-kit/code-scanner": minor
---

New package: a code scanner with its own decoders. `./core` has the image pyramid, five binarizers, Reed–Solomon with erasures over any Galois field, BCH, homographies and the `scan` pipeline; `./qr` decodes QR Code (versions 1–40, every level and mode), Micro QR M1–M4 and rMQR in all 32 sizes from photos, screenshots and rotated or tilted images; `./worker` scans frames off the main thread; `CodeScanner` reads an opened, dropped or pasted image and lists the results. A benchmark harness runs ZXing's black-box corpus and a stress corpus against zxing-cpp.
