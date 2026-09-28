// @vitest-environment node
/// <reference types="node" />
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeDigest } from "../core/encode";
import type { Hasher } from "../core/types";
import { ALL_ALGORITHMS, createBlake2b, createBlake2s, createBlake3, EXTRA_ALGORITHMS, sha3Hasher } from "./index";

const text = (value: string) => new TextEncoder().encode(value);
const fromHex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (pair) => parseInt(pair, 16));
const run = (create: () => Hasher, ...parts: Uint8Array[]) => {
  const hasher = create();
  for (const part of parts) hasher.update(part);
  return encodeDigest(hasher.digest(), "hex");
};
const bytes = (length: number, seed = 1) => Uint8Array.from({ length }, (_, i) => (Math.imul(i + seed, 2654435761) >>> 24) & 0xff);

describe("SHA-3", () => {
  // NIST CSRC examples for FIPS 202: the empty message and 1600 bits of 0xA3.
  const A3 = new Uint8Array(200).fill(0xa3);
  it("gives NIST's example digests", () => {
    expect(run(sha3Hasher(224))).toBe("6b4e03423667dbb73b6e15454f0eb1abd4597f9a1b078e3f5b5a6bc7");
    expect(run(sha3Hasher(256))).toBe("a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a");
    expect(run(sha3Hasher(384))).toBe("0c63a75b845e4f7d01107d852e4c2485c51a50aaaa94fc61995e71bbee983a2ac3713831264adb47fb6bd1e058d5f004");
    expect(run(sha3Hasher(512))).toBe(
      "a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26",
    );
    expect(run(sha3Hasher(224), A3)).toBe("9376816aba503f72f96ce7eb65ac095deee3be4bf9bbc2a1cb7e11e0");
    expect(run(sha3Hasher(256), A3)).toBe("79f38adec5c20307a98ef76e8324afbfd46cfd81b22e3973c65fa1bd9de31787");
    expect(run(sha3Hasher(384), A3)).toBe("1881de2ca7e41ef95dc4732b8f5f002b189cc1e42b74168ed1732649ce1dbcdd76197a31fd55ee989f2d7050dd473e8f");
    expect(run(sha3Hasher(512), A3)).toBe(
      "e76dfad22084a8b1467fcf2ffa58361bec7628edf5f3fdc0e4805dc48caeeca81b7c13c30adf52a3659584739a2df46be589c51ca1a4a8416df6545a1ce8ba00",
    );
  });
});

describe("SHA-3 against NIST CAVP", () => {
  // SHA3VS byte-oriented vectors (sha-3bytetestvectors.zip): the messages of 0, 8, rate − 8 and rate bits of ShortMsg
  // and the first of LongMsg, as bits, message and digest.
  const CAVP: Record<"sha3-224" | "sha3-256" | "sha3-384" | "sha3-512", [number, string, string][]> = {
    "sha3-224": [
      [0, "", "6b4e03423667dbb73b6e15454f0eb1abd4597f9a1b078e3f5b5a6bc7"],
      [8, "01", "488286d9d32716e5881ea1ee51f36d3660d70f0db03b3f612ce9eda4"],
      [1144, "0eef947f1e4f01cdb5481ca6eaa25f2caca4c401612888fecef52e283748c8dfc7b47259322c1f4f985f98f6ad44c13117f51e0517c0974d6c7b78af7419bcce957b8bc1db8801c5e280312ef78d6aa47a9cb98b866aaec3d5e26392dda6bbde3fece8a0628b30955b55f03711a8e1eb9e409a7cf84f56c8d0d0f8b9ba184c778fae90dc0f5c3329cb86dcf743bbae", "98ec52c21cb988b1434b1653dd4ac806d118de6af1bb471c16577c34"],
      [1152, "e65de91fdcb7606f14dbcfc94c9c94a57240a6b2c31ed410346c4dc011526559e44296fc988cc589de2dc713d0e82492d4991bd8c4c5e6c74c753fc09345225e1db8d565f0ce26f5f5d9f404a28cf00bd655a5fe04edb682942d675b86235f235965ad422ba5081a21865b8209ae81763e1c4c0cccbccdaad539cf773413a50f5ff1267b9238f5602adc06764f775d3c", "26ec9df54d9afe11710772bfbeccc83d9d0439d3530777c81b8ae6a3"],
      [2312, "31c82d71785b7ca6b651cb6c8c9ad5e2aceb0b0633c088d33aa247ada7a594ff4936c023251319820a9b19fc6c48de8a6f7ada214176ccdaadaeef51ed43714ac0c8269bbd497e46e78bb5e58196494b2471b1680e2d4c6dbd249831bd83a4d3be06c8a2e903933974aa05ee748bfe6ef359f7a143edf0d4918da916bd6f15e26a790cff514b40a5da7f72e1ed2fe63a05b8149587bea05653718cc8980eadbfeca85b7c9c286dd040936585938be7f98219700c83a9443c2856a80ff46852b26d1b1edf72a30203cf6c44a10fa6eaf1920173cedfb5c4cf3ac665b37a86ed02155bbbf17dc2e786af9478fe0889d86c5bfa85a242eb0854b1482b7bd16f67f80bef9c7a628f05a107936a64273a97b0088b0e515451f916b5656230a12ba6dc78", "aab23c9e7fb9d7dacefdfd0b1ae85ab1374abff7c4e3f7556ecae412"],
    ],
    "sha3-256": [
      [0, "", "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a"],
      [8, "e9", "f0d04dd1e6cfc29a4460d521796852f25d9ef8d28b44ee91ff5b759d72c1e6d6"],
      [1080, "b1f6076509938432145bb15dbe1a7b2e007934be5f753908b50fd24333455970a7429f2ffbd28bd6fe1804c4688311f318fe3fcd9f6744410243e115bcb00d7e039a4fee4c326c2d119c42abd2e8f4155a44472643704cc0bc72403b8a8ab0fd4d68e04a059d6e5ed45033b906326abb4eb4147052779bad6a03b55ca5bd8b140e131bed2dfada", "f82d9602b231d332d902cb6436b15aef89acc591cb8626233ced20c0a6e80d7a"],
      [1088, "56ea14d7fcb0db748ff649aaa5d0afdc2357528a9aad6076d73b2805b53d89e73681abfad26bee6c0f3d20215295f354f538ae80990d2281be6de0f6919aa9eb048c26b524f4d91ca87b54c0c54aa9b54ad02171e8bf31e8d158a9f586e92ffce994ecce9a5185cc80364d50a6f7b94849a914242fcb73f33a86ecc83c3403630d20650ddb8cd9c4", "4beae3515ba35ec8cbd1d94567e22b0d7809c466abfbafe9610349597ba15b45"],
      [2184, "b1caa396771a09a1db9bc20543e988e359d47c2a616417bbca1b62cb02796a888fc6eeff5c0b5c3d5062fcb4256f6ae1782f492c1cf03610b4a1fb7b814c057878e1190b9835425c7a4a0e182ad1f91535ed2a35033a5d8c670e21c575ff43c194a58a82d4a1a44881dd61f9f8161fc6b998860cbe4975780be93b6f87980bad0a99aa2cb7556b478ca35d1f3746c33e2bb7c47af426641cc7bbb3425e2144820345e1d0ea5b7da2c3236a52906acdc3b4d34e474dd714c0c40bf006a3a1d889a632983814bbc4a14fe5f159aa89249e7c738b3b73666bac2a615a83fd21ae0a1ce7352ade7b278b587158fd2fabb217aa1fe31d0bda53272045598015a8ae4d8cec226fefa58daa05500906c4d85e7567", "cb5648a1d61c6c5bdacd96f81c9591debc3950dcf658145b8d996570ba881a05"],
    ],
    "sha3-384": [
      [0, "", "0c63a75b845e4f7d01107d852e4c2485c51a50aaaa94fc61995e71bbee983a2ac3713831264adb47fb6bd1e058d5f004"],
      [8, "80", "7541384852e10ff10d5fb6a7213a4a6c15ccc86d8bc1068ac04f69277142944f4ee50d91fdc56553db06b2f5039c8ab7"],
      [824, "6c36147652e71b560becbca1e7656c81b4f70bece26321d5e55e67a3db9d89e26f2f2a38fd0f289bf7fa22c2877e38d9755412794cef24d7b855303c332e0cb5e01aa50bb74844f5e345108d6811d5010978038b699ffaa370de8473f0cda38b89a28ed6cabaf6", "b1319192df11faa00d3c4b068becc8f1ba3b00e0d1ff1f93c11a3663522fdb92ab3cca389634687c632e0a4b5a26ce92"],
      [832, "92c41d34bd249c182ad4e18e3b856770766f1757209675020d4c1cf7b6f7686c8c1472678c7c412514e63eb9f5aee9f5c9d5cb8d8748ab7a5465059d9cbbb8a56211ff32d4aaa23a23c86ead916fe254cc6b2bff7a9553df1551b531f95bb41cbbc4acddbd372921", "71307eec1355f73e5b726ed9efa1129086af81364e30a291f684dfade693cc4bc3d6ffcb7f3b4012a21976ff9edcab61"],
      [1672, "5fe35923b4e0af7dd24971812a58425519850a506dfa9b0d254795be785786c319a2567cbaa5e35bcf8fe83d943e23fa5169b73adc1fcf8b607084b15e6a013df147e46256e4e803ab75c110f77848136be7d806e8b2f868c16c3a90c14463407038cb7d9285079ef162c6a45cedf9c9f066375c969b5fcbcda37f02aacff4f31cded3767570885426bebd9eca877e44674e9ae2f0c24cdd0e7e1aaf1ff2fe7f80a1c4f5078eb34cd4f06fa94a2d1eab5806ca43fd0f06c60b63d5402b95c70c21ea65a151c5cfaf8262a46be3c722264b", "3054d249f916a6039b2a9c3ebec1418791a0608a170e6d36486035e5f92635eaba98072a85373cb54e2ae3f982ce132b"],
    ],
    "sha3-512": [
      [0, "", "a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26"],
      [8, "e5", "150240baf95fb36f8ccb87a19a41767e7aed95125075a2b2dbba6e565e1ce8575f2b042b62e29a04e9440314a821c6224182964d8b557b16a492b3806f4c39c1"],
      [568, "b0de0430c200d74bf41ea0c92f8f28e11b68006a884e0d4b0d884533ee58b38a438cc1a75750b6434f467e2d0cd9aa4052ceb793291b93ef83fd5d8620456ce1aff2941b3605a4", "9e9e469ca9226cd012f5c9cc39c96adc22f420030fcee305a0ed27974e3c802701603dac873ae4476e9c3d57e55524483fc01adaef87daa9e304078c59802757"],
      [576, "0ce9f8c3a990c268f34efd9befdb0f7c4ef8466cfdb01171f8de70dc5fefa92acbe93d29e2ac1a5c2979129f1ab08c0e77de7924ddf68a209cdfa0adc62f85c18637d9c6b33f4ff8", "b018a20fcf831dde290e4fb18c56342efe138472cbe142da6b77eea4fce52588c04c808eb32912faa345245a850346faec46c3a16d39bd2e1ddb1816bc57d2da"],
      [1160, "664ef2e3a7059daf1c58caf52008c5227e85cdcb83b4c59457f02c508d4f4f69f826bd82c0cffc5cb6a97af6e561c6f96970005285e58f21ef6511d26e709889a7e513c434c90a3cf7448f0caeec7114c747b2a0758a3b4503a7cf0c69873ed31d94dbef2b7b2f168830ef7da3322c3d3e10cafb7c2c33c83bbf4c46a31da90cff3bfd4ccc6ed4b310758491eeba603a76", "e5825ff1a3c070d5a52fbbe711854a440554295ffb7a7969a17908d10163bfbe8f1d52a676e8a0137b56a11cdf0ffbb456bc899fc727d14bd8882232549d914e"],
    ],
  };

  it("gives the CAVP digests", () => {
    for (const [name, vectors] of Object.entries(CAVP) as [keyof typeof CAVP, [number, string, string][]][]) {
      const bits = Number(name.slice(5)) as 224 | 256 | 384 | 512;
      for (const [length, message, digest] of vectors) expect([name, length, run(sha3Hasher(bits), fromHex(message))]).toEqual([name, length, digest]);
    }
  });
});

describe("BLAKE2", () => {
  it("gives the examples of RFC 7693 appendices A and B", () => {
    expect(run(createBlake2b, text("abc"))).toBe(
      "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923",
    );
    expect(run(createBlake2s, text("abc"))).toBe("508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982");
  });
});

describe("BLAKE3", () => {
  // The BLAKE3 team's test_vectors.json: input bytes i % 251, the first 32 bytes of "hash".
  const VECTORS: [number, string][] = [
    [0, "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"],
    [1, "2d3adedff11b61f14c886e35afa036736dcd87a74d27b5c1510225d0f592e213"],
    [2, "7b7015bb92cf0b318037702a6cdd81dee41224f734684c2c122cd6359cb1ee63"],
    [3, "e1be4d7a8ab5560aa4199eea339849ba8e293d55ca0a81006726d184519e647f"],
    [4, "f30f5ab28fe047904037f77b6da4fea1e27241c5d132638d8bedce9d40494f32"],
    [5, "b40b44dfd97e7a84a996a91af8b85188c66c126940ba7aad2e7ae6b385402aa2"],
    [6, "06c4e8ffb6872fad96f9aaca5eee1553eb62aed0ad7198cef42e87f6a616c844"],
    [7, "3f8770f387faad08faa9d8414e9f449ac68e6ff0417f673f602a646a891419fe"],
    [8, "2351207d04fc16ade43ccab08600939c7c1fa70a5c0aaca76063d04c3228eaeb"],
    [63, "e9bc37a594daad83be9470df7f7b3798297c3d834ce80ba85d6e207627b7db7b"],
    [64, "4eed7141ea4a5cd4b788606bd23f46e212af9cacebacdc7d1f4c6dc7f2511b98"],
    [65, "de1e5fa0be70df6d2be8fffd0e99ceaa8eb6e8c93a63f2d8d1c30ecb6b263dee"],
    [127, "d81293fda863f008c09e92fc382a81f5a0b4a1251cba1634016a0f86a6bd640d"],
    [128, "f17e570564b26578c33bb7f44643f539624b05df1a76c81f30acd548c44b45ef"],
    [129, "683aaae9f3c5ba37eaaf072aed0f9e30bac0865137bae68b1fde4ca2aebdcb12"],
    [1023, "10108970eeda3eb932baac1428c7a2163b0e924c9a9e25b35bba72b28f70bd11"],
    [1024, "42214739f095a406f3fc83deb889744ac00df831c10daa55189b5d121c855af7"],
    [1025, "d00278ae47eb27b34faecf67b4fe263f82d5412916c1ffd97c8cb7fb814b8444"],
    [2048, "e776b6028c7cd22a4d0ba182a8bf62205d2ef576467e838ed6f2529b85fba24a"],
    [2049, "5f4d72f40d7a5f82b15ca2b2e44b1de3c2ef86c426c95c1af0b6879522563030"],
    [3072, "b98cb0ff3623be03326b373de6b9095218513e64f1ee2edd2525c7ad1e5cffd2"],
    [3073, "7124b49501012f81cc7f11ca069ec9226cecb8a2c850cfe644e327d22d3e1cd3"],
    [4096, "015094013f57a5277b59d8475c0501042c0b642e531b0a1c8f58d2163229e969"],
    [4097, "9b4052b38f1c5fc8b1f9ff7ac7b27cd242487b3d890d15c96a1c25b8aa0fb995"],
    [5120, "9cadc15fed8b5d854562b26a9536d9707cadeda9b143978f319ab34230535833"],
    [5121, "628bd2cb2004694adaab7bbd778a25df25c47b9d4155a55f8fbd79f2fe154cff"],
    [6144, "3e2e5b74e048f3add6d21faab3f83aa44d3b2278afb83b80b3c35164ebeca205"],
    [6145, "f1323a8631446cc50536a9f705ee5cb619424d46887f3c376c695b70e0f0507f"],
    [7168, "61da957ec2499a95d6b8023e2b0e604ec7f6b50e80a9678b89d2628e99ada77a"],
    [7169, "a003fc7a51754a9b3c7fae0367ab3d782dccf28855a03d435f8cfe74605e7817"],
    [8192, "aae792484c8efe4f19e2ca7d371d8c467ffb10748d8a5a1ae579948f718a2a63"],
    [8193, "bab6c09cb8ce8cf459261398d2e7aef35700bf488116ceb94a36d0f5f1b7bc3b"],
    [16384, "f875d6646de28985646f34ee13be9a576fd515f76b5b0a26bb324735041ddde4"],
    [31744, "62b6960e1a44bcc1eb1a611a8d6235b6b4b78f32e7abc4fb4c6cdcce94895c47"],
    [102400, "bc3e3d41a1146b069abffad3c0d44860cf664390afce4d9661f7902e7943e085"]
  ];
  it("gives the official test vectors", () => {
    expect(VECTORS.map(([length]) => [length, run(createBlake3, Uint8Array.from({ length }, (_, i) => i % 251))])).toEqual(VECTORS);
  });

  it("gives the same hash for any split, across chunks and subtrees", () => {
    const [length, expected] = VECTORS.at(-1)!;
    const data = Uint8Array.from({ length }, (_, i) => i % 251);
    for (const size of [1, 63, 64, 65, 1023, 1024, 1025, 4096, 50_000]) {
      const parts = Array.from({ length: Math.ceil(length / size) }, (_, i) => data.subarray(i * size, (i + 1) * size));
      expect([size, run(createBlake3, ...parts)]).toEqual([size, expected]);
    }
  });
});

describe("against Node (OpenSSL) on inputs of every length around the block sizes, split anywhere", () => {
  const cases: [string, () => Hasher, string][] = [
    ["SHA3-224", sha3Hasher(224), "sha3-224"],
    ["SHA3-256", sha3Hasher(256), "sha3-256"],
    ["SHA3-384", sha3Hasher(384), "sha3-384"],
    ["SHA3-512", sha3Hasher(512), "sha3-512"],
    ["BLAKE2b-512", createBlake2b, "blake2b512"],
    ["BLAKE2s-256", createBlake2s, "blake2s256"],
  ];
  for (const [name, create, openssl] of cases) {
    it(name, () => {
      for (let length = 0; length <= 300; length++) {
        const data = bytes(length, length);
        const cut = (length * 7) % (length + 1);
        expect([length, run(create, data.subarray(0, cut), data.subarray(cut))]).toEqual([length, createHash(openssl).update(data).digest("hex")]);
      }
      const large = bytes(100_003);
      expect(run(create, large.subarray(0, 4099), large.subarray(4099, 70_001), large.subarray(70_001))).toBe(createHash(openssl).update(large).digest("hex"));
    });
  }
});

it("lists the extra algorithms after the main ones, each with its name and digest length", () => {
  expect(ALL_ALGORITHMS.map((algorithm) => `${algorithm.name}:${algorithm.bytes}`)).toEqual([
    "MD5:16", "SHA-1:20", "SHA-256:32", "SHA-384:48", "SHA-512:64", "CRC32:4",
    "SHA-224:28", "SHA-512/256:32", "SHA3-224:28", "SHA3-256:32", "SHA3-384:48", "SHA3-512:64",
    "BLAKE2b-512:64", "BLAKE2s-256:32", "BLAKE3-256:32", "RIPEMD-160:20", "CRC32C:4",
  ]);
  for (const algorithm of EXTRA_ALGORITHMS) {
    const hasher = algorithm.create!();
    hasher.update(text("abc"));
    expect([algorithm.id, hasher.digest().length]).toEqual([algorithm.id, algorithm.bytes]);
  }
});
