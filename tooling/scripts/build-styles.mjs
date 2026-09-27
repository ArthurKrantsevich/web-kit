// Run from a tool package directory after tsdown: writes dist/styles.css = @web-kit/ui/styles.css + src/ui/styles.css,
// so an app still imports one file per tool.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const cwd = process.cwd();
const require = createRequire(join(cwd, "package.json"));
const ui = readFileSync(require.resolve("@web-kit/ui/styles.css"), "utf8");
const own = readFileSync(join(cwd, "src/ui/styles.css"), "utf8");
mkdirSync(join(cwd, "dist"), { recursive: true });
writeFileSync(join(cwd, "dist/styles.css"), `${ui}${ui.endsWith("\n") ? "" : "\n"}${own}`);
console.log("build-styles OK");
