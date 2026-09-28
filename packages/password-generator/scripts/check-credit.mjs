// The EFF Large Wordlist is CC BY 3.0 US: the built entry that holds it must keep its credit, a preserved /*! … */
// comment (a minifier drops other comments). Run by `check` after the build.
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("../dist/wordlist.js", import.meta.url), "utf8");
if (!/\/\*![^]*?Electronic Frontier Foundation[^]*?CC BY 3\.0 US[^]*?\*\//.test(code)) {
  console.error("check-credit FAILED: dist/wordlist.js does not keep the EFF Large Wordlist's /*! credit */");
  process.exit(1);
}
console.log("check-credit OK");
