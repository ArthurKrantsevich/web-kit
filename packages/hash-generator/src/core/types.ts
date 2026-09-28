/** A result that says why the input was refused instead of throwing: `{ ok: false, error: { message } }`. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: { message: string } };

/** An algorithm computed piece by piece: `update` any number of times, then `digest` once. */
export interface Hasher {
  update(bytes: Uint8Array): void;
  digest(): Uint8Array<ArrayBuffer>;
}

/** The main algorithms, shown at once. */
export type MainAlgorithmId = "md5" | "sha1" | "sha256" | "sha384" | "sha512" | "crc32";
/** The algorithms behind "More algorithms", from `@web-kit/hash-generator/extra`. */
export type ExtraAlgorithmId =
  | "sha224"
  | "sha512-256"
  | "sha3-224"
  | "sha3-256"
  | "sha3-384"
  | "sha3-512"
  | "blake2b-512"
  | "blake2s-256"
  | "blake3-256"
  | "ripemd160"
  | "crc32c";
export type AlgorithmId = MainAlgorithmId | ExtraAlgorithmId;

/** The four algorithms of Web Crypto, which also make HMACs. */
export type WebCryptoName = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export interface HashAlgorithm {
  id: AlgorithmId;
  /** "SHA-256", "BLAKE2b-512". */
  name: string;
  /** Length of the digest in bytes. */
  bytes: number;
  /** An own, streaming implementation. */
  create?: () => Hasher;
  /** Computed by Web Crypto (whole input at once); these also make HMACs. */
  webCrypto?: WebCryptoName;
}

/** hex, HEX, Base64 or Base64url. */
export type DigestEncoding = "hex" | "HEX" | "base64" | "base64url";

/** Digests by algorithm; an algorithm that was not computed is missing. */
export type HashResults = Partial<Record<AlgorithmId, Uint8Array>>;

/** An HMAC key as typed: UTF-8 text, or hex digits (spaces allowed). */
export interface HmacKey {
  text: string;
  format: "text" | "hex";
}
