import { crcHasher } from "../core/crc";
import { MAIN_ALGORITHMS } from "../core/algorithms";
import type { HashAlgorithm, Hasher } from "../core/types";
import { createBlake2b, createBlake2s } from "./blake2";
import { createBlake3 } from "./blake3";
import { createRipemd160 } from "./ripemd160";
import { createSha224, createSha512_256 } from "./sha2";
import { sha3Hasher } from "./sha3";

/** CRC-32C (Castagnoli), as iSCSI, ext4 and SSE4.2 use it (check value of "123456789": e3069283). */
export const createCrc32c: () => Hasher = crcHasher(0x82f63b78);
export { createBlake2b, createBlake2s, createBlake3, createRipemd160, createSha224, createSha512_256, sha3Hasher };

/** The algorithms behind "More algorithms", all own and streaming, in the order the table shows them. */
export const EXTRA_ALGORITHMS: readonly HashAlgorithm[] = [
  { id: "sha224", name: "SHA-224", bytes: 28, create: createSha224 },
  { id: "sha512-256", name: "SHA-512/256", bytes: 32, create: createSha512_256 },
  { id: "sha3-224", name: "SHA3-224", bytes: 28, create: sha3Hasher(224) },
  { id: "sha3-256", name: "SHA3-256", bytes: 32, create: sha3Hasher(256) },
  { id: "sha3-384", name: "SHA3-384", bytes: 48, create: sha3Hasher(384) },
  { id: "sha3-512", name: "SHA3-512", bytes: 64, create: sha3Hasher(512) },
  { id: "blake2b-512", name: "BLAKE2b-512", bytes: 64, create: createBlake2b },
  { id: "blake2s-256", name: "BLAKE2s-256", bytes: 32, create: createBlake2s },
  { id: "blake3-256", name: "BLAKE3-256", bytes: 32, create: createBlake3 },
  { id: "ripemd160", name: "RIPEMD-160", bytes: 20, create: createRipemd160 },
  { id: "crc32c", name: "CRC32C", bytes: 4, create: createCrc32c },
];

/** Main and extra algorithms together. */
export const ALL_ALGORITHMS: readonly HashAlgorithm[] = [...MAIN_ALGORITHMS, ...EXTRA_ALGORITHMS];
