import type { Hasher } from "./types";

/**
 * A hasher that keeps its word after digest(): digest() again gives the same bytes (a fresh copy), and update() then
 * throws, since the state has already been finished and more input would silently be lost.
 */
export function sealed(hasher: Hasher): Hasher {
  let done: Uint8Array<ArrayBuffer> | null = null;
  return {
    update(bytes) {
      if (done !== null) throw new Error("This hasher has already given its digest: start a new one for more input");
      hasher.update(bytes);
    },
    digest() {
      done ??= hasher.digest();
      return done.slice();
    },
  };
}
