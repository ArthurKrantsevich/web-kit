// Run from packages/ui after tsdown: writes dist/styles.css = src/styles/*.css (sorted by name) inside `@layer wk-ui`.
// Every tool's styles.css starts with this file. In the layer, the ui rules lose to any unlayered rule, so a tool's
// own rules win even when another tool's styles.css (which repeats the ui rules) loads after them.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const LAYER = "wk-ui";

/** The ui stylesheet built from the given sources, in order. check-use-client rebuilds it to compare. */
export function layered(sources) {
  const body = sources.map((css) => (css.endsWith("\n") ? css : `${css}\n`)).join("");
  return `@layer ${LAYER} {\n${body}}\n`;
}

export function readSources(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".css"))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const cwd = process.cwd();
  mkdirSync(join(cwd, "dist"), { recursive: true });
  writeFileSync(join(cwd, "dist/styles.css"), layered(readSources(join(cwd, "src/styles"))));
  console.log("build-ui-styles OK");
}
