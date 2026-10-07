// Run from a package directory after build.
// Asserts the page entry (".") loads no decoder: decoding happens in the worker, the page only draws (spec §6). The
// decoder entries are every export besides ".", "./core", "./worker", "./styles.css" and "./package.json". A decoder's
// own files are those of its static import closure that "./core" does not reach (the page may share core's chunks with
// the decoders, never a decoder's). The closure follows static `import`/`export … from` of relative specifiers; a
// dynamic `import()` loads on demand and is not followed.
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const failures = [];
const rel = (file) => relative(root, file);
const SHARED = new Set([".", "./core", "./worker", "./styles.css", "./package.json"]);

/** The built file of an export entry, or null when the entry has none. */
function fileOf(name) {
  const target = pkg.exports?.[name];
  return typeof target === "object" && typeof target.default === "string" ? resolve(root, target.default) : null;
}

/** Every file reached from `entry` through static imports of relative specifiers, `entry` included. */
function closure(entry) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    if (!existsSync(file)) { failures.push(`${rel(entry)} imports ${rel(file)}, which is not in dist`); return; }
    seen.add(file);
    const js = readFileSync(file, "utf8");
    const specifiers = [
      ...js.matchAll(/(?:^|[\n;])\s*(?:import|export)\s*(?:[\w$*{][^;]*?)?from\s*["'](\.{1,2}\/[^"']+)["']/g),
      ...js.matchAll(/(?:^|[\n;])\s*import\s*["'](\.{1,2}\/[^"']+)["']/g),
    ].map((m) => m[1]);
    if (specifiers.length === 0 && /from\s*["']\.{1,2}\//.test(js)) failures.push(`${rel(file)} has relative imports this check could not read`);
    for (const specifier of specifiers) visit(resolve(dirname(file), specifier));
  };
  visit(entry);
  return seen;
}

const page = fileOf(".");
const decoders = Object.keys(pkg.exports ?? {}).filter((name) => !SHARED.has(name)).map((name) => [name, fileOf(name)]).filter(([, file]) => file !== null);

if (page === null) failures.push('package.json has no "." entry with a default file');
if (decoders.length === 0) failures.push("package.json has no decoder entry (an export besides ., ./core, ./worker, ./styles.css and ./package.json)");

if (page !== null && decoders.length > 0) {
  const pageFiles = closure(page);
  const coreFiles = fileOf("./core") === null ? new Set() : closure(fileOf("./core"));
  for (const [name, file] of decoders) {
    const own = [...closure(file)].filter((f) => !coreFiles.has(f));
    for (const f of own) if (pageFiles.has(f)) failures.push(`${rel(page)} reaches ${rel(f)}, a file of ${name}: the page must not load a decoder`);
  }
}

if (failures.length) {
  console.error("check-page-without-decoders FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("check-page-without-decoders OK");
