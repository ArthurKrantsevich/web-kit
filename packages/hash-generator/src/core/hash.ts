import { MAIN_ALGORITHMS } from "./algorithms";
import type { HashAlgorithm, HashResults, HmacKey, Result } from "./types";
import { keyBytes, webDigest } from "./webcrypto";

/** A Blob is read in parts of this size (4 MB). */
export const CHUNK_SIZE: number = 4 * 1024 * 1024;

export interface HashOptions {
  /** With a key, the Web Crypto algorithms give HMACs and the others nothing. */
  hmacKey?: HmacKey;
  /** Default: the main algorithms. Add `EXTRA_ALGORITHMS` from `@web-kit/hash-generator/extra` for the rest. */
  algorithms?: readonly HashAlgorithm[];
  /** A Blob is read in parts of this many bytes. Default 4 MB. */
  chunkSize?: number;
  /** After each part: the bytes read so far. */
  onProgress?: (done: number) => void;
  /** Awaited after each part of a Blob, e.g. to let a page draw a frame. */
  pause?: () => Promise<void>;
  /** Stops reading a Blob; the result is then an error "Cancelled". */
  signal?: AbortSignal;
}

/**
 * Every algorithm's digest of a text (as UTF-8), of bytes, or of a Blob (a File) read part by part: the own algorithms
 * take each part as it comes, in one pass. Web Crypto has no streaming, so for SHA-1 and SHA-2 the parts are also
 * copied into one buffer of the Blob's size and digested at the end. Refuses an HMAC key it cannot read.
 */
export async function hashAll(input: string | Uint8Array<ArrayBuffer> | Blob, options: HashOptions = {}): Promise<Result<HashResults>> {
  const { hmacKey, algorithms = MAIN_ALGORITHMS, chunkSize = CHUNK_SIZE, onProgress, pause, signal } = options;
  let key: Uint8Array<ArrayBuffer> | null = null;
  if (hmacKey) {
    const bytes = keyBytes(hmacKey);
    if (!bytes.ok) return bytes;
    key = bytes.value;
  }
  // An HMAC exists only for the Web Crypto algorithms.
  const own = key === null ? algorithms.filter((algorithm) => algorithm.create) : [];
  const web = algorithms.filter((algorithm) => algorithm.webCrypto);
  const hashers = own.map((algorithm) => ({ id: algorithm.id, hasher: algorithm.create!() }));
  let whole: Uint8Array<ArrayBuffer>;
  // ArrayBuffer.isView, not instanceof: bytes made in another realm (an iframe, a test DOM) are bytes too.
  if (typeof input === "string" || ArrayBuffer.isView(input)) {
    whole = typeof input === "string" ? new TextEncoder().encode(input) : (input as Uint8Array<ArrayBuffer>);
    for (const { hasher } of hashers) hasher.update(whole);
    onProgress?.(whole.length);
  } else {
    whole = new Uint8Array(web.length > 0 ? input.size : 0);
    for (let at = 0; at < input.size; at += chunkSize) {
      if (signal?.aborted) return { ok: false, error: { message: "Cancelled" } };
      let part: Uint8Array<ArrayBuffer>;
      try {
        part = new Uint8Array(await input.slice(at, at + chunkSize).arrayBuffer());
      } catch {
        return { ok: false, error: { message: "Could not read the file" } };
      }
      for (const { hasher } of hashers) hasher.update(part);
      if (whole.length > 0) whole.set(part, at);
      onProgress?.(at + part.length);
      await pause?.();
    }
    if (signal?.aborted) return { ok: false, error: { message: "Cancelled" } };
  }
  const digests: HashResults = {};
  for (const { id, hasher } of hashers) digests[id] = hasher.digest();
  for (const algorithm of web) {
    const name = algorithm.webCrypto!;
    if (key === null) digests[algorithm.id] = await webDigest(name, whole);
    else {
      const imported = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: name }, false, ["sign"]);
      digests[algorithm.id] = new Uint8Array(await crypto.subtle.sign("HMAC", imported, whole));
    }
  }
  // In the order of `algorithms`, as the table lists them.
  const results: HashResults = {};
  for (const algorithm of algorithms) if (digests[algorithm.id]) results[algorithm.id] = digests[algorithm.id];
  return { ok: true, value: results };
}
