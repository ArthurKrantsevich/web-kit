import { sealed } from "./sealed";
import type { Hasher } from "./types";

/** A reflected CRC-32 with this polynomial (reversed form), table driven, streaming; the digest is big endian. */
export function crcHasher(polynomial: number): () => Hasher {
  let table: Int32Array | null = null;
  return () => {
    if (table === null) {
      table = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? polynomial ^ (c >>> 1) : c >>> 1;
        table[n] = c;
      }
    }
    const lookup = table;
    let crc = -1;
    return sealed({
      update(bytes) {
        for (let i = 0; i < bytes.length; i++) crc = lookup[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
      },
      digest() {
        const out = new Uint8Array(4);
        new DataView(out.buffer).setUint32(0, ~crc >>> 0);
        return out;
      },
    });
  };
}

/** CRC-32/ISO-HDLC, as zip, gzip and PNG use it (check value of "123456789": cbf43926). */
export const createCrc32: () => Hasher = crcHasher(0xedb88320);
