// Writes docs/bench/code-scanner.md (at the repository root) from bench/.out/results.json. The report is committed in
// sub-iteration 7d and refreshed whenever a decoder changes (spec §7).
// Usage: pnpm --filter @web-kit/code-scanner bench:report
import { execSync } from "node:child_process";
import { hostname } from "node:os";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { table, type Row } from "./run";

const here = fileURLToPath(new URL("./", import.meta.url));
const results = JSON.parse(readFileSync(join(here, ".out", "results.json"), "utf8")) as { date: string; node: string; rows: Row[] };
const commit = execSync("git rev-parse --short HEAD", { cwd: here }).toString().trim();
const cpu = (await import("node:os")).cpus()[0]?.model ?? "unknown CPU";
const doc = `# Code Scanner benchmark

Date ${results.date.slice(0, 10)}, commit \`${commit}\`, ${results.node} on ${cpu} (${hostname()}), one process, one warm-up run.

Each image counts as read when every code in it is decoded with the expected text; any other text, or a result on an
image without a code, is a misread. ZXing's corpus images are tried at four rotations of 90°. Times are per image with
Try harder on both sides; they are informational (spec §7).

${table(results.rows)}
`;
const out = join(here, "..", "..", "..", "docs", "bench");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "code-scanner.md"), doc);
console.log(`written ${join(out, "code-scanner.md")}`);
