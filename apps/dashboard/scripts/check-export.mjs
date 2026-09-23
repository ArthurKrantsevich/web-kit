// Verifies that a static export can be served from https://<user>.github.io/web-kit/.
// Usage: node scripts/check-export.mjs [outDir]   (default: ../out next to this script)
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "/web-kit";
const out = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../out/", import.meta.url));
const failures = [];

function mustExist(rel) {
  if (!existsSync(join(out, rel))) failures.push(`missing out/${rel}`);
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

mustExist("index.html");
mustExist("about/index.html");
mustExist("404.html");
mustExist(".nojekyll");

if (existsSync(join(out, "index.html"))) {
  const html = readFileSync(join(out, "index.html"), "utf8");
  if (!html.includes(`${BASE}/_next/`)) {
    failures.push(`index.html has no asset URLs under ${BASE}/_next/`);
  }
  if (!html.includes("<title>web-kit</title>")) {
    failures.push("index.html does not have <title>web-kit</title>");
  }
}

if (existsSync(out)) {
  for (const file of listFiles(out)) {
    if (!/\.(html|css)$/.test(file)) continue;
    // A quote or "(" directly before /_next/ means the URL has no base path.
    if (/["'(]\/_next\//.test(readFileSync(file, "utf8"))) {
      failures.push(`${relative(out, file)} has asset URLs without the base path`);
    }
  }
}

if (failures.length) {
  console.error("check-export FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("check-export OK");
