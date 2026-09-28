// @vitest-environment node
/// <reference types="node" />
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createCrc32 } from "../core/crc";
import { encodeDigest } from "../core/encode";
import { createMd5 } from "../core/md5";
import type { Hasher } from "../core/types";
import { createCrc32c, createRipemd160, createSha224, createSha512_256 } from "./index";

const text = (value: string) => new TextEncoder().encode(value);
const fromHex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (pair) => parseInt(pair, 16));
const run = (create: () => Hasher, ...parts: Uint8Array[]) => {
  const hasher = create();
  for (const part of parts) hasher.update(part);
  return encodeDigest(hasher.digest(), "hex");
};
/** Bytes that are the same on every run. */
const bytes = (length: number, seed = 1) => Uint8Array.from({ length }, (_, i) => (Math.imul(i + seed, 2654435761) >>> 24) & 0xff);

describe("SHA-224 and SHA-512/256", () => {
  // NIST CSRC examples for FIPS 180-4.
  it("give NIST's example digests", () => {
    expect(run(createSha224, text("abc"))).toBe("23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7");
    expect(run(createSha224, text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe("75388b16512776cc5dba5da1fd890150b0c6455cb4f58b1952522525");
    expect(run(createSha512_256, text("abc"))).toBe("53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23");
    expect(
      run(createSha512_256, text("abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu")),
    ).toBe("3928e184fb8690f840da3988121d31be65cb9d3ef83ee6146feac861e19b563a");
  });
});

describe("SHA-224 and SHA-512/256 against NIST CAVP", () => {
  // SHAVS byte-oriented vectors (shabytetestvectors.zip): the messages of 0, 8, block − 8 and block bits of ShortMsg and
  // the first of LongMsg, as bits, message and digest.
  const CAVP: Record<"sha224" | "sha512-256", [number, string, string][]> = {
    "sha224": [
      [0, "", "d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f"],
      [8, "84", "3cd36921df5d6963e73739cf4d20211e2d8877c19cff087ade9d0e3a"],
      [504, "716944de41710c29b659be10480bb25a351a39e577ee30e8f422d57cf62ad95bda39b6e70c61426e33fd84aca84cc7912d5eee45dc34076a5d2323a15c7964", "61645ac748db567ac862796b8d06a47afebfa2e1783d5c5f3bcd81e2"],
      [512, "a3310ba064be2e14ad32276e18cd0310c933a6e650c3c754d0243c6c61207865b4b65248f66a08edf6e0832689a9dc3a2e5d2095eeea50bd862bac88c8bd318d", "b2a5586d9cbf0baa999157b4af06d88ae08d7c9faab4bc1a96829d65"],
      [1304, "f149e41d848f59276cfddd743bafa9a90e1ee4a263a118142b33e3702176ef0a59f8237a1cb51b42f3ded6b202d9af0997898fdd03cf60bda951c514547a0850cec25444ae2f24cb711bfbafcc3956c941d3de69f155e3f8b10f06db5f37359b772ddd43e1035a0a0d3db33242d5843033833b0dd43b870c6bf60e8deab55f317cc3273f5e3ba747f0cb65050cb7228796210d9254873643008d45f29cfd6c5b060c9a", "9db6dc3a23abd7b6c3d72c38f4843c7de48a71d0ba91a86b18393e5f"],
    ],
    "sha512-256": [
      [0, "", "c672b8d1ef56ed28ab87c3622c5114069bdd3ad7b8f9737498d0c01ecef0967a"],
      [8, "fa", "c4ef36923c64e51e875720e550298a5ab8a3f2f875b1e1a4c9b95babf7344fef"],
      [1016, "3e3a52d3261e1194249786d6c0e18d52d92f1c7639f079c26c51aa72d1032e5df13eea1d1006667002ad39de4099c29c3b4719b1f0904557bd2bb0a47374d869ac6b465b5f00c470b18ecb8c0ea53b5d790c4e832006cff534d587a0f77df95117ca4fd43a94935eda422228538d5e5d3a87a436f1db7e63785619ae86a6f9", "b34e72cefefb63d6e309bcfb4f0b1d350f2c5c582de3b93ad137f921a92a7e79"],
      [1024, "bc8173c878ca60e9a0f823f9a589d4ff84547b389b117fb6bb1b614e7e75a9b1db0b21d9f73b42a73e94eccab3de5ae2845a54e5e24ba6c20fb4d245b964023b863040d6f080e953530d5fd944e8ffa525bf5364f65c88e06e6e22df4b8cee48e67738880a9f3f3406e9e6f001b0ac8f8e0ade7c814c0c5800d0b9e4ddf55622", "f691d01ee9ab675f3872313b77e6a4543c71e3e89aa94c48f91d6ee7fa1ab4fb"],
      [1816, "97e003903bb971a523ce0c82bda5d6733c76b90deb307559c1bddd35368743f6563b315214cd5a7ee0bccf937c9776360bc0b9786b707bfbc4fb50576155edbbbfd5ddd8e43a76faf2ec0c78fc84644f188d6b0ab68c28e5303ff031a223d9fafb3871e85408af6381e629fae67488068c68398a758f665e2c12258d9ff8effb31ec534b0c40ebffb43390e1e26fcaa28fd68ac24f7e1cafe0fa573103dc17058a77edc9b3ea1418b45aa7f5977e126d4861c778ed6332217581eee674d739622e63a529f10c11f4a9e3d8feaea848ade0905675f6458ffa132f52749af23d584438e5", "00ce3b592d4e1a65f780df351fa7b2c01b49df4ea913c3fab24297f5791b18e5"],
    ],
  };
  const create = { sha224: createSha224, "sha512-256": createSha512_256 };

  it("give the CAVP digests", () => {
    for (const [name, vectors] of Object.entries(CAVP) as [keyof typeof CAVP, [number, string, string][]][]) {
      for (const [bits, message, digest] of vectors) expect([name, bits, run(create[name], fromHex(message))]).toEqual([name, bits, digest]);
    }
  });
});

describe("RIPEMD-160", () => {
  it("gives the test vectors of its authors (Bosselaers' RIPEMD-160 page)", () => {
    const vectors: [string, string][] = [
      ["", "9c1185a5c5e9fc54612808977ee8f548b2258d31"],
      ["a", "0bdc9d2d256b3ee9daae347be6f4dc835a467ffe"],
      ["abc", "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc"],
      ["message digest", "5d0689ef49d2fae572b881b123a85ffa21595f36"],
      ["abcdefghijklmnopqrstuvwxyz", "f71c27109c692c1b56bbdceb5b9d2865b3708dbc"],
      ["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "12a053384a9c0c88e405a06c27dcf49ada62eb2b"],
      ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "b0e20b6e3116640286ed3a87a5713079b21f5189"],
      ["12345678901234567890123456789012345678901234567890123456789012345678901234567890", "9b752e45573d4b39f4dbd3323cab82bf63326bfb"]
    ];
    expect(vectors.map(([input]) => [input, run(createRipemd160, text(input))])).toEqual(vectors);
    expect(run(createRipemd160, new Uint8Array(1_000_000).fill(0x61))).toBe("52783243c1697bdbe16d37f97f68f08325dc1528");
  });
});

describe("CRC32C", () => {
  it("gives the check value of CRC-32C (Castagnoli): 123456789 → e3069283", () => {
    expect(run(createCrc32c, text("123456789"))).toBe("e3069283");
  });
});

// node:crypto (OpenSSL) and node:zlib are an independent implementation of every one of these.
describe("against Node on inputs of every length around the block sizes, split anywhere", () => {
  const cases: [string, () => Hasher, (data: Uint8Array) => string][] = [
    ["MD5", createMd5, (data) => createHash("md5").update(data).digest("hex")],
    ["CRC32", createCrc32, (data) => crc32(data).toString(16).padStart(8, "0")],
    ["SHA-224", createSha224, (data) => createHash("sha224").update(data).digest("hex")],
    ["SHA-512/256", createSha512_256, (data) => createHash("sha512-256").update(data).digest("hex")],
    ["RIPEMD-160", createRipemd160, (data) => createHash("ripemd160").update(data).digest("hex")],
  ];
  for (const [name, create, expected] of cases) {
    it(name, () => {
      for (let length = 0; length <= 300; length++) {
        const data = bytes(length, length);
        const cut = (length * 7) % (length + 1);
        expect([length, run(create, data.subarray(0, cut), data.subarray(cut))]).toEqual([length, expected(data)]);
      }
      const large = bytes(100_003);
      expect(run(create, large.subarray(0, 4099), large.subarray(4099, 70_001), large.subarray(70_001))).toBe(expected(large));
    });
  }
});
