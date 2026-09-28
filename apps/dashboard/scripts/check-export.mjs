// Verifies that a static export can be served from https://<user>.github.io/web-kit/.
// Usage: node scripts/check-export.mjs [outDir]   (default: ../out next to this script)
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "/web-kit";
/** Every page links these, under the base path. */
const ICONS = [
  { file: "icon.svg", link: /<link rel="icon" href="\/web-kit\/icon\.svg[?"]/ },
  { file: "icon.ico", link: /<link rel="icon" href="\/web-kit\/icon\.ico[?"]/ },
  { file: "apple-icon.png", link: /<link rel="apple-touch-icon" href="\/web-kit\/apple-icon\.png[?"]/ },
];
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
mustExist("tools/json-formatter/index.html");
// The icons of src/app (icon.svg, icon.ico, apple-icon.png) are copied to the root of the export.
for (const icon of ICONS) mustExist(icon.file);

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
    if (file.endsWith(".html")) {
      const html = readFileSync(file, "utf8");
      for (const icon of ICONS) {
        if (!icon.link.test(html)) failures.push(`${relative(out, file)} does not link ${BASE}/${icon.file}`);
      }
    }
    if (!/\.(html|css)$/.test(file)) continue;
    // A quote or "(" directly before /_next/ means the URL has no base path.
    if (/["'(]\/_next\//.test(readFileSync(file, "utf8"))) {
      failures.push(`${relative(out, file)} has asset URLs without the base path`);
    }
  }
}

// The EFF large wordlist (CC BY 3.0 US) must be credited where people see it: the password page's Words options and
// the About page. (Next's minifier drops every comment, /*! … */ too, so the site's script cannot carry the credit;
// the package's dist/wordlist.js does, and the package's check verifies it.)
const CREDIT = "Words from the EFF Large Wordlist";
for (const page of ["tools/password-generator/index.html", "about/index.html"]) {
  const file = join(out, page);
  if (!existsSync(file)) continue;
  const html = readFileSync(file, "utf8");
  if (!html.includes(CREDIT) || !html.includes("https://www.eff.org/dice")) failures.push(`${page} does not credit the EFF Large Wordlist with a link`);
}

if (failures.length) {
  console.error("check-export FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("check-export OK");
