/** A result that says why the input was refused instead of throwing: `{ ok: false, error: { message } }`. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: { message: string } };

/** Fills `bytes` with random values. The default is `crypto.getRandomValues`; tests pass a scripted one. */
export type RandomSource = (bytes: Uint8Array<ArrayBuffer>) => void;

/** What `generateIds` makes: a UUID version, the Nil or Max UUID, a ULID or a NanoID. */
export type IdKind = "v1" | "v3" | "v4" | "v5" | "v6" | "v7" | "nil" | "max" | "ulid" | "nanoid";

/** The namespaces of RFC 9562 §6.6, by name. */
export type NamespaceName = "dns" | "url" | "oid" | "x500";

export type UuidVariant = "ncs" | "rfc9562" | "microsoft" | "future";

/** What `inspectId` reads from an ID. */
export interface IdInfo {
  kind: "uuid" | "ulid";
  /** Lowercase with hyphens for a UUID; uppercase for a ULID. */
  canonical: string;
  /** "Version 7: Unix time in milliseconds, then random bits", "The Nil UUID: all 128 bits are zero". */
  description: string;
  /** UUID only. */
  variant?: UuidVariant;
  /** UUID of the RFC 9562 variant only: 1 to 8. */
  version?: number;
  special?: "nil" | "max";
  /** When the ID was made, ISO 8601 in UTC: v1 and v6 to 100 ns (seven decimals), v7 and ULID to the millisecond. */
  time?: string;
  /** v1 and v6. */
  clockSequence?: number;
  /** v1 and v6: six bytes, "9f:6b:de:ce:d8:46". */
  node?: string;
  /** v1 and v6: the multicast bit of the node is set, so it is random, not a MAC address (RFC 9562 §6.10). */
  nodeRandom?: boolean;
  /** ULID only: the same 128 bits as a UUID. */
  uuid?: string;
}
