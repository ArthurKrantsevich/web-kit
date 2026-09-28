import type { DigestEncoding } from "./types";

/** A digest as hex (lower or upper case), Base64 or Base64url without padding. */
export function encodeDigest(bytes: Uint8Array, encoding: DigestEncoding): string {
  if (encoding === "hex" || encoding === "HEX") {
    let hex = "";
    for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
    return encoding === "HEX" ? hex.toUpperCase() : hex;
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return encoding === "base64" ? base64 : base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The bytes of hex digits, or null. */
export function decodeHex(text: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(text)) return null;
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** The bytes of Base64 or Base64url, with or without padding, or null. */
export function decodeBase64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) return null;
  const plain = text.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  if (plain.length % 4 === 1) return null;
  try {
    const binary = atob(plain + "===".slice((plain.length + 3) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
