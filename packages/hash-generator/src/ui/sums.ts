import { encodeDigest } from "../core/encode";
import type { AlgorithmId } from "../core/types";

/**
 * The tag of each algorithm in a BSD tagged line. Where coreutils' `cksum -a` has the algorithm, its name (MD5, SHA1,
 * SHA224 to SHA512, BLAKE2b; SHA3-256 in coreutils 9.8); otherwise the name the usual tool prints (FreeBSD's
 * SHA512t256 and RMD160, b3sum's BLAKE3).
 */
export const SUM_TAGS: Readonly<Record<AlgorithmId, string>> = {
  md5: "MD5",
  sha1: "SHA1",
  sha256: "SHA256",
  sha384: "SHA384",
  sha512: "SHA512",
  crc32: "CRC32",
  sha224: "SHA224",
  "sha512-256": "SHA512t256",
  "sha3-224": "SHA3-224",
  "sha3-256": "SHA3-256",
  "sha3-384": "SHA3-384",
  "sha3-512": "SHA3-512",
  "blake2b-512": "BLAKE2b",
  "blake2s-256": "BLAKE2s",
  "blake3-256": "BLAKE3",
  ripemd160: "RMD160",
  crc32c: "CRC32C",
};

/**
 * The file hashes.txt: one BSD tagged line per digest, `SHA256 (name) = <hex>`. The tag names the algorithm, so
 * `cksum -c` and `sha256sum -c` check each line with its own algorithm (a bare `<hex>  name` line of 64 digits would be
 * checked as SHA-256 whatever made it) and skip the lines they do not know. HMACs are not checksums and are left out.
 */
export function checksumFile(rows: readonly { id: AlgorithmId; digest: Uint8Array }[], fileName: string): string {
  return rows.map(({ id, digest }) => `${SUM_TAGS[id]} (${fileName}) = ${encodeDigest(digest, "hex")}\n`).join("");
}
