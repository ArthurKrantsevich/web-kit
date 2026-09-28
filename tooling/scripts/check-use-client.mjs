// Run from a package directory after build.
// Asserts the React entry keeps "use client", the core entry (when the package has one) and any other entry, such as a
// worker, stay framework-free, a file that starts a worker with `new URL("./x.js", import.meta.url)` finds x.js next to
// it, a package that depends on @web-kit/ui ships ui's styles at the start of its own dist/styles.css, and a React peer
// is optional. No source or built file uses Math.random (see no-math-random.mjs).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { layered, readSources } from "./build-ui-styles.mjs";
import { findMathRandom } from "./no-math-random.mjs";

const dist = join(process.cwd(), "dist");
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
const failures = [];
const read = (file) => (existsSync(join(dist, file)) ? readFileSync(join(dist, file), "utf8") : null);

const index = read("index.js");
const styles = read("styles.css");

if (index === null) failures.push("missing dist/index.js");
else if (!/^\s*["']use client["']/.test(index)) failures.push('dist/index.js does not start with "use client"');
if (read("index.d.ts") === null) failures.push("missing dist/index.d.ts");

if (pkg.exports?.["./core"]) {
  const core = read("core.js");
  if (core === null) failures.push("missing dist/core.js");
  else {
    if (/["']use client["']/.test(core)) failures.push('dist/core.js contains "use client"');
    if (/from\s*["']react/.test(core)) failures.push("dist/core.js imports react");
  }
  if (read("core.d.ts") === null) failures.push("missing dist/core.d.ts");
}

// Entries besides "." and "./core" (a worker, for example) run without React too.
for (const [name, target] of Object.entries(pkg.exports ?? {})) {
  if (name === "." || name === "./core" || typeof target !== "object") continue;
  const file = target.default.replace(/^\.\/dist\//, "");
  const js = read(file);
  if (js === null) failures.push(`${name}: missing dist/${file}`);
  else if (/["']use client["']/.test(js) || /from\s*["']react/.test(js)) failures.push(`dist/${file} (${name}) uses React`);
}

// Bundlers find a worker by `new Worker(new URL("./worker.js", import.meta.url))`: the file must sit next to the caller.
if (existsSync(dist)) {
  for (const file of readdirSync(dist).filter((name) => name.endsWith(".js"))) {
    for (const [, worker] of read(file).matchAll(/new URL\(\s*["'](\.\/[^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) {
      if (!existsSync(join(dist, worker))) failures.push(`dist/${file} starts ${worker}, which is not in dist`);
    }
  }
}

// A core-only install must not pull React: the React peer is optional.
if (pkg.peerDependencies?.react && pkg.peerDependenciesMeta?.react?.optional !== true) {
  failures.push('package.json lists react as a peer without peerDependenciesMeta.react.optional: true');
}

if (styles === null) failures.push("missing dist/styles.css");
else if (pkg.name === "@web-kit/ui") {
  // Exactly src/styles/*.css inside `@layer wk-ui { … }`, so tools' unlayered rules always win over it.
  if (styles !== layered(readSources(join(process.cwd(), "src/styles")))) {
    failures.push("dist/styles.css is not src/styles/*.css inside @layer wk-ui");
  }
} else if (pkg.dependencies?.["@web-kit/ui"]) {
  const require = createRequire(join(process.cwd(), "package.json"));
  const ui = readFileSync(require.resolve("@web-kit/ui/styles.css"), "utf8");
  if (!styles.startsWith(ui)) failures.push("dist/styles.css does not start with @web-kit/ui/styles.css");
  if (!ui.startsWith("@layer wk-ui {")) failures.push("@web-kit/ui/styles.css is not inside @layer wk-ui");
  if (!styles.includes(".wk-ui-select__list")) failures.push("dist/styles.css has no .wk-ui-select__list rule");
}

for (const place of findMathRandom(process.cwd())) failures.push(`${place} uses Math.random: use crypto.getRandomValues`);

if (failures.length) {
  console.error("check-use-client FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("check-use-client OK");
