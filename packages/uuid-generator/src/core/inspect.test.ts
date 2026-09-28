// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inspectId } from "./inspect";

const info = (text: string) => {
  const result = inspectId(text);
  return result.ok ? result.value : result.error.message;
};

describe("inspectId", () => {
  it("reads v1 and v6 (RFC 9562 A.1 and A.5): time to 100 ns, clock sequence, and a node marked random", () => {
    const fields = { variant: "rfc9562", time: "2022-02-22T19:22:22.0000000Z", clockSequence: 0x33c8, node: "9f:6b:de:ce:d8:46", nodeRandom: true };
    expect(info("C232AB00-9414-11EC-B3C8-9F6BDECED846")).toEqual({
      kind: "uuid",
      canonical: "c232ab00-9414-11ec-b3c8-9f6bdeced846",
      version: 1,
      description: "Version 1: Gregorian time, clock sequence and node",
      ...fields,
    });
    expect(info("1EC9414C-232A-6B00-B3C8-9F6BDECED846")).toMatchObject({ version: 6, ...fields });
  });

  it("says when a v1 node has no multicast bit (a MAC address)", () => {
    expect(info("c232ab00-9414-11ec-b3c8-9e6bdeced846")).toMatchObject({ node: "9e:6b:de:ce:d8:46", nodeRandom: false });
  });

  it("reads the time of v7 (RFC 9562 A.6) and names v3, v4 and v5 (A.2, A.3, A.4), which carry none", () => {
    expect(info("017F22E2-79B0-7CC3-98C4-DC0C0C07398F")).toMatchObject({ version: 7, time: "2022-02-22T19:22:22.000Z" });
    expect(info("5df41881-3aed-3515-88a7-2f4a814cf09e")).toEqual({
      kind: "uuid",
      canonical: "5df41881-3aed-3515-88a7-2f4a814cf09e",
      variant: "rfc9562",
      version: 3,
      description: "Version 3: MD5 of a namespace and a name",
    });
    expect(info("919108f7-52d1-4320-9bac-f847db4148a8")).toMatchObject({ version: 4, description: "Version 4: random" });
    expect(info("2ed6657d-e927-568b-95e1-2665a8aea6a2")).toMatchObject({ version: 5, description: "Version 5: SHA-1 of a namespace and a name" });
    expect(info("919108f7-52d1-2320-9bac-f847db4148a8")).toMatchObject({ version: 2, description: "Version 2: DCE Security; its fields are not read here" });
    expect(info("919108f7-52d1-8320-9bac-f847db4148a8")).toMatchObject({ version: 8, description: "Version 8: a custom, vendor-specific layout" });
  });

  it("reads the Nil and Max UUIDs and the other variants", () => {
    expect(info("00000000-0000-0000-0000-000000000000")).toEqual({
      kind: "uuid",
      canonical: "00000000-0000-0000-0000-000000000000",
      special: "nil",
      description: "The Nil UUID: all 128 bits are zero",
    });
    expect(info("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF")).toMatchObject({ special: "max", description: "The Max UUID: all 128 bits are one" });
    expect(info("919108f7-52d1-4320-7bac-f847db4148a8")).toMatchObject({ variant: "ncs" });
    expect(info("919108f7-52d1-4320-cbac-f847db4148a8")).toMatchObject({ variant: "microsoft" });
    expect(info("919108f7-52d1-4320-ebac-f847db4148a8")).toMatchObject({ variant: "future" });
  });

  it("takes every usual spelling with spaces around it", () => {
    for (const text of ["  919108F752D143209BACF847DB4148A8 ", "{919108f7-52d1-4320-9bac-f847db4148a8}", "urn:uuid:919108f7-52d1-4320-9bac-f847db4148a8\n"]) {
      expect(info(text)).toMatchObject({ canonical: "919108f7-52d1-4320-9bac-f847db4148a8", version: 4 });
    }
  });

  it("reads a ULID's time and gives the same 128 bits as a UUID (values from the ulid library's README and Python)", () => {
    expect(info("01aryz6s41tsv4rrffq69g5fav")).toEqual({
      kind: "ulid",
      canonical: "01ARYZ6S41TSV4RRFFQ69G5FAV",
      description: "ULID: Unix time in milliseconds, then 80 random bits",
      time: "2016-07-30T22:36:16.385Z",
      uuid: "01563df3-6481-d676-4c61-efb99302bd5b",
    });
  });

  it("says why it cannot read an ID: its length, a wrong character, an unknown version, a NanoID", () => {
    expect(info("")).toBe("Paste an ID to inspect it");
    expect(info("919108f7-52d1-4320-9bac-f847db4148a")).toBe(
      "Not a UUID or a ULID: 35 characters. A UUID has 32 hexadecimal digits (36 characters with hyphens), a ULID 26 characters",
    );
    expect(info("919108f7-52d1-4320-9bxc-f847db4148a8")).toBe('Not a UUID: "x" at position 22 is not a hexadecimal digit (0-9, a-f)');
    expect(info("{919108f7-52d14-320-9bac-f847db4148a8}")).toBe("Not a UUID: a hyphen belongs at position 15 (after 8, 4, 4 and 4 hexadecimal digits)");
    expect(info("919108f7-52d1-9320-9bac-f847db4148a8")).toBe("Unknown UUID version 9: RFC 9562 defines versions 1 to 8");
    expect(info("919108f7-52d1-0320-9bac-f847db4148a8")).toBe("Unknown UUID version 0: RFC 9562 defines versions 1 to 8");
    expect(info("01ARYZ6S41TSV4RRFFQ69G5FAO")).toBe(
      'Not a ULID: "O" at position 26 is not in Crockford\'s Base32 (no I, L, O or U); did you mean 0?',
    );
    expect(info("8ZZZZZZZZZZZZZZZZZZZZZZZZZ")).toBe("Not a ULID: it is larger than 128 bits (the first character must be 0 to 7)");
    expect(info("V1StGXR8_Z5jdHi6B-myT")).toBe("This looks like a NanoID: its characters are random, with no time or version to read");
  });

  it("quotes a whole character, never half of one, and counts the UUID's own characters", () => {
    // An emoji is two UTF-16 units but one character: the UUID still has 36 characters, and the emoji is at 22.
    expect(info("919108f7-52d1-4320-9b😀c-f847db4148a8")).toBe('Not a UUID: "😀" (U+1F600) at position 22 is not a hexadecimal digit (0-9, a-f)');
    expect(info("01ARYZ6S41TSV4RRFFQ69G5FA😀")).toBe('Not a ULID: "😀" (U+1F600) at position 26 is not in Crockford\'s Base32 (no I, L, O or U)');
    // A character that cannot be seen is named by its code point.
    expect(info("919108f7-52d1-4320-9b​c-f847db4148a8")).toBe('Not a UUID: "​" (U+200B) at position 22 is not a hexadecimal digit (0-9, a-f)');
    // Braces and urn:uuid: are not counted: the UUID inside has 35 characters.
    const short = "Not a UUID or a ULID: 35 characters. A UUID has 32 hexadecimal digits (36 characters with hyphens), a ULID 26 characters";
    expect(info("{919108f7-52d1-4320-9bac-f847db4148a}")).toBe(short);
    expect(info("urn:uuid:919108f7-52d1-4320-9bac-f847db4148a")).toBe(short);
  });
});
