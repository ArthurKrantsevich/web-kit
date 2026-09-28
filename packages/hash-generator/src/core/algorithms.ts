import { createCrc32 } from "./crc";
import { createMd5 } from "./md5";
import type { AlgorithmId, HashAlgorithm } from "./types";

/** The main algorithms, in the order the table shows them. SHA-1 and SHA-2 are Web Crypto's; MD5 and CRC32 are own. */
export const MAIN_ALGORITHMS: readonly HashAlgorithm[] = [
  { id: "md5", name: "MD5", bytes: 16, create: createMd5 },
  { id: "sha1", name: "SHA-1", bytes: 20, webCrypto: "SHA-1" },
  { id: "sha256", name: "SHA-256", bytes: 32, webCrypto: "SHA-256" },
  { id: "sha384", name: "SHA-384", bytes: 48, webCrypto: "SHA-384" },
  { id: "sha512", name: "SHA-512", bytes: 64, webCrypto: "SHA-512" },
  { id: "crc32", name: "CRC32", bytes: 4, create: createCrc32 },
];

/**
 * Name and digest length of the algorithms of `@web-kit/hash-generator/extra`, so matchDigest can tell that a hash may
 * be one of them before they are loaded. The order is the table's.
 */
export const EXTRA_INFO: readonly Pick<HashAlgorithm, "id" | "name" | "bytes">[] = [
  { id: "sha224", name: "SHA-224", bytes: 28 },
  { id: "sha512-256", name: "SHA-512/256", bytes: 32 },
  { id: "sha3-224", name: "SHA3-224", bytes: 28 },
  { id: "sha3-256", name: "SHA3-256", bytes: 32 },
  { id: "sha3-384", name: "SHA3-384", bytes: 48 },
  { id: "sha3-512", name: "SHA3-512", bytes: 64 },
  { id: "blake2b-512", name: "BLAKE2b-512", bytes: 64 },
  { id: "blake2s-256", name: "BLAKE2s-256", bytes: 32 },
  { id: "blake3-256", name: "BLAKE3-256", bytes: 32 },
  { id: "ripemd160", name: "RIPEMD-160", bytes: 20 },
  { id: "crc32c", name: "CRC32C", bytes: 4 },
];

/** Name of every algorithm, main and extra. */
export const ALGORITHM_NAMES: Readonly<Record<AlgorithmId, string>> = Object.fromEntries(
  [...MAIN_ALGORITHMS, ...EXTRA_INFO].map((algorithm) => [algorithm.id, algorithm.name]),
) as Record<AlgorithmId, string>;

/** Lowercase, without "-", "_", "/" or spaces: "SHA-512/256" → "sha512256", "sha3_256" → "sha3256". */
export const squash = (name: string): string => name.toLowerCase().replace(/[-_/\s]/g, "");
