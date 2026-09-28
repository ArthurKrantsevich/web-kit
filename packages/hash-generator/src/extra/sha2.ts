import { mdHasher, wordBytes } from "../core/md";
import type { Hasher } from "../core/types";

// SHA-224 and SHA-512/256 (FIPS 180-4): SHA-256 and SHA-512 with other initial values, cut short. The other SHA-2
// variants come from Web Crypto, which has neither of these two.

/** The first 32 bits of the fractional parts of the cube roots of the first 64 primes (FIPS 180-4 §4.2.2). */
const K256 = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-224's initial hash value (FIPS 180-4 §5.3.2). */
const IV224 = [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4];

export function createSha224(): Hasher {
  const h = new Int32Array(IV224);
  const w = new Int32Array(64);
  return mdHasher(
    64,
    false,
    (data, offset) => {
      for (let i = 0; i < 16; i++) {
        const o = offset + i * 4;
        w[i] = (data[o]! << 24) | (data[o + 1]! << 16) | (data[o + 2]! << 8) | data[o + 3]!;
      }
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15]!;
        const b = w[i - 2]!;
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
      }
      let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K256[i]! + w[i]!) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }
      h[0] = (h[0]! + a) | 0;
      h[1] = (h[1]! + b) | 0;
      h[2] = (h[2]! + c) | 0;
      h[3] = (h[3]! + d) | 0;
      h[4] = (h[4]! + e) | 0;
      h[5] = (h[5]! + f) | 0;
      h[6] = (h[6]! + g) | 0;
      h[7] = (h[7]! + hh) | 0;
    },
    () => wordBytes(h, false, 28),
  );
}

/** The 80 constants of SHA-512 as high and low 32-bit halves (FIPS 180-4 §4.2.3). */
const K512 = new Int32Array([
  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc, 0x3956c25b, 0xf348b538,
  0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118, 0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe,
  0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2, 0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235,
  0xc19bf174, 0xcf692694, 0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3, 0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
  0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5, 0x983e5152, 0xee66dfab,
  0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4, 0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725,
  0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70, 0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed,
  0x53380d13, 0x9d95b3df, 0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
  0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30, 0xd192e819, 0xd6ef5218,
  0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8, 0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53,
  0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8, 0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb, 0x5b9cca4f, 0x7763e373,
  0x682e6ff3, 0xd6b2b8a3, 0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
  0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b, 0xca273ece, 0xea26619c,
  0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178, 0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6,
  0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b, 0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc,
  0x431d67c4, 0x9c100d4c, 0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817,
]);

/** SHA-512/256's initial hash value (FIPS 180-4 §5.3.6.2), as high and low halves. */
const IV512_256 = [
  0x22312194, 0xfc2bf72c, 0x9f555fa3, 0xc84c64c2, 0x2393b86b, 0x6f53b151, 0x96387719, 0x5940eabd, 0x96283ee2, 0xa88effe3,
  0xbe5e1e25, 0x53863992, 0x2b0199fc, 0x2c85b8aa, 0x0eb72ddc, 0x81c52ca2,
];

export function createSha512_256(): Hasher {
  const h = new Int32Array(IV512_256);
  const w = new Int32Array(160);
  return mdHasher(
    128,
    false,
    (data, offset) => {
      for (let i = 0; i < 32; i++) {
        const o = offset + i * 4;
        w[i] = (data[o]! << 24) | (data[o + 1]! << 16) | (data[o + 2]! << 8) | data[o + 3]!;
      }
      for (let i = 32; i < 160; i += 2) {
        // σ0 of w[t-15]: rotr 1 ^ rotr 8 ^ shr 7; σ1 of w[t-2]: rotr 19 ^ rotr 61 ^ shr 6.
        let xh = w[i - 30]!;
        let xl = w[i - 29]!;
        const s0h = ((xh >>> 1) | (xl << 31)) ^ ((xh >>> 8) | (xl << 24)) ^ (xh >>> 7);
        const s0l = ((xl >>> 1) | (xh << 31)) ^ ((xl >>> 8) | (xh << 24)) ^ ((xl >>> 7) | (xh << 25));
        xh = w[i - 4]!;
        xl = w[i - 3]!;
        const s1h = ((xh >>> 19) | (xl << 13)) ^ ((xl >>> 29) | (xh << 3)) ^ (xh >>> 6);
        const s1l = ((xl >>> 19) | (xh << 13)) ^ ((xh >>> 29) | (xl << 3)) ^ ((xl >>> 6) | (xh << 26));
        const l = (s0l >>> 0) + (s1l >>> 0) + (w[i - 13]! >>> 0) + (w[i - 31]! >>> 0);
        w[i] = (s0h + s1h + w[i - 14]! + w[i - 32]! + ((l / 0x100000000) | 0)) | 0;
        w[i + 1] = l | 0;
      }
      let ah = h[0]!, al = h[1]!, bh = h[2]!, bl = h[3]!, ch = h[4]!, cl = h[5]!, dh = h[6]!, dl = h[7]!;
      let eh = h[8]!, el = h[9]!, fh = h[10]!, fl = h[11]!, gh = h[12]!, gl = h[13]!, hh = h[14]!, hl = h[15]!;
      for (let i = 0; i < 160; i += 2) {
        // Σ1(e): rotr 14 ^ rotr 18 ^ rotr 41; Σ0(a): rotr 28 ^ rotr 34 ^ rotr 39.
        const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23));
        const S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
        const chh = (eh & fh) ^ (~eh & gh);
        const chl = (el & fl) ^ (~el & gl);
        const t1l = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + (K512[i + 1]! >>> 0) + (w[i + 1]! >>> 0);
        const t1h = (hh + S1h + chh + K512[i]! + w[i]! + ((t1l / 0x100000000) | 0)) | 0;
        const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25));
        const S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
        const majh = (ah & bh) ^ (ah & ch) ^ (bh & ch);
        const majl = (al & bl) ^ (al & cl) ^ (bl & cl);
        const t2l = (S0l >>> 0) + (majl >>> 0);
        const t2h = (S0h + majh + ((t2l / 0x100000000) | 0)) | 0;
        hh = gh;
        hl = gl;
        gh = fh;
        gl = fl;
        fh = eh;
        fl = el;
        const el2 = (dl >>> 0) + (t1l >>> 0);
        eh = (dh + t1h + ((el2 / 0x100000000) | 0)) | 0;
        el = el2 | 0;
        dh = ch;
        dl = cl;
        ch = bh;
        cl = bl;
        bh = ah;
        bl = al;
        const al2 = (t1l >>> 0) + (t2l >>> 0);
        ah = (t1h + t2h + ((al2 / 0x100000000) | 0)) | 0;
        al = al2 | 0;
      }
      const add = (index: number, high: number, low: number): void => {
        const sum = (h[index + 1]! >>> 0) + (low >>> 0);
        h[index] = (h[index]! + high + ((sum / 0x100000000) | 0)) | 0;
        h[index + 1] = sum | 0;
      };
      add(0, ah, al);
      add(2, bh, bl);
      add(4, ch, cl);
      add(6, dh, dl);
      add(8, eh, el);
      add(10, fh, fl);
      add(12, gh, gl);
      add(14, hh, hl);
    },
    () => wordBytes(h, false, 32),
  );
}
