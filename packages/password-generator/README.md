# @web-kit/password-generator

Passwords of random characters, passphrases of random words, pronounceable passwords and PINs from `crypto.getRandomValues`, each with the exact entropy of the way it was made, a strength and a time to crack.

> Not published to npm yet. The package name will change before the first release.

## Logic only (no React)

```ts
import { crackTime, entropy, generateMemorable, generatePassphrase, generatePassword, generatePin, strength } from "@web-kit/password-generator/core";
import { EFF_LARGE_WORDLIST } from "@web-kit/password-generator/wordlist";

generatePassword({ length: 20, excludeAmbiguous: true }); // { ok: true, value: "q7#Rm2!vXz4&tLw9@eHs" }
generatePassphrase({ words: 6, separator: "-" }, EFF_LARGE_WORDLIST); // { ok: true, value: "glider-tulip-anvil-oasis-rumble-cozy" }
generateMemorable({ groups: 3, syllables: 3, capitalize: true, includeNumber: true }); // { ok: true, value: "Bolanu-Tekiro4-Vasemi" }
generatePin({ length: 6 }); // { ok: true, value: "480372" }

const bits = entropy({ mode: "characters", length: 20 }); // 130.9…
strength(bits); // "very strong"
crackTime(bits).text; // "centuries"
```

- `randomInt(n)` draws 32-bit values from `crypto.getRandomValues` and throws away those at or above the largest multiple of `n`, so no value is more likely than another. No `Math.random` anywhere (the package check fails on it).
- **Characters**: 4 to 128 characters from lowercase, uppercase, digits and symbols, where symbols are all 32 printable ASCII characters that are not letters, digits or a space (`!#$%&*+-=?@^_~` first, then `"'(),./:;<>[\]` and `` ` ``, `{`, `|`, `}`). `excludeAmbiguous` leaves out `Il1O0o`; `exclude` leaves out your own characters. With `requireEach` (on by default) a password that misses a chosen set is thrown away and another drawn: putting a missing character in at a random place would make some passwords more likely than others.
- **Words**: 3 to 12 words, a separator (`-`, a space, `.`, `_` or your own), capitals, and one digit at the end of one word. The words come from the EFF large wordlist, a separate entry (`./wordlist`, about 21 kB) that the component loads only when Words is chosen.
- **Memorable**: 2 to 8 groups of 2 to 4 syllables from a fixed set of 225 (one of 15 consonants, one of 5 vowels, then nothing, n or r), such as `Bolanu-Tekiro-Vasemi`. Every syllable starts with one consonant and has one vowel, so a group splits into its syllables one way only.
- **PIN**: 4 to 12 digits. Repeated digits (0000), runs up or down (1234, 9876), repeated pairs (1212) and, for four digits, the years 1900–2099 are thrown away.
- `entropy(options)` is the exact number of bits of the chosen way: log2 of how many results it can give, all equally likely. With `requireEach` it counts the allowed passwords by inclusion and exclusion over the sets, not as length × log2(pool); a PIN's bits count only the PINs that are left. `crackTime(bits)` is the average time at 10¹⁰ guesses per second (half of all possibilities) in words, and `strength(bits)` is weak below 50 bits, fair below 72, strong below 100 and very strong above.
- The tests check the character distribution with χ² over 1,000,000 characters from a pool of 36 (which does not divide 2³²), every one of the 224 passwords of a small pool with Require each, the entropy against counting every password or PIN, and the word list against the SHA-256 of EFF's file.

## React component

```tsx
import { PasswordGenerator } from "@web-kit/password-generator";
import "@web-kit/password-generator/styles.css";

export function Page() {
  return <PasswordGenerator />;
}
```

The toolbar has the mode (Characters, Words, Memorable, PIN), Count (1–50), Regenerate (Ctrl+Enter), Clear and More actions (share link, saved settings, shortcuts). Under it, a box of one height at every width holds the options of the mode. The list shows each password with its own Copy, under the entropy, a strength bar in the token colors and the time to crack; the pane has Download (`passwords.txt`) and Copy all. When the options allow no password, the list says why and Regenerate is off. Passwords are made after the page hydrates and live only in the component: they are never put into a share link, the saved input (which keeps the settings) or the console, and Clear forgets them. `usePasswordGenerator()` gives the same state without markup; set `--wk-password-height` to change the height of the list.

## The word list

The EFF large wordlist is by the Electronic Frontier Foundation (https://www.eff.org/dice) and is used under the Creative Commons Attribution 3.0 United States license (https://creativecommons.org/licenses/by/3.0/us/); EFF's copyright page also grants CC BY 4.0 for its original material. `scripts/fetch-wordlist.mjs` downloads it from https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt, checks its SHA-256 (`addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e`) and writes `src/wordlist.ts`; the build and CI never download it.

## License

MIT for the code. The EFF large wordlist: CC BY 3.0 US, © Electronic Frontier Foundation.
