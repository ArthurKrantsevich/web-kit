import { formatBytes, hexBytes } from "./bytes";
import { CROCKFORD, decodeCrockford } from "./crockford";
import { GREGORIAN_OFFSET } from "./generators";
import type { IdInfo, Result, UuidVariant } from "./types";
import { uuidDigits } from "./uuid";

const VERSIONS: Record<number, string> = {
  1: "Version 1: Gregorian time, clock sequence and node",
  2: "Version 2: DCE Security; its fields are not read here",
  3: "Version 3: MD5 of a namespace and a name",
  4: "Version 4: random",
  5: "Version 5: SHA-1 of a namespace and a name",
  6: "Version 6: the time of version 1, reordered for sorting",
  7: "Version 7: Unix time in milliseconds, then random bits",
  8: "Version 8: a custom, vendor-specific layout",
};

const VARIANTS: Record<Exclude<UuidVariant, "rfc9562">, string> = {
  ncs: "The reserved NCS variant (Apollo Network Computing System); no version to read",
  microsoft: "The reserved Microsoft variant (old COM and DCOM GUIDs); no version to read",
  future: "The variant reserved for future definition; no version to read",
};

const fail = (message: string): Result<IdInfo> => ({ ok: false, error: { message } });

/** ISO 8601 of a count of 100-ns intervals since the Unix epoch, with seven decimals. */
function isoFromTicks(ticks: bigint): string {
  let ms = ticks / 10_000n;
  if (ticks < 0n && ms * 10_000n !== ticks) ms -= 1n;
  const rest = ticks - ms * 10_000n;
  const iso = new Date(Number(ms)).toISOString();
  return `${iso.slice(0, -1)}${rest.toString().padStart(4, "0")}Z`;
}

function variantOf(byte: number): UuidVariant {
  if ((byte & 0x80) === 0) return "ncs";
  if ((byte & 0xc0) === 0x80) return "rfc9562";
  if ((byte & 0xe0) === 0xc0) return "microsoft";
  return "future";
}

function inspectUuid(digits: string): Result<IdInfo> {
  const canonical = formatBytes(hexBytes(digits));
  if (/^0{32}$/.test(digits)) return { ok: true, value: { kind: "uuid", canonical, special: "nil", description: "The Nil UUID: all 128 bits are zero" } };
  if (/^f{32}$/.test(digits)) return { ok: true, value: { kind: "uuid", canonical, special: "max", description: "The Max UUID: all 128 bits are one" } };
  const bytes = hexBytes(digits);
  const variant = variantOf(bytes[8]!);
  if (variant !== "rfc9562") return { ok: true, value: { kind: "uuid", canonical, variant, description: VARIANTS[variant] } };
  const version = bytes[6]! >> 4;
  const description = VERSIONS[version];
  if (description === undefined) return fail(`Unknown UUID version ${version}: RFC 9562 defines versions 1 to 8`);
  const info: IdInfo = { kind: "uuid", canonical, variant, version, description };
  const hex = (from: number, to: number): bigint => BigInt(`0x${digits.slice(from, to)}`);
  if (version === 1 || version === 6) {
    const tick =
      version === 1
        ? ((hex(12, 16) & 0x0fffn) << 48n) | (hex(8, 12) << 32n) | hex(0, 8)
        : (hex(0, 8) << 28n) | (hex(8, 12) << 12n) | (hex(12, 16) & 0x0fffn);
    info.time = isoFromTicks(tick - GREGORIAN_OFFSET);
    info.clockSequence = ((bytes[8]! & 0x3f) << 8) | bytes[9]!;
    info.node = Array.from(bytes.subarray(10), (byte) => byte.toString(16).padStart(2, "0")).join(":");
    info.nodeRandom = (bytes[10]! & 0x01) === 1;
  } else if (version === 7) {
    info.time = new Date(Number(hex(0, 12))).toISOString();
  }
  return { ok: true, value: info };
}

const LOOKALIKES: Record<string, string> = { I: "1", L: "1", O: "0" };

function inspectUlid(text: string): Result<IdInfo> {
  const upper = text.toUpperCase();
  for (const [index, char] of Array.from(upper).entries()) {
    if (CROCKFORD.includes(char)) continue;
    const hint = LOOKALIKES[char] === undefined ? "" : `; did you mean ${LOOKALIKES[char]}?`;
    return fail(`Not a ULID: "${text[index]}" at position ${index + 1} is not in Crockford's Base32 (no I, L, O or U)${hint}`);
  }
  if (upper[0]! > "7") return fail("Not a ULID: it is larger than 128 bits (the first character must be 0 to 7)");
  const value = decodeCrockford(upper);
  const ms = Number(value >> 80n);
  return {
    ok: true,
    value: {
      kind: "ulid",
      canonical: upper,
      description: "ULID: Unix time in milliseconds, then 80 random bits",
      time: new Date(ms).toISOString(),
      uuid: formatBytes(hexBytes(value.toString(16).padStart(32, "0"))),
    },
  };
}

/**
 * What an ID is and what can be read from it: a UUID in any usual spelling (hyphens or not, braces, `urn:uuid:`, any
 * case) or a ULID. Spaces around it are allowed. A NanoID has no structure, and the message says so.
 */
export function inspectId(text: string): Result<IdInfo> {
  const trimmed = text.trim();
  if (trimmed === "") return fail("Paste an ID to inspect it");
  const digits = uuidDigits(trimmed);
  if (digits !== null) return inspectUuid(digits);
  const chars = Array.from(trimmed);
  const body = trimmed.replace(/^urn:uuid:/i, "").replace(/^\{(.*)\}$/, "$1");
  if (body.length === 36 || body.length === 32) {
    const start = trimmed.indexOf(body);
    for (const [index, char] of Array.from(body).entries()) {
      const hyphen = body.length === 36 && [8, 13, 18, 23].includes(index);
      if (hyphen ? char === "-" : /[0-9a-f]/i.test(char)) continue;
      return fail(
        hyphen
          ? `Not a UUID: a hyphen belongs at position ${start + index + 1} (after 8, 4, 4 and 4 hexadecimal digits)`
          : `Not a UUID: "${char}" at position ${start + index + 1} is not a hexadecimal digit (0-9, a-f)`,
      );
    }
  }
  if (chars.length === 26) return inspectUlid(trimmed);
  if (chars.length === 21 && /^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return fail("This looks like a NanoID: its characters are random, with no time or version to read");
  }
  return fail(
    `Not a UUID or a ULID: ${chars.length} characters. A UUID has 32 hexadecimal digits (36 characters with hyphens), a ULID 26 characters`,
  );
}
