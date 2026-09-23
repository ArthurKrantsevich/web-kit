// Run from a package directory after build.
// Asserts a logic-only package: built entry and types exist, no React import, no "use client".
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const failures = [];

for (const file of ["index.js", "index.d.ts"]) {
  if (!existsSync(join(dist, file))) failures.push(`missing dist/${file}`);
}

if (existsSync(join(dist, "index.js"))) {
  const js = readFileSync(join(dist, "index.js"), "utf8");
  if (/["']use client["']/.test(js)) failures.push('dist/index.js contains "use client"');
  if (/from\s*["']react/.test(js)) failures.push("dist/index.js imports react");
}

if (failures.length) {
  console.error("check-core-only FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("check-core-only OK");
