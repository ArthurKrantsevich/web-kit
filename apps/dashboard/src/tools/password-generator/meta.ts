import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "password-generator",
  title: "Password Generator",
  description: "Passwords, passphrases, PINs and pronounceable passwords from a secure random source, with their exact entropy.",
  preview: `k7#QmZp2!vX4&tLw9@eR
glider-tulip-anvil-oasis-…
Bolanu-Tekiro-Vasemi4
130.9 bits · Very strong`,
  category: "generators",
  tags: ["password", "passphrase", "pin", "diceware", "eff", "entropy", "random"],
  pkg: "@web-kit/password-generator",
  usage: `import { PasswordGenerator } from "@web-kit/password-generator";
import "@web-kit/password-generator/styles.css";

export function Page() {
  return <PasswordGenerator />;
}

// Logic only, no React:
import { crackTime, entropy, generatePassphrase, generatePassword } from "@web-kit/password-generator/core";
import { EFF_LARGE_WORDLIST } from "@web-kit/password-generator/wordlist";

generatePassword({ length: 20, excludeAmbiguous: true }); // { ok: true, value: "…" }
generatePassphrase({ words: 6, separator: "-" }, EFF_LARGE_WORDLIST);
const bits = entropy({ mode: "words", words: 6 }); // 77.5
crackTime(bits).text; // "centuries"`,
  api: [
    {
      name: "generatePassword",
      signature: "generatePassword({ length, lower?, upper?, digits?, symbols?, excludeAmbiguous?, exclude?, requireEach? }): Result<string>",
      description: "4–128 characters from the chosen sets, without bias; Require each redraws a password until it has every set, so all allowed passwords stay equally likely.",
    },
    {
      name: "generatePassphrase",
      signature: "generatePassphrase({ words, separator?, capitalize?, includeNumber? }, wordlist): Result<string>",
      description: "3–12 words; the EFF large wordlist (7,776 words, CC BY 3.0) is its own entry, @web-kit/password-generator/wordlist.",
    },
    {
      name: "generateMemorable · generatePin",
      signature: "generateMemorable({ groups, syllables, separator?, capitalize?, includeNumber? }) · generatePin({ length })",
      description: "Syllables you can say, from a set of 225; PINs without repeated digits, runs, repeated pairs or years.",
    },
    {
      name: "entropy",
      signature: 'entropy({ mode: "characters" | "words" | "memorable" | "pin", … }): number',
      description: "The exact bits of the chosen way of generating; with Require each counted by inclusion and exclusion, not as length × log2(pool).",
    },
    {
      name: "crackTime · strength",
      signature: "crackTime(bits): { seconds, text } · strength(bits)",
      description: "Average time at 10¹⁰ guesses per second, in words; weak below 50 bits, fair below 72, strong below 100, very strong above.",
    },
    {
      name: "randomInt",
      signature: "randomInt(n, random?): number",
      description: "0 to n − 1 by rejection sampling over crypto.getRandomValues: no modulo bias.",
    },
    {
      name: "PasswordGenerator",
      signature: "<PasswordGenerator initialSettings? className? />",
      description:
        "Ready-made UI: Characters, Words, Memorable and PIN, 1–50 at a time, entropy, strength and time to crack, Copy each or all, Download. Passwords are never saved, shared or logged.",
    },
  ],
};
