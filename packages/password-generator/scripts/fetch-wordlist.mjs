// Downloads the EFF large wordlist, checks it against the SHA-256 recorded below, and writes src/wordlist.ts.
// Run it only to vendor the list again: `node scripts/fetch-wordlist.mjs`. CI and the build never download it.
// The list is by the Electronic Frontier Foundation (https://www.eff.org/dice), under CC BY 3.0 US; EFF's copyright
// page (https://www.eff.org/copyright) also grants CC BY 4.0 for its original material.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const SOURCE = "https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt";
const SHA256 = "addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e";

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE}: HTTP ${response.status}`);
const text = await response.text();
const digest = createHash("sha256").update(text).digest("hex");
if (digest !== SHA256) throw new Error(`${SOURCE}: SHA-256 is ${digest}, expected ${SHA256}`);

// Each line is five dice (1–6) in order from 11111 to 66666, a tab and a word.
const lines = text.trimEnd().split("\n");
const words = lines.map((line, index) => {
  const [dice, word] = line.split("\t");
  const expected = index.toString(6).padStart(5, "0").replace(/[0-5]/g, (d) => String(Number(d) + 1));
  if (dice !== expected || !/^[a-z-]+$/.test(word ?? "")) throw new Error(`unexpected line ${index + 1}: ${JSON.stringify(line)}`);
  return word;
});
if (words.length !== 7776 || new Set(words).size !== 7776) throw new Error("expected 7,776 different words");

writeFileSync(
  new URL("../src/wordlist.ts", import.meta.url),
  `// The EFF large wordlist: 7,776 words for passphrases, by the Electronic Frontier Foundation (https://www.eff.org/dice).
// Licensed under CC BY 3.0 US (https://creativecommons.org/licenses/by/3.0/us/); EFF's copyright page also grants CC BY
// 4.0. Written by scripts/fetch-wordlist.mjs from ${SOURCE}
// (SHA-256 ${SHA256}); do not edit.

const WORDS = "${words.join(" ")}";

/** The 7,776 words of the EFF large wordlist, in its order (dice 11111 to 66666). */
export const EFF_LARGE_WORDLIST: readonly string[] = WORDS.split(" ");
`,
);
console.log(`wrote src/wordlist.ts: ${words.length} words`);
