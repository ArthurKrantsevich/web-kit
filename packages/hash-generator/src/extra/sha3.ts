import { sealed } from "../core/sealed";
import type { Hasher } from "../core/types";

// SHA-3 (FIPS 202): Keccak-f[1600] on 25 lanes of 64 bits, each kept as low and high 32-bit halves: lane x + 5y is at
// s[2(x + 5y)] (low) and s[2(x + 5y) + 1] (high). The rounds are written out step by step (θ, then ρ and π into b,
// then χ and ι); a loop over the lanes is about ten times slower.

/**
 * The 24 round constants of ι as low and high halves, from FIPS 202's LFSR rc(t): bit 2^j − 1 of round i is rc(j + 7i).
 */
const RC = new Int32Array(48);
for (let t = 0, r = 1; t < 168; t++) {
  const round = Math.floor(t / 7);
  const bit = (1 << t % 7) - 1;
  if (r & 1) RC[round * 2 + (bit >> 5)]! |= 1 << (bit & 31);
  r = (r << 1) ^ (r & 0x80 ? 0x171 : 0);
}

function keccak(s: Int32Array): void {
  let a0 = s[0]!, a1 = s[1]!, a2 = s[2]!, a3 = s[3]!, a4 = s[4]!, a5 = s[5]!, a6 = s[6]!, a7 = s[7]!, a8 = s[8]!, a9 = s[9]!, a10 = s[10]!, a11 = s[11]!, a12 = s[12]!, a13 = s[13]!, a14 = s[14]!, a15 = s[15]!, a16 = s[16]!, a17 = s[17]!, a18 = s[18]!, a19 = s[19]!, a20 = s[20]!, a21 = s[21]!, a22 = s[22]!, a23 = s[23]!, a24 = s[24]!, a25 = s[25]!, a26 = s[26]!, a27 = s[27]!, a28 = s[28]!, a29 = s[29]!, a30 = s[30]!, a31 = s[31]!, a32 = s[32]!, a33 = s[33]!, a34 = s[34]!, a35 = s[35]!, a36 = s[36]!, a37 = s[37]!, a38 = s[38]!, a39 = s[39]!, a40 = s[40]!, a41 = s[41]!, a42 = s[42]!, a43 = s[43]!, a44 = s[44]!, a45 = s[45]!, a46 = s[46]!, a47 = s[47]!, a48 = s[48]!, a49 = s[49]!;
  for (let round = 0; round < 48; round += 2) {
    const c0 = a0 ^ a10 ^ a20 ^ a30 ^ a40;
    const c1 = a1 ^ a11 ^ a21 ^ a31 ^ a41;
    const c2 = a2 ^ a12 ^ a22 ^ a32 ^ a42;
    const c3 = a3 ^ a13 ^ a23 ^ a33 ^ a43;
    const c4 = a4 ^ a14 ^ a24 ^ a34 ^ a44;
    const c5 = a5 ^ a15 ^ a25 ^ a35 ^ a45;
    const c6 = a6 ^ a16 ^ a26 ^ a36 ^ a46;
    const c7 = a7 ^ a17 ^ a27 ^ a37 ^ a47;
    const c8 = a8 ^ a18 ^ a28 ^ a38 ^ a48;
    const c9 = a9 ^ a19 ^ a29 ^ a39 ^ a49;
    const d0 = c8 ^ ((c2 << 1) | (c3 >>> 31));
    const d1 = c9 ^ ((c3 << 1) | (c2 >>> 31));
    const d2 = c0 ^ ((c4 << 1) | (c5 >>> 31));
    const d3 = c1 ^ ((c5 << 1) | (c4 >>> 31));
    const d4 = c2 ^ ((c6 << 1) | (c7 >>> 31));
    const d5 = c3 ^ ((c7 << 1) | (c6 >>> 31));
    const d6 = c4 ^ ((c8 << 1) | (c9 >>> 31));
    const d7 = c5 ^ ((c9 << 1) | (c8 >>> 31));
    const d8 = c6 ^ ((c0 << 1) | (c1 >>> 31));
    const d9 = c7 ^ ((c1 << 1) | (c0 >>> 31));
    const b0 = a0 ^ d0;
    const b1 = a1 ^ d1;
    const t32 = a10 ^ d0;
    const t33 = a11 ^ d1;
    const b32 = (t33 << 4) | (t32 >>> 28);
    const b33 = (t32 << 4) | (t33 >>> 28);
    const t14 = a20 ^ d0;
    const t15 = a21 ^ d1;
    const b14 = (t14 << 3) | (t15 >>> 29);
    const b15 = (t15 << 3) | (t14 >>> 29);
    const t46 = a30 ^ d0;
    const t47 = a31 ^ d1;
    const b46 = (t47 << 9) | (t46 >>> 23);
    const b47 = (t46 << 9) | (t47 >>> 23);
    const t28 = a40 ^ d0;
    const t29 = a41 ^ d1;
    const b28 = (t28 << 18) | (t29 >>> 14);
    const b29 = (t29 << 18) | (t28 >>> 14);
    const t20 = a2 ^ d2;
    const t21 = a3 ^ d3;
    const b20 = (t20 << 1) | (t21 >>> 31);
    const b21 = (t21 << 1) | (t20 >>> 31);
    const t2 = a12 ^ d2;
    const t3 = a13 ^ d3;
    const b2 = (t3 << 12) | (t2 >>> 20);
    const b3 = (t2 << 12) | (t3 >>> 20);
    const t34 = a22 ^ d2;
    const t35 = a23 ^ d3;
    const b34 = (t34 << 10) | (t35 >>> 22);
    const b35 = (t35 << 10) | (t34 >>> 22);
    const t16 = a32 ^ d2;
    const t17 = a33 ^ d3;
    const b16 = (t17 << 13) | (t16 >>> 19);
    const b17 = (t16 << 13) | (t17 >>> 19);
    const t48 = a42 ^ d2;
    const t49 = a43 ^ d3;
    const b48 = (t48 << 2) | (t49 >>> 30);
    const b49 = (t49 << 2) | (t48 >>> 30);
    const t40 = a4 ^ d4;
    const t41 = a5 ^ d5;
    const b40 = (t41 << 30) | (t40 >>> 2);
    const b41 = (t40 << 30) | (t41 >>> 2);
    const t22 = a14 ^ d4;
    const t23 = a15 ^ d5;
    const b22 = (t22 << 6) | (t23 >>> 26);
    const b23 = (t23 << 6) | (t22 >>> 26);
    const t4 = a24 ^ d4;
    const t5 = a25 ^ d5;
    const b4 = (t5 << 11) | (t4 >>> 21);
    const b5 = (t4 << 11) | (t5 >>> 21);
    const t36 = a34 ^ d4;
    const t37 = a35 ^ d5;
    const b36 = (t36 << 15) | (t37 >>> 17);
    const b37 = (t37 << 15) | (t36 >>> 17);
    const t18 = a44 ^ d4;
    const t19 = a45 ^ d5;
    const b18 = (t19 << 29) | (t18 >>> 3);
    const b19 = (t18 << 29) | (t19 >>> 3);
    const t10 = a6 ^ d6;
    const t11 = a7 ^ d7;
    const b10 = (t10 << 28) | (t11 >>> 4);
    const b11 = (t11 << 28) | (t10 >>> 4);
    const t42 = a16 ^ d6;
    const t43 = a17 ^ d7;
    const b42 = (t43 << 23) | (t42 >>> 9);
    const b43 = (t42 << 23) | (t43 >>> 9);
    const t24 = a26 ^ d6;
    const t25 = a27 ^ d7;
    const b24 = (t24 << 25) | (t25 >>> 7);
    const b25 = (t25 << 25) | (t24 >>> 7);
    const t6 = a36 ^ d6;
    const t7 = a37 ^ d7;
    const b6 = (t6 << 21) | (t7 >>> 11);
    const b7 = (t7 << 21) | (t6 >>> 11);
    const t38 = a46 ^ d6;
    const t39 = a47 ^ d7;
    const b38 = (t39 << 24) | (t38 >>> 8);
    const b39 = (t38 << 24) | (t39 >>> 8);
    const t30 = a8 ^ d8;
    const t31 = a9 ^ d9;
    const b30 = (t30 << 27) | (t31 >>> 5);
    const b31 = (t31 << 27) | (t30 >>> 5);
    const t12 = a18 ^ d8;
    const t13 = a19 ^ d9;
    const b12 = (t12 << 20) | (t13 >>> 12);
    const b13 = (t13 << 20) | (t12 >>> 12);
    const t44 = a28 ^ d8;
    const t45 = a29 ^ d9;
    const b44 = (t45 << 7) | (t44 >>> 25);
    const b45 = (t44 << 7) | (t45 >>> 25);
    const t26 = a38 ^ d8;
    const t27 = a39 ^ d9;
    const b26 = (t26 << 8) | (t27 >>> 24);
    const b27 = (t27 << 8) | (t26 >>> 24);
    const t8 = a48 ^ d8;
    const t9 = a49 ^ d9;
    const b8 = (t8 << 14) | (t9 >>> 18);
    const b9 = (t9 << 14) | (t8 >>> 18);
    a0 = b0 ^ (~b2 & b4) ^ RC[round + 0]!;
    a1 = b1 ^ (~b3 & b5) ^ RC[round + 1]!;
    a2 = b2 ^ (~b4 & b6);
    a3 = b3 ^ (~b5 & b7);
    a4 = b4 ^ (~b6 & b8);
    a5 = b5 ^ (~b7 & b9);
    a6 = b6 ^ (~b8 & b0);
    a7 = b7 ^ (~b9 & b1);
    a8 = b8 ^ (~b0 & b2);
    a9 = b9 ^ (~b1 & b3);
    a10 = b10 ^ (~b12 & b14);
    a11 = b11 ^ (~b13 & b15);
    a12 = b12 ^ (~b14 & b16);
    a13 = b13 ^ (~b15 & b17);
    a14 = b14 ^ (~b16 & b18);
    a15 = b15 ^ (~b17 & b19);
    a16 = b16 ^ (~b18 & b10);
    a17 = b17 ^ (~b19 & b11);
    a18 = b18 ^ (~b10 & b12);
    a19 = b19 ^ (~b11 & b13);
    a20 = b20 ^ (~b22 & b24);
    a21 = b21 ^ (~b23 & b25);
    a22 = b22 ^ (~b24 & b26);
    a23 = b23 ^ (~b25 & b27);
    a24 = b24 ^ (~b26 & b28);
    a25 = b25 ^ (~b27 & b29);
    a26 = b26 ^ (~b28 & b20);
    a27 = b27 ^ (~b29 & b21);
    a28 = b28 ^ (~b20 & b22);
    a29 = b29 ^ (~b21 & b23);
    a30 = b30 ^ (~b32 & b34);
    a31 = b31 ^ (~b33 & b35);
    a32 = b32 ^ (~b34 & b36);
    a33 = b33 ^ (~b35 & b37);
    a34 = b34 ^ (~b36 & b38);
    a35 = b35 ^ (~b37 & b39);
    a36 = b36 ^ (~b38 & b30);
    a37 = b37 ^ (~b39 & b31);
    a38 = b38 ^ (~b30 & b32);
    a39 = b39 ^ (~b31 & b33);
    a40 = b40 ^ (~b42 & b44);
    a41 = b41 ^ (~b43 & b45);
    a42 = b42 ^ (~b44 & b46);
    a43 = b43 ^ (~b45 & b47);
    a44 = b44 ^ (~b46 & b48);
    a45 = b45 ^ (~b47 & b49);
    a46 = b46 ^ (~b48 & b40);
    a47 = b47 ^ (~b49 & b41);
    a48 = b48 ^ (~b40 & b42);
    a49 = b49 ^ (~b41 & b43);
  }
  s[0] = a0;
  s[1] = a1;
  s[2] = a2;
  s[3] = a3;
  s[4] = a4;
  s[5] = a5;
  s[6] = a6;
  s[7] = a7;
  s[8] = a8;
  s[9] = a9;
  s[10] = a10;
  s[11] = a11;
  s[12] = a12;
  s[13] = a13;
  s[14] = a14;
  s[15] = a15;
  s[16] = a16;
  s[17] = a17;
  s[18] = a18;
  s[19] = a19;
  s[20] = a20;
  s[21] = a21;
  s[22] = a22;
  s[23] = a23;
  s[24] = a24;
  s[25] = a25;
  s[26] = a26;
  s[27] = a27;
  s[28] = a28;
  s[29] = a29;
  s[30] = a30;
  s[31] = a31;
  s[32] = a32;
  s[33] = a33;
  s[34] = a34;
  s[35] = a35;
  s[36] = a36;
  s[37] = a37;
  s[38] = a38;
  s[39] = a39;
  s[40] = a40;
  s[41] = a41;
  s[42] = a42;
  s[43] = a43;
  s[44] = a44;
  s[45] = a45;
  s[46] = a46;
  s[47] = a47;
  s[48] = a48;
  s[49] = a49;
}

/** SHA3-224, -256, -384 or -512: absorbs at a rate of 200 − 2 × digest bytes, pads with 0x06 … 0x80. */
export function sha3Hasher(bits: 224 | 256 | 384 | 512): () => Hasher {
  const out = bits / 8;
  const rate = 200 - 2 * out;
  return () => {
    const state = new Int32Array(50);
    // The lanes are little endian, as the bytes of an Int32Array are on every platform browsers run on.
    const bytes = new Uint8Array(state.buffer);
    let at = 0;
    return sealed({
      update(data) {
        let i = 0;
        while (i < data.length) {
          if (at === 0 && data.length - i >= rate) {
            // A whole block: XOR it in 32-bit words.
            for (let k = 0; k < rate / 4; k++, i += 4) state[k]! ^= data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16) | (data[i + 3]! << 24);
            keccak(state);
            continue;
          }
          bytes[at++]! ^= data[i++]!;
          if (at === rate) {
            keccak(state);
            at = 0;
          }
        }
      },
      digest() {
        bytes[at]! ^= 0x06;
        bytes[rate - 1]! ^= 0x80;
        keccak(state);
        return bytes.slice(0, out);
      },
    });
  };
}
