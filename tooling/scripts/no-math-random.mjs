// Every package's randomness comes from crypto.getRandomValues: Math.random is predictable and must not appear in a
// package's sources (src/, tests included) or in what it ships (dist/). Used by check-use-client.mjs and
// check-core-only.mjs, so `pnpm verify` runs it for every package.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** `Math.random`, `Math . random` or `Math["random"]`, in code or anywhere else in the file. */
const MATH_RANDOM = /\bMath\s*(?:\.\s*random\b|\[\s*["'`]random["'`]\s*\])/;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.(m?[jt]sx?)$/.test(entry.name) ? [path] : [];
  });
}

/** The files of `src/` and `dist/` under `root` that use Math.random, as "path:line". */
export function findMathRandom(root) {
  const found = [];
  for (const dir of ["src", "dist"].map((name) => join(root, name)).filter((path) => existsSync(path))) {
    for (const file of files(dir)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (MATH_RANDOM.test(line)) found.push(`${relative(root, file)}:${index + 1}`);
        });
    }
  }
  return found;
}
