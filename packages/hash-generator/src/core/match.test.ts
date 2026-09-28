// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encodeDigest } from "./encode";
import { hashAll } from "./hash";
import { matchDigest } from "./match";
import type { HashResults } from "./types";

// The main digests of "abc"; the Base64 forms and the SHA3-256 and SHA-512/256 values were computed with Python's hashlib.
const SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const SHA256_BASE64 = "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=";
const SHA256_BASE64URL = "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0";
const SHA3_256 = "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532";
const SHA512_256 = "53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23";

async function main(): Promise<HashResults> {
  const result = await hashAll("abc");
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("matchDigest", () => {
  it("finds the algorithm of a hash in hex of any case, with spaces, in Base64 and Base64url", async () => {
    const results = await main();
    for (const text of [SHA256, SHA256.toUpperCase(), ` ${SHA256.replace(/(.{8})/g, "$1 ")}\n`, SHA256_BASE64, SHA256_BASE64URL, SHA256_BASE64.replace(/=$/, "")]) {
      expect([text, matchDigest(text, results)]).toEqual([text, { status: "match", algorithm: "sha256" }]);
    }
    expect(matchDigest("900150983CD24FB0D6963F7D28E17F72", results)).toEqual({ status: "match", algorithm: "md5" });
  });

  it("reads prefixes (sha256: and SRI's sha256-), sha256sum lines and BSD lines, and a prefix limits the algorithm", async () => {
    const results = await main();
    for (const text of [`sha256:${SHA256}`, `SHA-256:${SHA256}`, `sha256-${SHA256_BASE64}`, `${SHA256}  report.iso`, `${SHA256} *report.iso`, `SHA256 (report.iso) = ${SHA256}`]) {
      expect([text, matchDigest(text, results)]).toEqual([text, { status: "match", algorithm: "sha256" }]);
    }
    expect(matchDigest(`md5:${SHA256}`, results)).toEqual({ status: "none", uncomputed: [] });
  });

  it("says when nothing matches, and names the extra algorithms of that length that were not computed", async () => {
    const results = await main();
    expect(matchDigest(SHA3_256, results)).toEqual({ status: "none", uncomputed: ["sha512-256", "sha3-256", "blake2s-256", "blake3-256"] });
    expect(matchDigest(`sha3-256:${SHA3_256}`, results)).toEqual({ status: "none", uncomputed: ["sha3-256"] });
    expect(matchDigest("0".repeat(56), results)).toEqual({ status: "none", uncomputed: ["sha224", "sha3-224"] });
    expect(matchDigest(SHA512_256, { ...results, "sha512-256": Uint8Array.from(SHA512_256.match(/../g)!, (h) => parseInt(h, 16)) })).toEqual({
      status: "match",
      algorithm: "sha512-256",
    });
  });

  it("reads a Base64 digest made only of hex digits as Base64 when its hex reading matches nothing", async () => {
    // Search for a text whose CRC32 in Base64url happens to use hex digits only (about one text in 600 does).
    for (let i = 0; ; i++) {
      const found = await hashAll(`t${i}`);
      if (!found.ok) throw new Error(found.error.message);
      const url = encodeDigest(found.value.crc32!, "base64url");
      if (!/^[0-9a-fA-F]+$/.test(url)) continue;
      expect([url, matchDigest(url, found.value)]).toEqual([url, { status: "match", algorithm: "crc32" }]);
      break;
    }
  });

  it("takes a sha256sum line only when its hex has a digest's length, so hex in groups is still one hash", async () => {
    const results = await main();
    for (const spaced of [SHA256.replace(/(.{8})/g, "$1  ").trim(), SHA256.replace(/(.{4})/g, "$1  ").trim()]) {
      expect([spaced, matchDigest(spaced, results)]).toEqual([spaced, { status: "match", algorithm: "sha256" }]);
    }
    // Eight hex digits are a CRC32 in sha256sum form: the rest of the line is the file name.
    expect(matchDigest("352441c2  report.iso", results)).toEqual({ status: "match", algorithm: "crc32" });
  });

  it("says when the text is empty or not a hash at all", async () => {
    const results = await main();
    expect(matchDigest("  \n", results)).toEqual({ status: "empty" });
    expect(matchDigest("not a hash!", results)).toEqual({ status: "invalid", message: "Not a hash in hex or Base64" });
  });
});
