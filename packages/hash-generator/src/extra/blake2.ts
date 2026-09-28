import { wordBytes } from "../core/md";
import type { Hasher } from "../core/types";

// BLAKE2b-512 and BLAKE2s-256 without a key (RFC 7693). The last block is compressed only in digest(), with its flag.

/** Message schedule of RFC 7693 §2.7; BLAKE2b's rounds 10 and 11 use rows 0 and 1 again. */
export const SIGMA: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
];

/** SHA-256's initial value: BLAKE2s's and BLAKE3's IV. */
export const IV32: readonly number[] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
/** SHA-512's initial value as high and low halves: BLAKE2b's IV. */
const IV64 = [
  0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1, 0x510e527f, 0xade682d1, 0x9b05688c,
  0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179,
];

/** Buffers input so the last block (never an empty one after data) is still unprocessed when digest() is called. */
function blake2Frame(blockSize: number, compress: (block: Uint8Array, offset: number, length: number, last: boolean) => void, output: () => Uint8Array<ArrayBuffer>): Hasher {
  const buffer = new Uint8Array(blockSize);
  let filled = 0;
  let total = 0;
  return {
    update(bytes) {
      let at = 0;
      while (at < bytes.length) {
        if (filled === blockSize) {
          compress(buffer, 0, total, false);
          filled = 0;
        }
        if (filled === 0 && bytes.length - at > blockSize) {
          // Whole blocks straight from the input, keeping at least one byte back for the last block.
          total += blockSize;
          compress(bytes, at, total, false);
          at += blockSize;
          continue;
        }
        const take = Math.min(blockSize - filled, bytes.length - at);
        buffer.set(bytes.subarray(at, at + take), filled);
        filled += take;
        total += take;
        at += take;
      }
    },
    digest() {
      buffer.fill(0, filled);
      compress(buffer, 0, total, true);
      return output();
    },
  };
}

export function createBlake2s(): Hasher {
  const h = new Int32Array(IV32);
  h[0] = h[0]! ^ 0x01010020;
  const v = new Int32Array(16);
  const m = new Int32Array(16);
  const g = (a: number, b: number, c: number, d: number, x: number, y: number): void => {
    let va = v[a]!, vb = v[b]!, vc = v[c]!, vd = v[d]!;
    va = (va + vb + x) | 0;
    vd ^= va;
    vd = (vd >>> 16) | (vd << 16);
    vc = (vc + vd) | 0;
    vb ^= vc;
    vb = (vb >>> 12) | (vb << 20);
    va = (va + vb + y) | 0;
    vd ^= va;
    vd = (vd >>> 8) | (vd << 24);
    vc = (vc + vd) | 0;
    vb ^= vc;
    vb = (vb >>> 7) | (vb << 25);
    v[a] = va;
    v[b] = vb;
    v[c] = vc;
    v[d] = vd;
  };
  return blake2Frame(
    64,
    (block, offset, total, last) => {
      for (let i = 0; i < 16; i++) {
        const o = offset + i * 4;
        m[i] = block[o]! | (block[o + 1]! << 8) | (block[o + 2]! << 16) | (block[o + 3]! << 24);
      }
      v.set(h);
      v.set(IV32, 8);
      v[12] = v[12]! ^ total;
      v[13] = v[13]! ^ ((total / 0x100000000) | 0);
      if (last) v[14] = ~v[14]!;
      for (let round = 0; round < 10; round++) {
        const s = SIGMA[round]!;
        g(0, 4, 8, 12, m[s[0]!]!, m[s[1]!]!);
        g(1, 5, 9, 13, m[s[2]!]!, m[s[3]!]!);
        g(2, 6, 10, 14, m[s[4]!]!, m[s[5]!]!);
        g(3, 7, 11, 15, m[s[6]!]!, m[s[7]!]!);
        g(0, 5, 10, 15, m[s[8]!]!, m[s[9]!]!);
        g(1, 6, 11, 12, m[s[10]!]!, m[s[11]!]!);
        g(2, 7, 8, 13, m[s[12]!]!, m[s[13]!]!);
        g(3, 4, 9, 14, m[s[14]!]!, m[s[15]!]!);
      }
      for (let i = 0; i < 8; i++) h[i] = h[i]! ^ v[i]! ^ v[i + 8]!;
    },
    () => wordBytes(h, true),
  );
}

export function createBlake2b(): Hasher {
  // 64-bit words as [low, high] pairs.
  const h = new Int32Array(16);
  for (let i = 0; i < 8; i++) {
    h[i * 2] = IV64[i * 2 + 1]!;
    h[i * 2 + 1] = IV64[i * 2]!;
  }
  h[0] = h[0]! ^ 0x01010040;
  const iv = new Int32Array(h.length);
  for (let i = 0; i < 8; i++) {
    iv[i * 2] = IV64[i * 2 + 1]!;
    iv[i * 2 + 1] = IV64[i * 2]!;
  }
  const v = new Int32Array(32);
  const m = new Int32Array(32);
  /** v[a] += v[b] + (x0, x1), all 64-bit. */
  const add3 = (a: number, b: number, x0: number, x1: number): void => {
    const low = (v[a]! >>> 0) + (v[b]! >>> 0) + (x0 >>> 0);
    v[a + 1] = (v[a + 1]! + v[b + 1]! + x1 + ((low / 0x100000000) | 0)) | 0;
    v[a] = low | 0;
  };
  const g = (a: number, b: number, c: number, d: number, ix: number, iy: number): void => {
    add3(a, b, m[ix]!, m[ix + 1]!);
    // d = rotr64(d ^ a, 32): swap the halves.
    let xl = v[d]! ^ v[a]!;
    let xh = v[d + 1]! ^ v[a + 1]!;
    v[d] = xh;
    v[d + 1] = xl;
    add3(c, d, 0, 0);
    // b = rotr64(b ^ c, 24)
    xl = v[b]! ^ v[c]!;
    xh = v[b + 1]! ^ v[c + 1]!;
    v[b] = (xl >>> 24) | (xh << 8);
    v[b + 1] = (xh >>> 24) | (xl << 8);
    add3(a, b, m[iy]!, m[iy + 1]!);
    // d = rotr64(d ^ a, 16)
    xl = v[d]! ^ v[a]!;
    xh = v[d + 1]! ^ v[a + 1]!;
    v[d] = (xl >>> 16) | (xh << 16);
    v[d + 1] = (xh >>> 16) | (xl << 16);
    add3(c, d, 0, 0);
    // b = rotr64(b ^ c, 63) = rotl64(b ^ c, 1)
    xl = v[b]! ^ v[c]!;
    xh = v[b + 1]! ^ v[c + 1]!;
    v[b] = (xh >>> 31) | (xl << 1);
    v[b + 1] = (xl >>> 31) | (xh << 1);
  };
  return blake2Frame(
    128,
    (block, offset, total, last) => {
      for (let i = 0; i < 32; i++) {
        const o = offset + i * 4;
        m[i] = block[o]! | (block[o + 1]! << 8) | (block[o + 2]! << 16) | (block[o + 3]! << 24);
      }
      v.set(h);
      v.set(iv, 16);
      v[24] = v[24]! ^ total;
      v[25] = v[25]! ^ ((total / 0x100000000) | 0);
      if (last) {
        v[28] = ~v[28]!;
        v[29] = ~v[29]!;
      }
      for (let round = 0; round < 12; round++) {
        const s = SIGMA[round % 10]!;
        g(0, 8, 16, 24, s[0]! * 2, s[1]! * 2);
        g(2, 10, 18, 26, s[2]! * 2, s[3]! * 2);
        g(4, 12, 20, 28, s[4]! * 2, s[5]! * 2);
        g(6, 14, 22, 30, s[6]! * 2, s[7]! * 2);
        g(0, 10, 20, 30, s[8]! * 2, s[9]! * 2);
        g(2, 12, 22, 24, s[10]! * 2, s[11]! * 2);
        g(4, 14, 16, 26, s[12]! * 2, s[13]! * 2);
        g(6, 8, 18, 28, s[14]! * 2, s[15]! * 2);
      }
      for (let i = 0; i < 16; i++) h[i] = h[i]! ^ v[i]! ^ v[i + 16]!;
    },
    () => wordBytes(h, true),
  );
}
