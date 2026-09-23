// Run from a package directory after build.
// Asserts the React entry keeps "use client" and the core entry stays framework-free.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const failures = [];
const read = (file) => (existsSync(join(dist, file)) ? readFileSync(join(dist, file), "utf8") : null);

const index = read("index.js");
const core = read("core.js");
const styles = read("styles.css");

if (index === null) failures.push("missing dist/index.js");
else if (!/^\s*["']use client["']/.test(index)) failures.push('dist/index.js does not start with "use client"');

if (core === null) failures.push("missing dist/core.js");
else {
  if (/["']use client["']/.test(core)) failures.push('dist/core.js contains "use client"');
  if (/from\s*["']react/.test(core)) failures.push("dist/core.js imports react");
}

if (styles === null) failures.push("missing dist/styles.css");

for (const file of ["index.d.ts", "core.d.ts"]) {
  if (read(file) === null) failures.push(`missing dist/${file}`);
}

if (failures.length) {
  console.error("check-use-client FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("check-use-client OK");
