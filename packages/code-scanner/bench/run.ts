// The benchmark: every QR category of the ZXing corpus (four rotations) and the stress corpus, ours against
// zxing-wasm. Prints a table and writes bench/.out/results.json for bench:report.
// Usage: pnpm --filter @web-kit/code-scanner bench [--fast]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "../src/core/scan";
import type { ScanImage } from "../src/core/types";
import { qrFamily } from "../src/qr/family";
import { RIVAL_OPTIONS, zxing } from "../test/zxing";
import { corpusAvailable, FALSE_POSITIVE_CATEGORIES, loadCategory, QR_CATEGORIES, rotated } from "./corpus";
import { stressCorpus } from "./stress";

export interface Row {
  category: string;
  images: number;
  /** False when the images hold no code (a false-positive folder): hits mean nothing there, misreads are false positives. */
  expectsCodes: boolean;
  ours: number;
  rival: number;
  ourMisreads: number;
  rivalMisreads: number;
  /** Median and 95th percentile milliseconds per image. */
  ourMs: [number, number];
  rivalMs: [number, number];
}

export interface Results {
  date: string;
  node: string;
  tryHarder: boolean;
  /** Both sides' options, so the report states what was actually run. */
  ours: Record<string, unknown>;
  rival: Record<string, unknown>;
  rows: Row[];
}

/**
 * The one judgement for both sides: a hit when the texts found are exactly the expected ones (as multisets, so [a, a, b]
 * is not [a, b, c]); a miss when nothing is found; a misread otherwise. On an image without a code, nothing is clean and
 * anything is a misread (a false positive).
 */
export function verdict(found: readonly string[], expected: readonly string[] | null): "hit" | "miss" | "misread" | "clean" {
  if (expected === null) return found.length === 0 ? "clean" : "misread";
  if (found.length === 0) return "miss";
  return JSON.stringify([...found].sort()) === JSON.stringify([...expected].sort()) ? "hit" : "misread";
}

/** The rival's `maxNumberOfSymbols` for a case: 1 against our `multiple: false`, all against `multiple: true`. */
export const rivalSymbols = (expected: readonly string[] | null): number => ((expected?.length ?? 0) > 1 ? 255 : 1);

const stats = (times: number[]): [number, number] => { const s = [...times].sort((a, b) => a - b); return [s[Math.floor(s.length / 2)] ?? 0, s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? 0]; };

export async function benchmark({ tryHarder = true, limit = Infinity }: { tryHarder?: boolean; limit?: number } = {}): Promise<Row[]> {
  const zx = await zxing(), rows: Row[] = [], deadlineMs = tryHarder ? 2000 : 200;
  const stress = stressCorpus(1);
  // One warm-up on each side before anything is timed (JIT, wasm instantiation).
  scan(stress[0]!.image, { decoders: [qrFamily], tryHarder, deadlineMs });
  await zx.read(stress[0]!.image, { maxSymbols: 1 });
  const judge = async (category: string, cases: { image: ScanImage; expected: string[] | null }[]): Promise<void> => {
    let ours = 0, rival = 0, ourMisreads = 0, rivalMisreads = 0;
    const ourTimes: number[] = [], rivalTimes: number[] = [];
    for (const c of cases) {
      const multiple = (c.expected?.length ?? 0) > 1;
      let t0 = performance.now();
      const found = scan(c.image, { decoders: [qrFamily], tryHarder, multiple, deadlineMs }).map((r) => r.text);
      ourTimes.push(performance.now() - t0);
      t0 = performance.now();
      const theirs = (await zx.read(c.image, { maxSymbols: rivalSymbols(c.expected) })).map((r) => r.text);
      rivalTimes.push(performance.now() - t0);
      const a = verdict(found, c.expected), b = verdict(theirs, c.expected);
      if (a === "hit") ours++; else if (a === "misread") ourMisreads++;
      if (b === "hit") rival++; else if (b === "misread") rivalMisreads++;
    }
    rows.push({ category, images: cases.length, expectsCodes: cases.some((c) => c.expected !== null), ours, rival, ourMisreads, rivalMisreads, ourMs: stats(ourTimes), rivalMs: stats(rivalTimes) });
  };
  if (corpusAvailable()) {
    for (const category of [...QR_CATEGORIES, ...FALSE_POSITIVE_CATEGORIES]) {
      const images = await loadCategory(category, limit), cases: { image: ScanImage; expected: string[] | null }[] = [];
      for (const img of images) for (let turn = 0; turn < 4; turn++) cases.push({ image: rotated(img.image, turn), expected: img.expected === null ? null : [img.expected] });
      await judge(category, cases);
    }
  }
  const categories = [...new Set(stress.map((c) => c.category))];
  for (const category of categories) await judge(`stress/${category}`, stress.filter((c) => c.category === category).map((c) => ({ image: c.image, expected: c.expected })));
  return rows;
}

/** What each side ran with, for results.json and the report header. */
export function options(tryHarder: boolean): Pick<Results, "ours" | "rival"> {
  return {
    ours: { decoders: ["qr-family"], tryHarder, deadlineMs: tryHarder ? 2000 : 200, multiple: "true only for images that hold several codes" },
    rival: { ...RIVAL_OPTIONS, textMode: "Plain", formats: ["QRCode"], maxNumberOfSymbols: "1, or 255 for images that hold several codes" },
  };
}

export function table(rows: readonly Row[]): string {
  const lines = ["| category | images | ours | zxing-wasm | misreads or false positives (ours / zxing) | ms ours (median / p95) | ms zxing (median / p95) |", "|---|---|---|---|---|---|---|"];
  for (const r of rows) {
    const hits = r.expectsCodes ? [r.ours, r.rival] : ["—", "—"];
    lines.push(`| ${r.category} | ${r.images} | ${hits[0]} | ${hits[1]} | ${r.ourMisreads} / ${r.rivalMisreads} | ${r.ourMs[0].toFixed(0)} / ${r.ourMs[1].toFixed(0)} | ${r.rivalMs[0].toFixed(0)} / ${r.rivalMs[1].toFixed(0)} |`);
  }
  return lines.join("\n");
}

/** Totals per corpus: images read and misreads, ours against the rival, and the false positives. */
export function summary(rows: readonly Row[]): string {
  const sum = (part: readonly Row[], key: "images" | "ours" | "rival" | "ourMisreads" | "rivalMisreads"): number => part.reduce((n, r) => n + r[key], 0);
  const line = (name: string, part: readonly Row[]): string => `${name}: ours ${sum(part, "ours")} of ${sum(part, "images")} (${sum(part, "ourMisreads")} misreads), zxing-wasm ${sum(part, "rival")} (${sum(part, "rivalMisreads")} misreads)`;
  const corpus = rows.filter((r) => r.expectsCodes && !r.category.startsWith("stress/")), none = rows.filter((r) => !r.expectsCodes), stress = rows.filter((r) => r.category.startsWith("stress/"));
  const out: string[] = [];
  if (corpus.length > 0) out.push(line("ZXing QR corpus", corpus));
  if (none.length > 0) out.push(`False positives on ${sum(none, "images")} images without a code: ours ${sum(none, "ourMisreads")}, zxing-wasm ${sum(none, "rivalMisreads")}`);
  out.push(line("Stress corpus", stress));
  return out.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const tryHarder = !process.argv.includes("--fast");
  const rows = await benchmark({ tryHarder });
  console.log(`Ours: ${JSON.stringify(options(tryHarder).ours)}\nzxing-wasm: ${JSON.stringify(options(tryHarder).rival)}\n`);
  console.log(table(rows));
  console.log(`\n${summary(rows)}`);
  if (!corpusAvailable()) console.log("\n(The ZXing corpus is not cached: run bench:fetch to include it.)");
  const out = join(fileURLToPath(new URL("./", import.meta.url)), ".out");
  mkdirSync(out, { recursive: true });
  const results: Results = { date: new Date().toISOString(), node: process.version, tryHarder, ...options(tryHarder), rows };
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\nwritten ${join(out, "results.json")}`);
}
