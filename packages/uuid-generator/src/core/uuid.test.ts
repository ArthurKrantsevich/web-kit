// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cryptoRandom } from "./random";
import { seededRandom } from "./seeded";
import { formatUuid, makeV4, MAX_UUID, NAMESPACES, NIL_UUID, uuidDigits, uuidV3, uuidV5 } from "./uuid";

const RFC = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuid v4", () => {
  it("has version 4 and the RFC 9562 variant in 10,000 values, all different", () => {
    const ids = Array.from({ length: 10_000 }, () => makeV4(cryptoRandom));
    expect(ids.filter((id) => RFC.exec(id)?.[1] !== "4")).toEqual([]);
    expect(new Set(ids).size).toBe(10_000);
  });

  it("keeps the 122 random bits and only sets version and variant (RFC 9562 A.3's random bytes)", () => {
    const bytes = [0x91, 0x91, 0x08, 0xf7, 0x52, 0xd1, 0x33, 0x20, 0x5b, 0xac, 0xf8, 0x47, 0xdb, 0x41, 0x48, 0xa8];
    expect(makeV4((array) => array.set(bytes))).toBe("919108f7-52d1-4320-9bac-f847db4148a8");
  });
});

describe("uuid v3 and v5", () => {
  it("gives RFC 9562's examples A.2 and A.4: the DNS namespace and www.example.com", () => {
    expect(uuidV3("dns", "www.example.com")).toEqual({ ok: true, value: "5df41881-3aed-3515-88a7-2f4a814cf09e" });
    expect(uuidV5("dns", "www.example.com")).toEqual({ ok: true, value: "2ed6657d-e927-568b-95e1-2665a8aea6a2" });
  });

  // Expected values computed with Python 3.12: uuid.uuid3 / uuid.uuid5.
  it("matches Python's uuid module for the other namespaces, UTF-8 names, an empty name and a custom namespace", () => {
    expect(uuidV3("url", "https://example.com/")).toEqual({ ok: true, value: "b9dcdff8-af4a-365d-8043-0f8361942709" });
    expect(uuidV5("url", "https://example.com/")).toEqual({ ok: true, value: "dd2c1780-811a-5296-81c5-178a0ef488bc" });
    expect(uuidV5("oid", "1.3.6.1")).toEqual({ ok: true, value: "1447fa61-5277-5fef-a9b3-fbc6e44f4af3" });
    expect(uuidV3("x500", "cn=John,dc=example,dc=com")).toEqual({ ok: true, value: "f3be8441-73d9-3295-82c6-e386e0669381" });
    expect(uuidV5("dns", "пример.рф")).toEqual({ ok: true, value: "5765b11b-9204-5cd2-b8f1-1cb9e9bc98ef" });
    expect(uuidV5("dns", "")).toEqual({ ok: true, value: "4ebd0208-8328-5d69-8c44-ec50939c0967" });
    expect(uuidV5("{919108F7-52D1-4320-9BAC-F847DB4148A8}", "custom")).toEqual({ ok: true, value: "a4dc875a-31bc-52aa-90a6-5344db0fab7f" });
  });

  it("names the namespaces of RFC 9562 §6.6, and refuses a namespace that is not a UUID", () => {
    expect(NAMESPACES).toEqual({
      dns: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      url: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
      oid: "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
      x500: "6ba7b814-9dad-11d1-80b4-00c04fd430c8",
    });
    expect(uuidV5("example.com", "a")).toEqual({ ok: false, error: { message: 'The namespace "example.com" is not a UUID' } });
  });
});

describe("uuidDigits", () => {
  it("reads a UUID with or without hyphens, in braces, as a URN, in any case, with spaces around it", () => {
    const digits = "919108f752d143209bacf847db4148a8";
    for (const text of [
      "919108f7-52d1-4320-9bac-f847db4148a8",
      "919108F752D143209BACF847DB4148A8",
      "{919108f7-52d1-4320-9bac-f847db4148a8}",
      "  urn:uuid:919108F7-52D1-4320-9BAC-F847DB4148A8\n",
    ]) {
      expect([text, uuidDigits(text)]).toEqual([text, digits]);
    }
    for (const text of ["919108f7-52d1-4320-9bac-f847db4148a", "919108f752d1-4320-9bac-f847db4148a8", "{919108f7}", "g19108f752d143209bacf847db4148a8"]) {
      expect([text, uuidDigits(text)]).toEqual([text, null]);
    }
  });
});

describe("formatUuid", () => {
  const id = "919108f7-52d1-4320-9bac-f847db4148a8";

  it("writes a UUID in upper case, without hyphens, in braces or as a URN", () => {
    expect(formatUuid(id, { case: "upper" })).toBe("919108F7-52D1-4320-9BAC-F847DB4148A8");
    expect(formatUuid(id, { hyphens: false })).toBe("919108f752d143209bacf847db4148a8");
    expect(formatUuid(id, { wrap: "braces", case: "upper" })).toBe("{919108F7-52D1-4320-9BAC-F847DB4148A8}");
    expect(formatUuid(id, { wrap: "urn", hyphens: false })).toBe("urn:uuid:919108f752d143209bacf847db4148a8");
    expect(formatUuid(`{${id.toUpperCase()}}`)).toBe(id);
  });

  it("changes only the case of a ULID and leaves a NanoID alone", () => {
    expect(formatUuid("01ARYZ6S41TSV4RRFFQ69G5FAV", { case: "lower", hyphens: false, wrap: "braces" })).toBe("01aryz6s41tsv4rrffq69g5fav");
    expect(formatUuid("01aryz6s41tsv4rrffq69g5fav")).toBe("01ARYZ6S41TSV4RRFFQ69G5FAV");
    expect(formatUuid("V1StGXR8_Z5jdHi6B-myT", { case: "upper", wrap: "urn" })).toBe("V1StGXR8_Z5jdHi6B-myT");
  });

  it("writes the Nil and Max UUIDs of RFC 9562 §5.9 and §5.10", () => {
    expect([NIL_UUID, formatUuid(MAX_UUID, { case: "upper" })]).toEqual(["00000000-0000-0000-0000-000000000000", "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF"]);
  });
});

it("uses no other randomness than the source it is given", () => {
  const [a, b] = [seededRandom(7), seededRandom(7)];
  expect([makeV4(a), makeV4(a)]).toEqual([makeV4(b), makeV4(b)]);
});
