// Run from a package directory after build.
// Asserts a logic-only package: every entry in `exports` is built with its types, no entry imports React or says
// "use client", a file that starts a worker with `new URL("./x.js", import.meta.url)` finds x.js next to it, and no
// source or built file uses Math.random (see no-math-random.mjs).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findMathRandom } from "./no-math-random.mjs";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const failures = [];

const entries = Object.entries(pkg.exports ?? {}).filter(([, target]) => typeof target === "object");
if (entries.length === 0) failures.push("package.json has no exports with types");

for (const [name, target] of entries) {
  for (const file of [target.default, target.types]) {
    if (!existsSync(join(root, file))) failures.push(`${name}: missing ${file}`);
  }
  if (!existsSync(join(root, target.default))) continue;
  const js = readFileSync(join(root, target.default), "utf8");
  if (/["']use client["']/.test(js)) failures.push(`${target.default} contains "use client"`);
  if (/from\s*["']react/.test(js)) failures.push(`${target.default} imports react`);
  for (const [, worker] of js.matchAll(/new URL\(\s*["'](\.\/[^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) {
    if (!existsSync(join(dirname(join(root, target.default)), worker))) {
      failures.push(`${target.default} starts ${worker}, which is not in dist`);
    }
  }
}

for (const place of findMathRandom(root)) failures.push(`${place} uses Math.random: use crypto.getRandomValues`);

if (failures.length) {
  console.error("check-core-only FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("check-core-only OK");
