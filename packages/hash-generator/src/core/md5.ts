import { mdHasher, wordBytes } from "./md";
import type { Hasher } from "./types";

/** RFC 1321 §3.4: the shifts of each round and the integer parts of |sin(i + 1)| × 2³². */
const S = new Int32Array([7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]);
const K = Int32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);

/** MD5 (RFC 1321), streaming. Broken for security; still the usual checksum of downloads. */
export function createMd5(): Hasher {
  const h = new Int32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
  const x = new Int32Array(16);
  return mdHasher(
    64,
    true,
    (data, offset) => {
      for (let i = 0; i < 16; i++) {
        const o = offset + i * 4;
        x[i] = data[o]! | (data[o + 1]! << 8) | (data[o + 2]! << 16) | (data[o + 3]! << 24);
      }
      let a = h[0]!;
      let b = h[1]!;
      let c = h[2]!;
      let d = h[3]!;
      // One loop per round, so no step has to pick its function.
      for (let i = 0; i < 16; i++) {
        const t = (a + ((b & c) | (~b & d)) + K[i]! + x[i]!) | 0;
        const s = S[i & 3]!;
        a = d;
        d = c;
        c = b;
        b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
      }
      for (let i = 16; i < 32; i++) {
        const t = (a + ((d & b) | (~d & c)) + K[i]! + x[(5 * i + 1) & 15]!) | 0;
        const s = S[4 + (i & 3)]!;
        a = d;
        d = c;
        c = b;
        b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
      }
      for (let i = 32; i < 48; i++) {
        const t = (a + (b ^ c ^ d) + K[i]! + x[(3 * i + 5) & 15]!) | 0;
        const s = S[8 + (i & 3)]!;
        a = d;
        d = c;
        c = b;
        b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
      }
      for (let i = 48; i < 64; i++) {
        const t = (a + (c ^ (b | ~d)) + K[i]! + x[(7 * i) & 15]!) | 0;
        const s = S[12 + (i & 3)]!;
        a = d;
        d = c;
        c = b;
        b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
      }
      h[0] = (h[0]! + a) | 0;
      h[1] = (h[1]! + b) | 0;
      h[2] = (h[2]! + c) | 0;
      h[3] = (h[3]! + d) | 0;
    },
    () => wordBytes(h, true),
  );
}
