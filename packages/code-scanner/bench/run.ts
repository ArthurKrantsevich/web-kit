// The benchmark: every QR category of the ZXing corpus (four rotations) and the stress corpus, ours against
// zxing-wasm. Prints a table and writes bench/.out/results.json for bench:report.
// Usage: pnpm --filter @web-kit/code-scanner bench
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "../src/core/scan";
import type { ScanImage } from "../src/core/types";
import { qrFamily } from "../src/qr/family";
import { zxing } from "../test/zxing";
import { corpusAvailable, FALSE_POSITIVE_CATEGORIES, loadCategory, QR_CATEGORIES, rotated } from "./corpus";
import { stressCorpus } from "./stress";

export interface Row {
  category: string;
  images: number;
  ours: number;
  rival: number;
  ourMisreads: number;
  rivalMisreads: number;
  /** Median and 95th percentile milliseconds per image. */
  ourMs: [number, number];
  rivalMs: [number, number];
}

const stats = (times: number[]): [number, number] => { const s = [...times].sort((a, b) => a - b); return [s[Math.floor(s.length / 2)] ?? 0, s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? 0]; };

export async function benchmark({ tryHarder = true, limit = Infinity }: { tryHarder?: boolean; limit?: number } = {}): Promise<Row[]> {
  const zx = await zxing(), rows: Row[] = [];
  const judge = async (category: string, cases: { image: ScanImage; expected: string[] | null }[]): Promise<void> => {
    let ours = 0, rival = 0, ourMisreads = 0, rivalMisreads = 0;
    const ourTimes: number[] = [], rivalTimes: number[] = [];
    for (const c of cases) {
      let t0 = performance.now();
      const found = scan(c.image, { decoders: [qrFamily], tryHarder, multiple: (c.expected?.length ?? 0) > 1, deadlineMs: tryHarder ? 2000 : 200 }).map((r) => r.text);
      ourTimes.push(performance.now() - t0);
      t0 = performance.now();
      const theirs = (await zx.read(c.image)).map((r) => r.text);
      rivalTimes.push(performance.now() - t0);
      const ok = (texts: string[]): "hit" | "miss" | "misread" => c.expected === null ? (texts.length === 0 ? "miss" : "misread") : texts.length === 0 ? "miss" : texts.every((t) => c.expected!.includes(t)) && texts.length === c.expected.length ? "hit" : "misread";
      const a = ok(found), b = ok(theirs);
      if (a === "hit") ours++; else if (a === "misread") ourMisreads++;
      if (b === "hit") rival++; else if (b === "misread") rivalMisreads++;
    }
    rows.push({ category, images: cases.length, ours, rival, ourMisreads, rivalMisreads, ourMs: stats(ourTimes), rivalMs: stats(rivalTimes) });
  };
  if (corpusAvailable()) {
    for (const category of [...QR_CATEGORIES, ...FALSE_POSITIVE_CATEGORIES]) {
      const images = await loadCategory(category, limit), cases: { image: ScanImage; expected: string[] | null }[] = [];
      for (const img of images) for (let turn = 0; turn < 4; turn++) cases.push({ image: rotated(img.image, turn), expected: img.expected === null ? null : [img.expected] });
      await judge(category, cases);
    }
  }
  const stress = stressCorpus(1), categories = [...new Set(stress.map((c) => c.category))];
  for (const category of categories) await judge(`stress/${category}`, stress.filter((c) => c.category === category).map((c) => ({ image: c.image, expected: c.expected })));
  return rows;
}

export function table(rows: readonly Row[]): string {
  const lines = ["| category | images | ours | zxing-wasm | misreads (ours / zxing) | ms ours (median / p95) | ms zxing (median / p95) |", "|---|---|---|---|---|---|---|"];
  for (const r of rows) lines.push(`| ${r.category} | ${r.images} | ${r.ours} | ${r.rival} | ${r.ourMisreads} / ${r.rivalMisreads} | ${r.ourMs[0].toFixed(0)} / ${r.ourMs[1].toFixed(0)} | ${r.rivalMs[0].toFixed(0)} / ${r.rivalMs[1].toFixed(0)} |`);
  return lines.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = await benchmark({ tryHarder: !process.argv.includes("--fast") });
  console.log(table(rows));
  if (!corpusAvailable()) console.log("\n(The ZXing corpus is not cached: run bench:fetch to include it.)");
  const out = join(fileURLToPath(new URL("./", import.meta.url)), ".out");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "results.json"), JSON.stringify({ date: new Date().toISOString(), node: process.version, rows }, null, 2));
  console.log(`\nwritten ${join(out, "results.json")}`);
}
