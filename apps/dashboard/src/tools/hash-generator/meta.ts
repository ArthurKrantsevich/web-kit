import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "hash-generator",
  title: "Hash Generator",
  description: "MD5, SHA-1, SHA-2, SHA-3, BLAKE2, BLAKE3, RIPEMD-160 and CRC32 of a text or a file, with a checksum check and HMAC.",
  preview: `"hello"
sha256  2cf24dba5fb0a30e…
blake3  ea8f163db38682…
verify  ✓ matches SHA-256`,
  category: "generators",
  tags: ["hash", "checksum", "md5", "sha256", "sha3", "blake3", "hmac", "crc32", "sri"],
  pkg: "@web-kit/hash-generator",
  usage: `import { HashGenerator } from "@web-kit/hash-generator";
import "@web-kit/hash-generator/styles.css";

export function Page() {
  return <HashGenerator />;
}

// Logic only, no React:
import { encodeDigest, hashAll, matchDigest } from "@web-kit/hash-generator/core";
import { EXTRA_ALGORITHMS, ALL_ALGORITHMS } from "@web-kit/hash-generator/extra";

const result = await hashAll("hello"); // MD5, SHA-1, SHA-256, SHA-384, SHA-512, CRC32
if (result.ok) encodeDigest(result.value.sha256!, "hex"); // "2cf24dba5fb0a30e…"
await hashAll(file, { algorithms: ALL_ALGORITHMS, onProgress: (bytes) => {} }); // a File, read in 4 MB parts`,
  api: [
    {
      name: "hashAll",
      signature: "hashAll(text | bytes | Blob, { hmacKey?, algorithms?, chunkSize?, onProgress?, signal? }): Promise<Result<HashResults>>",
      description: "Every algorithm in one pass; a Blob is read in 4 MB parts. SHA-1 and SHA-2 by Web Crypto, the rest own and streaming. With a key, HMACs of the Web Crypto algorithms.",
    },
    {
      name: "EXTRA_ALGORITHMS",
      signature: 'import { EXTRA_ALGORITHMS } from "@web-kit/hash-generator/extra"',
      description: "SHA-224, SHA-512/256, SHA3-224/256/384/512, BLAKE2b-512, BLAKE2s-256, BLAKE3-256, RIPEMD-160 and CRC32C, each with create() → update() → digest().",
    },
    {
      name: "matchDigest",
      signature: "matchDigest(expected, results): DigestMatch",
      description: "Which digest a pasted hash is: hex, Base64 or Base64url, with sha256: or SRI's sha256- prefix, or a sha256sum line; it names uncomputed algorithms of the same length.",
    },
    {
      name: "hmac · encodeDigest",
      signature: 'hmac("SHA-256", { text, format: "text" | "hex" }, bytes) · encodeDigest(bytes, "hex" | "HEX" | "base64" | "base64url")',
      description: "HMAC by Web Crypto with a UTF-8 or hex key; a digest in the encoding you need.",
    },
    {
      name: "HashGenerator",
      signature: "<HashGenerator initialSettings? className? />",
      description:
        "Ready-made UI: text or a file up to 512 MB hashed in workers with progress, hex/HEX/Base64/Base64url, More algorithms, Verify, HMAC, Copy each, hashes.txt as BSD tagged lines that cksum -c and sha256sum -c check. The key and files are never saved or shared.",
    },
  ],
};
