import type { Hasher } from "./types";

/**
 * The Merkle–Damgård frame of MD5, RIPEMD-160 and SHA-2: full blocks go to `compress` straight from the input, the
 * rest waits in a buffer; `digest` pads with 0x80, zeros and the length in bits (8 bytes, or 16 for 128-byte blocks),
 * little endian for MD5 and RIPEMD-160, big endian for SHA-2.
 */
export function mdHasher(
  blockSize: 64 | 128,
  littleEndian: boolean,
  compress: (data: Uint8Array, offset: number) => void,
  output: () => Uint8Array<ArrayBuffer>,
): Hasher {
  const buffer = new Uint8Array(blockSize);
  let filled = 0;
  let length = 0;
  function feed(bytes: Uint8Array): void {
    let at = 0;
    if (filled > 0) {
      at = Math.min(blockSize - filled, bytes.length);
      buffer.set(bytes.subarray(0, at), filled);
      filled += at;
      if (filled < blockSize) return;
      compress(buffer, 0);
      filled = 0;
    }
    for (; at + blockSize <= bytes.length; at += blockSize) compress(bytes, at);
    buffer.set(bytes.subarray(at), 0);
    filled = bytes.length - at;
  }
  return {
    update(bytes) {
      length += bytes.length;
      feed(bytes);
    },
    digest() {
      const lengthBytes = blockSize / 8;
      const pad = new Uint8Array((filled + 1 + lengthBytes <= blockSize ? blockSize : 2 * blockSize) - filled);
      pad[0] = 0x80;
      const view = new DataView(pad.buffer);
      const bits = length * 8;
      const high = Math.floor(bits / 2 ** 32);
      if (littleEndian) {
        view.setUint32(pad.length - lengthBytes, bits >>> 0, true);
        view.setUint32(pad.length - lengthBytes + 4, high, true);
      } else {
        view.setUint32(pad.length - 8, high);
        view.setUint32(pad.length - 4, bits >>> 0);
      }
      feed(pad);
      return output();
    },
  };
}

/** 32-bit words as bytes. */
export function wordBytes(words: ArrayLike<number>, littleEndian: boolean, count: number = words.length * 4): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < words.length; i++) view.setUint32(i * 4, words[i]! >>> 0, littleEndian);
  return bytes.slice(0, count);
}
