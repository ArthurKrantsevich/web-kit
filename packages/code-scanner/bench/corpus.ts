// The cached ZXing corpus as ScanImages. Decoding PNG/JPEG/GIF needs sharp (a devDependency); the corpus itself is
// never committed and never needed by CI.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { ScanImage } from "../src/core/types";

export const CORPUS_ROOT: string = join(fileURLToPath(new URL("./", import.meta.url)), ".corpus", "blackbox");
export const QR_CATEGORIES: readonly string[] = ["qrcode-1", "qrcode-2", "qrcode-3", "qrcode-4", "qrcode-5", "qrcode-6"];
export const FALSE_POSITIVE_CATEGORIES: readonly string[] = ["falsepositives", "falsepositives-2"];

export function corpusAvailable(): boolean {
  return existsSync(join(CORPUS_ROOT, "qrcode-1"));
}

export interface CorpusImage {
  category: string;
  name: string;
  image: ScanImage;
  /** The text the black-box test expects, or null for a false-positive image. */
  expected: string | null;
}

/** The images of a category (sorted by name, the first `limit`), decoded to RGBA. */
export async function loadCategory(category: string, limit: number = Infinity): Promise<CorpusImage[]> {
  const dir = join(CORPUS_ROOT, category);
  const files = readdirSync(dir).filter((f) => /\.(png|jpe?g|gif)$/i.test(f)).sort().slice(0, limit);
  const out: CorpusImage[] = [];
  for (const file of files) {
    const base = file.replace(/\.[^.]+$/, ""), txt = join(dir, `${base}.txt`), bin = join(dir, `${base}.bin`);
    const expected = existsSync(txt) ? readFileSync(txt, "utf8") : existsSync(bin) ? new TextDecoder("iso-8859-1").decode(readFileSync(bin)) : null;
    const { data, info } = await sharp(join(dir, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    out.push({ category, name: file, image: { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), format: "rgba" }, expected });
  }
  return out;
}

/** The image turned by `quarterTurns` × 90° clockwise, as the black-box tests do. */
export function rotated(image: ScanImage, quarterTurns: number): ScanImage {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return image;
  const channels = image.format === "rgba" ? 4 : 1, w = image.width, h = image.height;
  const ow = turns % 2 === 0 ? w : h, oh = turns % 2 === 0 ? h : w;
  const out = image.format === "rgba" ? new Uint8ClampedArray(ow * oh * 4) : new Uint8Array(ow * oh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [nx, ny] = turns === 1 ? [h - 1 - y, x] : turns === 2 ? [w - 1 - x, h - 1 - y] : [y, w - 1 - x];
      for (let c = 0; c < channels; c++) out[(ny * ow + nx) * channels + c] = image.data[(y * w + x) * channels + c]!;
    }
  }
  return { width: ow, height: oh, data: out, format: image.format };
}
