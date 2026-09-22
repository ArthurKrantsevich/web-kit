// Verifies that `out/` can be served from https://<user>.github.io/web-kit/.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "/web-kit";
const out = new URL("../out/", import.meta.url).pathname;
const failures = [];

function mustExist(rel) {
  if (!existsSync(join(out, rel))) failures.push(`missing out/${rel}`);
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
  if (/(?:src|href)="\/_next\//.test(html)) {
    failures.push("index.html has asset URLs without the base path");
  }
  if (!html.includes("web-kit")) {
    failures.push("index.html does not contain the site title");
  }
}

if (failures.length) {
  console.error("check-export FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("check-export OK");
