// Writes docs/bench/code-scanner.md (at the repository root) from bench/.out/results.json. The report is committed in
// sub-iteration 7d and refreshed whenever a decoder changes (spec §7).
// Usage: pnpm --filter @web-kit/code-scanner bench:report
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { summary, table, type Results } from "./run";

const here = fileURLToPath(new URL("./", import.meta.url));
const results = JSON.parse(readFileSync(join(here, ".out", "results.json"), "utf8")) as Results;
const commit = execSync("git rev-parse --short HEAD", { cwd: here }).toString().trim();
const cpu = cpus()[0]?.model ?? "unknown CPU";
const doc = `# Code Scanner benchmark

Date ${results.date.slice(0, 10)}, commit \`${commit}\`, ${results.node} on ${cpu} (${hostname()}), one process, one warm-up
scan and one warm-up read before timing.

Ours: \`${JSON.stringify(results.ours)}\`.
zxing-wasm: \`${JSON.stringify(results.rival)}\`.

Each image counts as read when the texts decoded are exactly the expected ones; any other result is a misread, and a result
on an image without a code is a false positive. Both sides run in the same mode: one code per image unless the image holds
several. ZXing's corpus images are tried at four rotations of 90°. Times are per image, ours with Try harder ${results.tryHarder ? "on" : "off (--fast)"},
zxing-wasm at full effort; they are informational (spec §7).

${table(results.rows)}

${summary(results.rows)}
`;
const out = join(here, "..", "..", "..", "docs", "bench");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "code-scanner.md"), doc);
console.log(`written ${join(out, "code-scanner.md")}`);
