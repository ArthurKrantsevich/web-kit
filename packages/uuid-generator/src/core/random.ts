import type { RandomSource } from "./types";

/** `crypto.getRandomValues` of the browser, a worker or Node 20+: the only source of randomness in this package. */
export const cryptoRandom: RandomSource = (bytes) => {
  crypto.getRandomValues(bytes);
};

/** `count` random bytes. */
export function randomBytes(random: RandomSource, count: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(count);
  random(bytes);
  return bytes;
}
