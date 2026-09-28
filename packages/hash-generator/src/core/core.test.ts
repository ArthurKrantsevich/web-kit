// @vitest-environment node
/// <reference types="node" />
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { createCrc32 } from "./crc";
import { encodeDigest } from "./encode";
import { hashAll } from "./hash";
import { createMd5 } from "./md5";
import type { Hasher } from "./types";
import { hmac, keyBytes, webDigest } from "./webcrypto";

const text = (value: string) => new TextEncoder().encode(value);
const hex = (bytes: Uint8Array | undefined) => (bytes === undefined ? "" : encodeDigest(bytes, "hex"));
const fromHex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (pair) => parseInt(pair, 16));
const run = (create: () => Hasher, ...parts: Uint8Array[]) => {
  const hasher = create();
  for (const part of parts) hasher.update(part);
  return hex(hasher.digest());
};

describe("MD5 and CRC32", () => {
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
    expect(suite.map(([input]) => [input, run(createMd5, text(input))])).toEqual(suite);
  });

  it("gives the check value of CRC-32/ISO-HDLC: 123456789 → cbf43926", () => {
    expect(run(createCrc32, text("123456789"))).toBe("cbf43926");
    expect(run(createCrc32, text(""))).toBe("00000000");
  });

  it("gives the same digest however the input is split", () => {
    const bytes = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31 + 7) % 256);
    for (const create of [createMd5, createCrc32]) {
      const whole = run(create, bytes);
      for (const size of [1, 7, 63, 64, 65, 1000]) {
        const parts = Array.from({ length: Math.ceil(bytes.length / size) }, (_, i) => bytes.subarray(i * size, (i + 1) * size));
        expect([size, run(create, ...parts)]).toEqual([size, whole]);
      }
    }
  });
});

describe("SHA-1 and SHA-2 by Web Crypto", () => {
  // NIST CSRC examples for FIPS 180-4: one-block "abc" and the two-block messages.
  const TWO_BLOCKS = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
  const TWO_BLOCKS_1024 = "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";

  it("gives NIST's example digests", async () => {
    expect(hex(await webDigest("SHA-1", text("abc")))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(hex(await webDigest("SHA-1", text(TWO_BLOCKS)))).toBe("84983e441c3bd26ebaae4aa1f95129e5e54670f1");
    expect(hex(await webDigest("SHA-256", text("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hex(await webDigest("SHA-256", text(TWO_BLOCKS)))).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(hex(await webDigest("SHA-384", text("abc")))).toBe(
      "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
    );
    expect(hex(await webDigest("SHA-384", text(TWO_BLOCKS_1024)))).toBe(
      "09330c33f71147e83d192fc782cd1b4753111b173b3b05d22fa08086e3b0f712fcc7c71a557e2db966c3e9fa91746039",
    );
    expect(hex(await webDigest("SHA-512", text("abc")))).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    );
    expect(hex(await webDigest("SHA-512", text(TWO_BLOCKS_1024)))).toBe(
      "8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909",
    );
  });
});

describe("SHA-1 and SHA-2 against NIST CAVP", () => {
  // SHAVS byte-oriented vectors (shabytetestvectors.zip): the messages of 0, 8, block − 8 and block bits of ShortMsg and
  // the first of LongMsg, as bits, message and digest.
  const CAVP: Record<"SHA-1" | "SHA-256" | "SHA-384" | "SHA-512", [number, string, string][]> = {
    "SHA-1": [
      [0, "", "da39a3ee5e6b4b0d3255bfef95601890afd80709"],
      [8, "36", "c1dfd96eea8cc2b62785275bca38ac261256e278"],
      [504, "f2c76ef617fa2bfc8a4d6bcbb15fe88436fdc2165d3074629579079d4d5b86f5081ab177b4c3f530376c9c924cbd421a8daf8830d0940c4fb7589865830699", "9f3ea255f6af95c5454e55d7354cabb45352ea0b"],
      [512, "45927e32ddf801caf35e18e7b5078b7f5435278212ec6bb99df884f49b327c6486feae46ba187dc1cc9145121e1492e6b06e9007394dc33b7748f86ac3207cfe", "a70cfbfe7563dd0e665c7c6715a96a8d756950c0"],
      [1304, "7c9c67323a1df1adbfe5ceb415eaef0155ece2820f4d50c1ec22cba4928ac656c83fe585db6a78ce40bc42757aba7e5a3f582428d6ca68d0c3978336a6efb729613e8d9979016204bfd921322fdd5222183554447de5e6e9bbe6edf76d7b71e18dc2e8d6dc89b7398364f652fafc734329aafa3dcd45d4f31e388e4fafd7fc6495f37ca5cbab7f54d586463da4bfeaa3bae09f7b8e9239d832b4f0a733aa609cc1f8d4", "d8fd6a91ef3b6ced05b98358a99107c1fac8c807"],
    ],
    "SHA-256": [
      [0, "", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
      [8, "d3", "28969cdfa74a12c82f3bad960b0b000aca2ac329deea5c2328ebc6f2ba9802c1"],
      [504, "e2f76e97606a872e317439f1a03fcd92e632e5bd4e7cbc4e97f1afc19a16fde92d77cbe546416b51640cddb92af996534dfd81edb17c4424cf1ac4d75aceeb", "18041bd4665083001fba8c5411d2d748e8abbfdcdfd9218cb02b68a78e7d4c23"],
      [512, "5a86b737eaea8ee976a0a24da63e7ed7eefad18a101c1211e2b3650c5187c2a8a650547208251f6d4237e661c7bf4c77f335390394c37fa1a9f9be836ac28509", "42e61e174fbb3897d6dd6cef3dd2802fe67b331953b06114a65c772859dfc1aa"],
      [1304, "451101250ec6f26652249d59dc974b7361d571a8101cdfd36aba3b5854d3ae086b5fdd4597721b66e3c0dc5d8c606d9657d0e323283a5217d1f53f2f284f57b85c8a61ac8924711f895c5ed90ef17745ed2d728abd22a5f7a13479a462d71b56c19a74a40b655c58edfe0a188ad2cf46cbf30524f65d423c837dd1ff2bf462ac4198007345bb44dbb7b1c861298cdf61982a833afc728fae1eda2f87aa2c9480858bec", "3c593aa539fdcdae516cdf2f15000f6634185c88f505b39775fb9ab137a10aa2"],
    ],
    "SHA-384": [
      [0, "", "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b"],
      [8, "c5", "b52b72da75d0666379e20f9b4a79c33a329a01f06a2fb7865c9062a28c1de860ba432edfd86b4cb1cb8a75b46076e3b1"],
      [1016, "dbed7612448d46cbe0a384d1c93233f02ffd1c984ba765299518656d3723b766c1658d4b1e7047cdc729459e366ef9349efc40cbd990f2a9a24db7a5045e1dea12dce8f9d9f2aaed933f93031e7b8959ac5e7bf6bbbdf30b48f7eb783f8fe292371a2f245c5c94b4acae160767a20ce7c0ea7723d97691d8eedda9efd1fe2d", "fb531a1ed181c732311e56f4b56ed91dcacc0dd6bf1eb4a44be6f87dd7cb1ef9dfb0310f4a79eaaa3f32bf3914d8624e"],
      [1024, "3bf52cc5ee86b9a0190f390a5c0366a560b557000dbe5115fd9ee11630a62769011575f15881198f227876e8fe685a6939bc8b89fd48a34ec5e71e131462b2886794dffa68ccc6d564733e67ffef25e627c6f4b5460796e3bce67bf58ca6e8e555bc916a8531697ac948b90dc8616f25101db90b50c3d3dbc9e21e42ff387187", "12b6cb35eda92ee37356ddee77781a17b3d90e563824a984faffc6fdd1693bd7626039635563cfc3b9a2b00f9c65eefd"],
      [1816, "62c6a169b9be02b3d7b471a964fc0bcc72b480d26aecb2ed460b7f50016ddaf04c51218783f3aadfdff5a04ded030d7b3fb7376b61ba30b90e2da921a4470740d63fb99fa16cc8ed81abaf8ce4016e50df81da832070372c24a80890aa3a26fa675710b8fb718266249d496f313c55d0bada101f8f56eeccee4345a8f98f60a36662cfda794900d12f9414fcbdfdeb85388a814996b47e24d5c8086e7a8edcc53d299d0d033e6bb60c58b83d6e8b57f6c258d6081dd10eb942fdf8ec157ec3e75371235a8196eb9d22b1de3a2d30c2abbe0db7650cf6c7159bacbe29b3a93c92100508", "0730e184e7795575569f87030260bb8e54498e0e5d096b18285e988d245b6f3486d1f2447d5f85bcbe59d5689fc49425"],
    ],
    "SHA-512": [
      [0, "", "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e"],
      [8, "21", "3831a6a6155e509dee59a7f451eb35324d8f8f2df6e3708894740f98fdee23889f4de5adb0c5010dfb555cda77c8ab5dc902094c52de3278f35a75ebc25f093a"],
      [1016, "c13e6ca3abb893aa5f82c4a8ef754460628af6b75af02168f45b72f8f09e45ed127c203bc7bb80ff0c7bd96f8cc6d8110868eb2cfc01037d8058992a6cf2effcbfe498c842e53a2e68a793867968ba18efc4a78b21cdf6a11e5de821dcabab14921ddb33625d48a13baffad6fe8272dbdf4433bd0f7b813c981269c388f001", "6e56f77f6883d0bd4face8b8d557f144661989f66d51b1fe4b8fc7124d66d9d20218616fea1bcf86c08d63bf8f2f21845a3e519083b937e70aa7c358310b5a7c"],
      [1024, "fd2203e467574e834ab07c9097ae164532f24be1eb5d88f1af7748ceff0d2c67a21f4e4097f9d3bb4e9fbf97186e0db6db0100230a52b453d421f8ab9c9a6043aa3295ea20d2f06a2f37470d8a99075f1b8a8336f6228cf08b5942fc1fb4299c7d2480e8e82bce175540bdfad7752bc95b577f229515394f3ae5cec870a4b2f8", "a21b1077d52b27ac545af63b32746c6e3c51cb0cb9f281eb9f3580a6d4996d5c9917d2a6e484627a9d5a06fa1b25327a9d710e027387fc3e07d7c4d14c6086cc"],
      [1816, "4f05600950664d5190a2ebc29c9edb89c20079a4d3e6bc3b27d75e34e2fa3d02768502bd69790078598d5fcf3d6779bfed1284bbe5ad72fb456015181d9587d6e864c940564eaafb4f2fead4346ea09b6877d9340f6b82eb1515880872213da3ad88feba9f4f13817a71d6f90a1a17c43a15c038d988b5b29edffe2d6a062813cedbe852cde302b3e33b696846d2a8e36bd680efcc6cd3f9e9a4c1ae8cac10cc5244d131677140399176ed46700019a004a163806f7fa467fc4e17b4617bbd7641aaff7ff56396ba8c08a8be100b33a20b5daf134a2aefa5e1c3496770dcf6baa4f7bb", "a9db490c708cc72548d78635aa7da79bb253f945d710e5cb677a474efc7c65a2aab45bc7ca1113c8ce0f3c32e1399de9c459535e8816521ab714b2a6cd200525"],
    ],
  };

  it("gives the CAVP digests", async () => {
    for (const [name, vectors] of Object.entries(CAVP) as [keyof typeof CAVP, [number, string, string][]][]) {
      for (const [bits, message, digest] of vectors) expect([name, bits, hex(await webDigest(name, fromHex(message)))]).toEqual([name, bits, digest]);
    }
  });
});

describe("HMAC", () => {
  // RFC 4231 §4.2–4.8: key, data, HMAC-SHA-256, -384, -512 (test case 5 is truncated to 128 bits).
  const RFC4231: [number, string, string, string, string, string][] = [
    [1, "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b", "4869205468657265", "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7", "afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6", "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854"],
    [2, "4a656665", "7768617420646f2079612077616e7420666f72206e6f7468696e673f", "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843", "af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649", "164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737"],
    [3, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe", "88062608d3e6ad8a0aa2ace014c8a86f0aa635d947ac9febe83ef4e55966144b2a5ab39dc13814b94e3ab6e101a34f27", "fa73b0089d56a284efb0f0756c890be9b1b5dbdd8ee81a3655f83e33b2279d39bf3e848279a722c806b485a47e67c807b946a337bee8942674278859e13292fb"],
    [4, "0102030405060708090a0b0c0d0e0f10111213141516171819", "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd", "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b", "3e8a69b7783c25851933ab6290af6ca77a9981480850009cc5577c6e1f573b4e6801dd23c4a7d679ccf8a386c674cffb", "b0ba465637458c6990e5a8c5f61d4af7e576d97ff94b872de76f8050361ee3dba91ca5c11aa25eb4d679275cc5788063a5f19741120c4f2de2adebeb10a298dd"],
    [5, "0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c", "546573742057697468205472756e636174696f6e", "a3b6167473100ee06e0c796c2955552b", "3abf34c3503b2a23a46efc619baef897", "415fad6271580a531d4179bc891d87a6"],
    [6, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "54657374205573696e67204c6172676572205468616e20426c6f636b2d53697a65204b6579202d2048617368204b6579204669727374", "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54", "4ece084485813e9088d2c63a041bc5b44f9ef1012a2b588f3cd11f05033ac4c60c2ef6ab4030fe8296248df163f44952", "80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598"],
    [7, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "5468697320697320612074657374207573696e672061206c6172676572207468616e20626c6f636b2d73697a65206b657920616e642061206c6172676572207468616e20626c6f636b2d73697a6520646174612e20546865206b6579206e6565647320746f20626520686173686564206265666f7265206265696e6720757365642062792074686520484d414320616c676f726974686d2e", "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2", "6617178e941f020d351e2f254e8fd32c602420feb0b8fb9adccebb82461e99c5a678cc31e799176d3860e6110c46523e", "e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58"]
  ];
  // RFC 2202 §3: key, data, HMAC-SHA-1.
  const RFC2202: [number, string, string, string][] = [
    [1, "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b", "4869205468657265", "b617318655057264e28bc0b6fb378c8ef146be00"],
    [2, "4a656665", "7768617420646f2079612077616e7420666f72206e6f7468696e673f", "effcdf6ae5eb2fa2d27416d5f184df9c259a7c79"],
    [3, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "125d7342b9ac11cd91a39af48aa17b4f63f175d3"],
    [4, "0102030405060708090a0b0c0d0e0f10111213141516171819", "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd", "4c9007f4026250c6bc8414f9bf50c86c2d7235da"],
    [5, "0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c", "546573742057697468205472756e636174696f6e", "4c1a03424b55e07fe7f27be1d58bb9324a9a5a04"],
    [6, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "54657374205573696e67204c6172676572205468616e20426c6f636b2d53697a65204b6579202d2048617368204b6579204669727374", "aa4ae5e15272d00e95705637ce8a3b55ed402112"],
    [7, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "54657374205573696e67204c6172676572205468616e20426c6f636b2d53697a65204b657920616e64204c6172676572205468616e204f6e6520426c6f636b2d53697a652044617461", "e8e99d0f45237d786d6bbaa7965c7808bbff1a91"]
  ];

  it("gives the HMAC-SHA-256, -384 and -512 test cases of RFC 4231", async () => {
    for (const [number, key, data, ...expected] of RFC4231) {
      const macs = [];
      for (const name of ["SHA-256", "SHA-384", "SHA-512"] as const) {
        const mac = await hmac(name, { text: key, format: "hex" }, fromHex(data));
        macs.push(mac.ok ? hex(mac.value) : mac.error.message);
      }
      expect([number, macs.map((mac, i) => mac.slice(0, expected[i]!.length))]).toEqual([number, expected]);
    }
  });

  it("gives the HMAC-SHA-1 test cases of RFC 2202", async () => {
    for (const [number, key, data, expected] of RFC2202) {
      const mac = await hmac("SHA-1", { text: key, format: "hex" }, fromHex(data));
      expect([number, mac.ok ? hex(mac.value) : mac.error.message]).toEqual([number, expected]);
    }
  });

  it("takes a key as UTF-8 text or as hex with spaces, and says why a key cannot be read", async () => {
    const jefe = await hmac("SHA-256", { text: "Jefe", format: "text" }, text("what do ya want for nothing?"));
    expect(jefe.ok && hex(jefe.value)).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    expect(keyBytes({ text: "4a 65 66 65", format: "hex" })).toEqual({ ok: true, value: text("Jefe") });
    expect(keyBytes({ text: "", format: "text" })).toEqual({ ok: false, error: { message: "Enter the HMAC key" } });
    expect(keyBytes({ text: " ", format: "hex" })).toEqual({ ok: false, error: { message: "Enter the HMAC key" } });
    expect(keyBytes({ text: "4a6g", format: "hex" })).toEqual({ ok: false, error: { message: 'The key is not hex: "g" is not a hexadecimal digit' } });
    expect(keyBytes({ text: "4a6", format: "hex" })).toEqual({ ok: false, error: { message: "The key is not hex: it has an odd number of digits" } });
  });
});

describe("encodeDigest", () => {
  it("writes hex, HEX, Base64 and Base64url (SHA-256 of nothing, checked with Python)", async () => {
    const digest = await webDigest("SHA-256", text(""));
    expect(encodeDigest(digest, "hex")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(encodeDigest(digest, "HEX")).toBe("E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855");
    expect(encodeDigest(digest, "base64")).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
    expect(encodeDigest(digest, "base64url")).toBe("47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU");
  });
});

describe("hashAll", () => {
  it("hashes a text as UTF-8 with the main algorithms, in the table's order", async () => {
    const result = await hashAll("abc");
    if (!result.ok) throw new Error(result.error.message);
    expect(Object.keys(result.value)).toEqual(["md5", "sha1", "sha256", "sha384", "sha512", "crc32"]);
    expect(hex(result.value.md5)).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(hex(result.value.sha256)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    // Python's zlib.crc32(b"abc").
    expect(hex(result.value.crc32)).toBe("352441c2");
  });

  it("takes bytes made in another realm (an iframe, a test DOM) as bytes, not as a Blob", async () => {
    const foreign = runInNewContext("new Uint8Array([97, 98, 99])") as Uint8Array<ArrayBuffer>;
    expect(foreign instanceof Uint8Array).toBe(false);
    expect(await hashAll(foreign)).toEqual(await hashAll("abc"));
  });

  it("reads a Blob part by part, reports progress, and gives what the whole bytes give", async () => {
    const bytes = Uint8Array.from({ length: 10_000 }, (_, i) => i % 251);
    const whole = await hashAll(bytes);
    const progress: number[] = [];
    const parts = await hashAll(new Blob([bytes]), { chunkSize: 4096, onProgress: (done) => progress.push(done) });
    expect(parts).toEqual(whole);
    expect(progress).toEqual([4096, 8192, 10_000]);
  });

  it("gives only the HMACs of the Web Crypto algorithms with a key, for text and for a Blob", async () => {
    const key = { text: "Jefe", format: "text" } as const;
    const fromText = await hashAll("what do ya want for nothing?", { hmacKey: key });
    const fromBlob = await hashAll(new Blob(["what do ya want for nothing?"]), { hmacKey: key, chunkSize: 5 });
    expect(fromBlob).toEqual(fromText);
    if (!fromText.ok) throw new Error(fromText.error.message);
    expect(Object.keys(fromText.value)).toEqual(["sha1", "sha256", "sha384", "sha512"]);
    expect(hex(fromText.value.sha256)).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    expect(await hashAll("x", { hmacKey: { text: "zz", format: "hex" } })).toEqual({
      ok: false,
      error: { message: 'The key is not hex: "z" is not a hexadecimal digit' },
    });
  });

  it("stops when cancelled and says when a file cannot be read", async () => {
    const controller = new AbortController();
    const cancelled = hashAll(new Blob([new Uint8Array(100)]), { chunkSize: 10, pause: async () => controller.abort(), signal: controller.signal });
    expect(await cancelled).toEqual({ ok: false, error: { message: "Cancelled" } });
    const broken = { size: 10, slice: () => ({ arrayBuffer: () => Promise.reject(new Error("gone")) }) } as unknown as Blob;
    expect(await hashAll(broken)).toEqual({ ok: false, error: { message: "Could not read the file" } });
    const empty = await hashAll(new Blob([]));
    expect(empty.ok && [hex(empty.value.md5), hex(empty.value.sha256)]).toEqual([
      "d41d8cd98f00b204e9800998ecf8427e",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ]);
  });
});
