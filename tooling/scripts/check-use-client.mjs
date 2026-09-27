// Run from a package directory after build.
// Asserts the React entry keeps "use client", the core entry (when the package has one) stays framework-free,
// a package that depends on @web-kit/ui ships ui's styles at the start of its own dist/styles.css, and a React peer
// is optional.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

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

// A core-only install must not pull React: the React peer is optional.
if (pkg.peerDependencies?.react && pkg.peerDependenciesMeta?.react?.optional !== true) {
  failures.push('package.json lists react as a peer without peerDependenciesMeta.react.optional: true');
}

if (styles === null) failures.push("missing dist/styles.css");
else if (pkg.dependencies?.["@web-kit/ui"]) {
  const require = createRequire(join(process.cwd(), "package.json"));
  const ui = readFileSync(require.resolve("@web-kit/ui/styles.css"), "utf8");
  if (!styles.startsWith(ui)) failures.push("dist/styles.css does not start with @web-kit/ui/styles.css");
  if (!styles.includes(".wk-ui-select__list")) failures.push("dist/styles.css has no .wk-ui-select__list rule");
}

if (failures.length) {
  console.error("check-use-client FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("check-use-client OK");
