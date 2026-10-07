// The stress corpus (spec §7): QR-family symbols from the test encoders under the spec's distortions, seeded, so the
// benchmark and its test see the same images.
import { xorshift } from "../src/core/geometry";
import type { ScanImage } from "../src/core/types";
import { encodeSymbol, segmentsFor } from "../test/encoders/qr";
import { blur, compose, contrast, cylinder, damage, glare, gradientLight, invert, noise, rasterize, toRgba } from "./distort";

export interface StressCase {
  id: string;
  category: string;
  image: ScanImage;
  /** Every text the image holds. */
  expected: string[];
}

export function stressCorpus(seed: number = 1): StressCase[] {
  const rnd = xorshift(seed), out: StressCase[] = [];
  const word = (i: number): string => `stress-${seed}-${i}-${Math.floor(rnd() * 1e6)}`;
  const qr = (text: string, version = 3, level: "L" | "M" | "Q" | "H" = "M") => encodeSymbol("qr", version, level, segmentsFor(text))!.matrix;
  const add = (category: string, i: number, image: ScanImage, expected: string[]): void => { out.push({ id: `${category}-${i}`, category, image, expected }); };
  for (let i = 0; i < 24; i++) { const t = word(i); add("rotation", i, toRgba(rasterize(qr(t), { module: 4 + (i % 4), rotate: i * 15 })), [t]); }
  for (let i = 0; i < 8; i++) { const t = word(100 + i); add("perspective", i, toRgba(rasterize(qr(t), { module: 6, rotate: i * 40, tilt: 0.15 + 0.05 * i })), [t]); }
  for (let i = 0; i < 6; i++) { const t = word(200 + i); add("blur", i, toRgba(blur(rasterize(qr(t), { module: 6 }), 0.5 + 0.4 * i)), [t]); }
  for (let i = 0; i < 6; i++) { const t = word(300 + i); add("noise", i, toRgba(noise(rasterize(qr(t), { module: 5 }), 5 + 5 * i, seed + i)), [t]); }
  for (let i = 0; i < 4; i++) { const t = word(400 + i); add("contrast", i, toRgba(contrast(rasterize(qr(t), { module: 5 }), 0.15 + 0.1 * i)), [t]); }
  for (let i = 0; i < 4; i++) { const t = word(500 + i); add("gradient", i, toRgba(gradientLight(rasterize(qr(t), { module: 5 }), 0.4 + 0.15 * i)), [t]); }
  for (let i = 0; i < 4; i++) { const t = word(600 + i), r = rasterize(qr(t), { module: 6 }); add("glare", i, toRgba(glare(r, r.width * (0.3 + 0.15 * i), r.height * 0.4, r.width * 0.25, 0.9)), [t]); }
  for (let i = 0; i < 6; i++) { const t = word(700 + i), r = rasterize(qr(t, 5, "H"), { module: 6 }); add("damage", i, toRgba(damage(r, r.corners, 0.04 + 0.03 * i, seed + i)), [t]); }
  for (let i = 0; i < 3; i++) { const t = word(800 + i); add("inverted", i, toRgba(invert(rasterize(qr(t), { module: 5, rotate: i * 30 }))), [t]); }
  for (let i = 0; i < 3; i++) { const t = word(900 + i); add("mirrored", i, toRgba(rasterize(qr(t).transposed(), { module: 5, rotate: i * 30 })), [t]); }
  for (let i = 0; i < 3; i++) { const t = word(1000 + i), m = qr(t, 10), r = rasterize(m, { module: 4, quiet: 6 }); add("cylinder", i, toRgba(cylinder(r, (1.5 + i) * (m.width + 12) * 4)), [t]); }
  for (let i = 0; i < 4; i++) { const t = word(1100 + i); add("tiny", i, toRgba(rasterize(qr(t), { module: 1.5 + 0.5 * i })), [t]); }
  for (let i = 0; i < 2; i++) { const t = `dense-${seed}-${i}-` + "x".repeat(2800); add("dense", i, toRgba(rasterize(qr(t, 40, "L"), { module: 3 + i })), [t]); }
  for (let i = 0; i < 3; i++) {
    const texts = Array.from({ length: 2 + 2 * i }, (_, k) => word(1200 + i * 10 + k));
    const pieces = texts.map((t, k) => ({ plane: rasterize(qr(t, 2), { module: 4 }), x: 20 + (k % 3) * 220, y: 20 + Math.floor(k / 3) * 220 }));
    add("several", i, toRgba(compose(700, 460, pieces)), texts);
  }
  return out;
}
