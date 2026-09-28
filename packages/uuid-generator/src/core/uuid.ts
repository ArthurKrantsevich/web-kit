import { formatBytes, hexBytes, stamp } from "./bytes";
import { md5, sha1 } from "./name-hash";
import { randomBytes } from "./random";
import type { NamespaceName, RandomSource, Result } from "./types";

export const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export const MAX_UUID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

/** RFC 9562 §6.6: the namespace IDs for names that are domain names, URLs, OIDs and X.500 DNs. */
export const NAMESPACES: Readonly<Record<NamespaceName, string>> = {
  dns: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  url: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  oid: "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
  x500: "6ba7b814-9dad-11d1-80b4-00c04fd430c8",
};

const CANONICAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The 32 lowercase hex digits of a UUID written in any of the usual ways: with or without hyphens, in braces, with the
 * `urn:uuid:` prefix, in any case, with spaces around it. Null when it is not one.
 */
export function uuidDigits(text: string): string | null {
  let value = text.trim().toLowerCase();
  if (value.startsWith("urn:uuid:")) value = value.slice(9);
  else if (value.startsWith("{") && value.endsWith("}")) value = value.slice(1, -1);
  if (CANONICAL.test(value)) return value.replace(/-/g, "");
  return /^[0-9a-f]{32}$/.test(value) ? value : null;
}

/** 122 random bits, version 4 and the RFC 9562 variant. */
export function makeV4(random: RandomSource): string {
  return formatBytes(stamp(randomBytes(random, 16), 4));
}

/** The UUID of a namespace name or a UUID given as text, or an error that says what is wrong with it. */
export function namespaceBytes(namespace: NamespaceName | string): Result<Uint8Array> {
  // Own keys only: "constructor" or "__proto__" must be read as text, not as what every object inherits.
  const known = Object.hasOwn(NAMESPACES, namespace) ? NAMESPACES[namespace as NamespaceName] : namespace;
  const digits = uuidDigits(known);
  if (digits === null) return { ok: false, error: { message: `The namespace "${namespace}" is not a UUID` } };
  return { ok: true, value: hexBytes(digits) };
}

function nameBased(version: 3 | 5, namespace: NamespaceName | string, name: string): Result<string> {
  const space = namespaceBytes(namespace);
  if (!space.ok) return space;
  const text = new TextEncoder().encode(name);
  const input = new Uint8Array(16 + text.length);
  input.set(space.value);
  input.set(text, 16);
  const digest = version === 3 ? md5(input) : sha1(input);
  return { ok: true, value: formatBytes(stamp(digest.slice(0, 16), version)) };
}

/** MD5 of the namespace's 16 bytes and the name in UTF-8 (RFC 9562 §5.3): the same inputs always give the same UUID. */
export function uuidV3(namespace: NamespaceName | string, name: string): Result<string> {
  return nameBased(3, namespace, name);
}

/** SHA-1 of the namespace's 16 bytes and the name in UTF-8 (RFC 9562 §5.5): the same inputs always give the same UUID. */
export function uuidV5(namespace: NamespaceName | string, name: string): Result<string> {
  return nameBased(5, namespace, name);
}

export interface UuidFormat {
  case?: "lower" | "upper";
  hyphens?: boolean;
  wrap?: "none" | "braces" | "urn";
}

/**
 * A UUID written another way: upper case, without hyphens, in braces or as a URN. A ULID only changes case; other
 * text (a NanoID) is returned as it is.
 */
export function formatUuid(id: string, format: UuidFormat = {}): string {
  const digits = uuidDigits(id);
  if (digits === null) {
    const ulid = /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id);
    return ulid ? (format.case === "lower" ? id.toLowerCase() : id.toUpperCase()) : id;
  }
  let body = format.hyphens === false ? digits : formatBytes(hexBytes(digits));
  if (format.case === "upper") body = body.toUpperCase();
  if (format.wrap === "braces") return `{${body}}`;
  if (format.wrap === "urn") return `urn:uuid:${body}`;
  return body;
}
