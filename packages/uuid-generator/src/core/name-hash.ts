// MD5 (RFC 1321) and SHA-1 (FIPS 180-4) of a whole short input, for UUID v3 and v5 only. They are synchronous, so
// generateIds stays synchronous (Web Crypto's digest is async); @web-kit/hash-generator has the streaming versions.

/** The input padded as MD5 and SHA-1 pad it: 0x80, zeros, and the bit length in 8 bytes (little or big endian). */
function pad(bytes: Uint8Array, littleEndian: boolean): DataView {
  const length = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(length);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = bytes.length * 8;
  view.setUint32(length - (littleEndian ? 8 : 4), bits >>> 0, littleEndian);
  view.setUint32(length - (littleEndian ? 4 : 8), Math.floor(bits / 2 ** 32), littleEndian);
  return view;
}

const rotl = (x: number, n: number): number => (x << n) | (x >>> (32 - n));

/** Per-round shifts and the sines of RFC 1321 §3.4. */
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(bytes: Uint8Array): Uint8Array {
  const view = pad(bytes, true);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let offset = 0; offset < view.byteLength; offset += 64) {
    let [a, b, c, d] = h as [number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const round = i >> 4;
      const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const g = round === 0 ? i : round === 1 ? (5 * i + 1) & 15 : round === 2 ? (3 * i + 5) & 15 : (7 * i) & 15;
      const next = d;
      d = c;
      c = b;
      b = (b + rotl((a + f + MD5_K[i]! + view.getUint32(offset + g * 4, true)) | 0, MD5_S[(round << 2) | (i & 3)]!)) | 0;
      a = next;
    }
    h[0] = (h[0]! + a) | 0;
    h[1] = (h[1]! + b) | 0;
    h[2] = (h[2]! + c) | 0;
    h[3] = (h[3]! + d) | 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  h.forEach((word, i) => out.setUint32(i * 4, word, true));
  return new Uint8Array(out.buffer);
}

export function sha1(bytes: Uint8Array): Uint8Array {
  const view = pad(bytes, false);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Int32Array(80);
  for (let offset = 0; offset < view.byteLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1);
    let [a, b, c, d, e] = h as [number, number, number, number, number];
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 || i >= 60 ? b ^ c ^ d : (b & c) | (b & d) | (c & d);
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const t = (rotl(a, 5) + f + e + k + w[i]!) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = t;
    }
    h[0] = (h[0]! + a) | 0;
    h[1] = (h[1]! + b) | 0;
    h[2] = (h[2]! + c) | 0;
    h[3] = (h[3]! + d) | 0;
    h[4] = (h[4]! + e) | 0;
  }
  const out = new DataView(new ArrayBuffer(20));
  h.forEach((word, i) => out.setUint32(i * 4, word));
  return new Uint8Array(out.buffer);
}
