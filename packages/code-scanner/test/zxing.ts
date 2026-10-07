// zxing-wasm (zxing-cpp) in Node, for cross-checks and the benchmark: the wasm file is read from node_modules.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { prepareZXingModule, readBarcodes, writeBarcode, type BarcodeSymbol, type ReadInputBarcodeFormat, type ReadResult, type WriteInputBarcodeFormat } from "zxing-wasm/full";
import type { ScanImage } from "../src/core/types";
import { BitMatrix } from "../src/qr/layout";

let prepared = false;

export interface Zxing {
  /** The module matrix zxing-cpp writes for a text (null when it cannot, e.g. the text does not fit the version). */
  write(text: string, format: WriteInputBarcodeFormat, options?: string): Promise<BitMatrix | null>;
  read(image: ScanImage, formats?: ReadInputBarcodeFormat[]): Promise<ReadResult[]>;
}

export async function zxing(): Promise<Zxing> {
  if (!prepared) {
    const require = createRequire(import.meta.url);
    const wasm = readFileSync(require.resolve("zxing-wasm/full/zxing_full.wasm"));
    prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer } });
    prepared = true;
  }
  return {
    async write(text, format, options = "") {
      const result = await writeBarcode(text, { format, options, addQuietZones: false, scale: 1 });
      return result.error ? null : matrixFromSymbol(result.symbol);
    },
    async read(image, formats = ["QRCode"]) {
      if (image.format !== "rgba") throw new Error("zxing-wasm reads RGBA");
      return readBarcodes({ data: image.data as Uint8ClampedArray<ArrayBuffer>, width: image.width, height: image.height, colorSpace: "srgb" }, { formats, tryHarder: true, tryInvert: true, tryRotate: true });
    },
  };
}

/** zxing's symbol (0 = dark) as a BitMatrix (1 = dark). */
export function matrixFromSymbol(symbol: BarcodeSymbol): BitMatrix {
  const m = new BitMatrix(symbol.width, symbol.height);
  for (let i = 0; i < symbol.data.length; i++) m.bits[i] = symbol.data[i] === 0 ? 1 : 0;
  return m;
}

/** A plain RGBA raster of a matrix: `module` px per module, `quiet` modules of white around it. */
export function rgbaFromMatrix(matrix: BitMatrix, module: number, quiet: number): ScanImage {
  const width = (matrix.width + 2 * quiet) * module, height = (matrix.height + 2 * quiet) * module, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mx = Math.floor(x / module) - quiet, my = Math.floor(y / module) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < matrix.width && my < matrix.height && matrix.get(mx, my);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = dark ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return { width, height, data, format: "rgba" };
}
