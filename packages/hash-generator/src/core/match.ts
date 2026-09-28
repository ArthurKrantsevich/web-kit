import { ALGORITHM_NAMES, EXTRA_INFO, MAIN_ALGORITHMS, squash } from "./algorithms";
import { decodeBase64, decodeHex } from "./encode";
import type { AlgorithmId, HashResults } from "./types";

/** What a pasted hash matches. */
export type DigestMatch =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "match"; algorithm: AlgorithmId }
  /** Nothing computed matches. `uncomputed`: algorithms of that length that were not computed (the extra ones). */
  | { status: "none"; uncomputed: AlgorithmId[] };

const ORDER: AlgorithmId[] = [...MAIN_ALGORITHMS, ...EXTRA_INFO].map((algorithm) => algorithm.id);
const LENGTHS: Record<string, number> = Object.fromEntries([...MAIN_ALGORITHMS, ...EXTRA_INFO].map((algorithm) => [algorithm.id, algorithm.bytes]));

/** Names a prefix may use: "sha256", "SHA-256", "sha3-256", "blake3", "blake2b", "ripemd160", "crc32c"… */
const ALIASES = new Map<string, AlgorithmId>(
  ORDER.flatMap((id) => {
    const names = [squash(id), squash(ALGORITHM_NAMES[id])];
    if (id.startsWith("blake")) names.push(squash(id.replace(/-\d+$/, "")));
    return names.map((name) => [name, id] as [string, AlgorithmId]);
  }),
);

/** The algorithm a text starts with, before ":" or "-" ("sha256-…" of SRI, "sha256:…" of Docker), the longest first. */
function prefix(text: string): { algorithm: AlgorithmId; rest: string } | null {
  let found: { algorithm: AlgorithmId; rest: string } | null = null;
  for (let i = 1; i < text.length; i++) {
    if (text[i] !== ":" && text[i] !== "-") continue;
    const algorithm = ALIASES.get(squash(text.slice(0, i)));
    if (algorithm !== undefined) found = { algorithm, rest: text.slice(i + 1) };
  }
  return found;
}

/**
 * Which computed digest a pasted hash is: hex in any case, Base64 or Base64url, with spaces anywhere, with a prefix
 * such as "sha256:" or SRI's "sha256-", or a whole line of `sha256sum` ("<hex>  file") or of the BSD tools
 * ("SHA256 (file) = <hex>"). A prefix limits the comparison to its algorithm.
 */
export function matchDigest(expected: string, results: HashResults): DigestMatch {
  let text = expected.trim();
  if (text === "") return { status: "empty" };
  let only: AlgorithmId | null = null;
  const bsd = /^([\w/-]+)\s*\(.*\)\s*=\s*(\S+)$/.exec(text);
  const sum = /^\\?([0-9a-fA-F]+) [ *]\S/.exec(text);
  if (bsd) {
    only = ALIASES.get(squash(bsd[1]!)) ?? null;
    text = bsd[2]!;
  } else if (sum) {
    text = sum[1]!;
  } else {
    const named = prefix(text);
    if (named) {
      only = named.algorithm;
      text = named.rest;
    }
  }
  const value = text.replace(/\s+/g, "");
  // Text that is valid hex is read as hex: a real Base64 digest is practically never made of hex digits only.
  const bytes = decodeHex(value) ?? decodeBase64(value);
  if (bytes === null) return { status: "invalid", message: "Not a hash in hex or Base64" };
  const allowed = ORDER.filter((id) => only === null || id === only);
  for (const id of allowed) {
    const digest = results[id];
    if (digest && digest.length === bytes.length && digest.every((byte, i) => byte === bytes[i])) return { status: "match", algorithm: id };
  }
  return { status: "none", uncomputed: allowed.filter((id) => results[id] === undefined && LENGTHS[id] === bytes.length) };
}
