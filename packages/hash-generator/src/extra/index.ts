import { crcHasher } from "../core/crc";
import type { Hasher } from "../core/types";
import { createRipemd160 } from "./ripemd160";
import { createSha224, createSha512_256 } from "./sha2";

/** CRC-32C (Castagnoli), as iSCSI, ext4 and SSE4.2 use it (check value of "123456789": e3069283). */
export const createCrc32c: () => Hasher = crcHasher(0x82f63b78);
export { createRipemd160, createSha224, createSha512_256 };
