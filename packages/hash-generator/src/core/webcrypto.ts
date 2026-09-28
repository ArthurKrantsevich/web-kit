import type { HmacKey, Result, WebCryptoName } from "./types";

/** Web Crypto's digest of the whole input: in the browser, a worker and Node 20+. */
export async function webDigest(name: WebCryptoName, bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest(name, bytes));
}

/** The bytes of an HMAC key: UTF-8 of the text, or its hex digits (spaces allowed), or why they cannot be read. */
export function keyBytes(key: HmacKey): Result<Uint8Array<ArrayBuffer>> {
  if (key.format === "text") {
    if (key.text === "") return { ok: false, error: { message: "Enter the HMAC key" } };
    return { ok: true, value: new TextEncoder().encode(key.text) };
  }
  const hex = key.text.replace(/\s+/g, "");
  if (hex === "") return { ok: false, error: { message: "Enter the HMAC key" } };
  const bad = /[^0-9a-f]/i.exec(hex);
  if (bad) return { ok: false, error: { message: `The key is not hex: "${bad[0]}" is not a hexadecimal digit` } };
  if (hex.length % 2 === 1) return { ok: false, error: { message: "The key is not hex: it has an odd number of digits" } };
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return { ok: true, value: bytes };
}

/** HMAC (RFC 2104) with SHA-1 or SHA-2, by Web Crypto. */
export async function hmac(name: WebCryptoName, key: HmacKey, bytes: Uint8Array<ArrayBuffer>): Promise<Result<Uint8Array<ArrayBuffer>>> {
  const raw = keyBytes(key);
  if (!raw.ok) return raw;
  const imported = await crypto.subtle.importKey("raw", raw.value, { name: "HMAC", hash: name }, false, ["sign"]);
  return { ok: true, value: new Uint8Array(await crypto.subtle.sign("HMAC", imported, bytes)) };
}
