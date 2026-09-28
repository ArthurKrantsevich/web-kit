const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, "0"));

/** Lowercase hex of the bytes. */
export function toHex(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += HEX[byte];
  return text;
}

/** 16 bytes as a UUID: lowercase, 8-4-4-4-12. */
export function formatBytes(bytes: Uint8Array): string {
  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The 16 bytes of 32 hex digits (no check: callers pass checked text). */
export function hexBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Sets the version (high nibble of byte 6) and the RFC 9562 variant (10 in the top bits of byte 8). */
export function stamp(bytes: Uint8Array, version: number): Uint8Array {
  bytes[6] = (bytes[6]! & 0x0f) | (version << 4);
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return bytes;
}
