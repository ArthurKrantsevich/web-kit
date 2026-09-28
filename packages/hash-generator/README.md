# @web-kit/hash-generator

MD5, SHA-1, SHA-2, SHA-3, BLAKE2, BLAKE3, RIPEMD-160, CRC32 and CRC32C of a text, bytes or a file, HMAC with SHA-1 and SHA-2, and a check of a hash you were given.

> Not published to npm yet. The package name will change before the first release.

## Logic only (no React)

```ts
import { encodeDigest, hashAll, hmac, matchDigest } from "@web-kit/hash-generator/core";
import { ALL_ALGORITHMS, EXTRA_ALGORITHMS, sha3Hasher } from "@web-kit/hash-generator/extra";

const result = await hashAll("hello"); // MD5, SHA-1, SHA-256, SHA-384, SHA-512, CRC32
if (result.ok) {
  encodeDigest(result.value.sha256!, "hex"); // "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
  matchDigest("sha256-LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=", result.value); // { status: "match", algorithm: "sha256" }
}
await hashAll(file, { algorithms: ALL_ALGORITHMS, onProgress: (bytes) => console.log(bytes) }); // a File in 4 MB parts
await hmac("SHA-256", { text: "Jefe", format: "text" }, new TextEncoder().encode("what do ya want for nothing?"));

const sha3 = sha3Hasher(256)(); // streaming: update() any number of times, then digest()
sha3.update(new TextEncoder().encode("hel"));
sha3.update(new TextEncoder().encode("lo"));
encodeDigest(sha3.digest(), "hex"); // "3338be694f50c5f338814986cdf0686453a888b84f424d792af4b9202398f392"
```

- The main algorithms are in `./core`: SHA-1, SHA-256, SHA-384 and SHA-512 by Web Crypto (the browser, a worker or Node 20+), MD5 and CRC32 (ISO-HDLC, as zip and PNG use it) written here. The others are in `./extra`, loaded only when asked for: SHA-224 and SHA-512/256 (Web Crypto has neither), SHA3-224/256/384/512 (Keccak-f[1600]), BLAKE2b-512, BLAKE2s-256 and BLAKE3-256 without a key, RIPEMD-160 and CRC32C (Castagnoli). Every own algorithm streams: `create()` → `update(bytes)` any number of times → `digest()`.
- `hashAll(input, options)` takes a string (hashed as UTF-8), bytes or a Blob (a File), which it reads in 4 MB parts in one pass, reporting the bytes read. Web Crypto cannot stream, so for SHA-1 and SHA-2 the parts are also copied into one buffer of the file's size. With `hmacKey` the Web Crypto algorithms give HMACs (RFC 2104) and the others nothing; a key is UTF-8 text or hex digits.
- `encodeDigest` writes hex, HEX, Base64 or Base64url without padding.
- `matchDigest(expected, results)` compares a pasted hash with every digest: hex in any case or Base64(url), spaces anywhere, a prefix such as `sha256:` or SRI's `sha256-` (which limits it to that algorithm), or a whole `sha256sum` or BSD line. It returns the algorithm that matches, or none with the uncomputed algorithms of that length, so a tool can offer to compute them.
- The worker entry (`./worker`) hashes files off the main thread; the component splits the algorithms between a few workers (one less than the processor's threads, at most four), each reading the file once. On a 200 MB file with all 17 algorithms that takes about 20 s here.
- The tests check every algorithm against its official vectors: RFC 1321 (MD5); FIPS 180-4's examples and NIST CAVP (SHA-1, SHA-2, SHA-224, SHA-512/256); FIPS 202's examples and NIST CAVP (SHA-3); RFC 7693 (BLAKE2b, BLAKE2s); the BLAKE3 team's test_vectors.json; the RIPEMD-160 authors' vectors; RFC 4231 and RFC 2202 (HMAC); the check values of CRC-32 (`cbf43926`) and CRC-32C (`e3069283`). Every own algorithm is also compared with Node's `node:crypto` and `node:zlib` on inputs of every length around its block size, split at any point.

## React component

```tsx
import { HashGenerator } from "@web-kit/hash-generator";
import "@web-kit/hash-generator/styles.css";

export function Page() {
  return <HashGenerator />;
}
```

The toolbar has the encoding (hex, HEX, Base64, Base64url), an HMAC switch with the key and its format (Text or Hex), which keep their place while off, Sample, Clear and More actions (load the text from a URL, share link, saved input, shortcuts). The Text pane takes typed or pasted text or a file (Open file or a drop, up to 512 MB): a file shows its name, size and type, and Back to text. The Hashes pane has Verify above the table (the matching row lights up, and "Matches SHA-256" or "No algorithm matches"), one row of one height per algorithm with its own Copy, and More algorithms under the main rows (it opens below them, and the saved input remembers it); Download saves `hashes.txt`, and Copy copies it: a `# <algorithm>` line, then `<hex>  <name>` as `sha256sum` writes it (`-` for the text). Files and texts over 1 MB are hashed in workers, with "Hashing report.iso… 42%"; a new file or Clear cancels them. A share link and the saved input keep the text and the settings, never a file or the key. `useHashGenerator()` gives the same state without markup; set `--wk-hash-height` to change the height of the panes.

## License

MIT
