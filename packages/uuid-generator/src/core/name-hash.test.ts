// @vitest-environment node
/// <reference types="node" />
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { toHex } from "./bytes";
import { md5, sha1 } from "./name-hash";
import { seededRandom } from "./seeded";

const text = (value: string) => new TextEncoder().encode(value);

describe("md5 and sha1 for name-based UUIDs", () => {
  it("gives the MD5 test suite of RFC 1321 §A.5", () => {
    const suite: [string, string][] = [
      ["", "d41d8cd98f00b204e9800998ecf8427e"],
      ["a", "0cc175b9c0f1b6a831c399e269772661"],
      ["abc", "900150983cd24fb0d6963f7d28e17f72"],
      ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
      ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
      ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "d174ab98d277d9f5a5611c2c9f419d9f"],
      ["12345678901234567890123456789012345678901234567890123456789012345678901234567890", "57edf4a22be3c955ac49da2e2107b67a"],
    ];
    expect(suite.map(([input]) => [input, toHex(md5(text(input)))])).toEqual(suite);
  });

  it("gives the SHA-1 examples of FIPS 180-4 (NIST's example values)", () => {
    expect(toHex(sha1(text("abc")))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(toHex(sha1(text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe("84983e441c3bd26ebaae4aa1f95129e5e54670f1");
  });

  it("matches node:crypto on inputs of every length up to three blocks", () => {
    const random = seededRandom(1);
    for (let length = 0; length <= 200; length++) {
      const bytes = new Uint8Array(length);
      random(bytes);
      expect([length, toHex(md5(bytes)), toHex(sha1(bytes))]).toEqual([
        length,
        createHash("md5").update(bytes).digest("hex"),
        createHash("sha1").update(bytes).digest("hex"),
      ]);
    }
  });
});
