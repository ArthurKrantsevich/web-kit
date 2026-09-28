// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateIds, MAX_COUNT, ulid, uuidV7 } from "./generate";
import { createIdGenerators } from "./generators";
import { seededRandom } from "./seeded";

const RFC = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("generateIds", () => {
  it("makes `count` IDs of every kind", () => {
    const generators = createIdGenerators({ random: seededRandom(9) });
    const made = (kind: Parameters<typeof generateIds>[0]["kind"], count = 3): string[] => {
      const result = generateIds({ kind, count }, generators);
      return result.ok ? result.value : [result.error.message];
    };
    for (const [kind, version] of [["v1", "1"], ["v4", "4"], ["v6", "6"], ["v7", "7"]] as const) {
      expect(made(kind).map((id) => RFC.exec(id)?.[1])).toEqual([version, version, version]);
    }
    expect(made("nil", 2)).toEqual(["00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000"]);
    expect(made("max", 1)).toEqual(["ffffffff-ffff-ffff-ffff-ffffffffffff"]);
    expect(made("ulid").every((id) => /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id))).toBe(true);
    expect(made("nanoid", MAX_COUNT).length).toBe(1000);
  });

  // www.example.com is RFC 9562's example A.4; example.org was computed with Python 3.12's uuid.uuid5.
  it("makes one v3 or v5 ID per name, in order, in the chosen namespace", () => {
    expect(generateIds({ kind: "v5", names: ["www.example.com", "example.org"], namespace: "dns" })).toEqual({
      ok: true,
      value: ["2ed6657d-e927-568b-95e1-2665a8aea6a2", "aad03681-8b63-5304-89e0-8ca8f49461b5"],
    });
    expect(generateIds({ kind: "v3", names: ["www.example.com"] })).toEqual({ ok: true, value: ["5df41881-3aed-3515-88a7-2f4a814cf09e"] });
    expect(generateIds({ kind: "v5", names: [] })).toEqual({ ok: true, value: [] });
  });

  it("refuses a count, a namespace, a name list or NanoID options it cannot use", () => {
    const message = (options: Parameters<typeof generateIds>[0]) => {
      const result = generateIds(options);
      return result.ok ? "ok" : result.error.message;
    };
    expect(message({ kind: "v4", count: 0 })).toBe("The count must be a whole number from 1 to 1000");
    expect(message({ kind: "v4", count: 1001 })).toBe("The count must be a whole number from 1 to 1000");
    expect(message({ kind: "v7", count: 2.5 })).toBe("The count must be a whole number from 1 to 1000");
    expect(message({ kind: "v5", names: ["a"], namespace: "not-a-uuid" })).toBe('The namespace "not-a-uuid" is not a UUID');
    expect(message({ kind: "v3", names: Array(1001).fill("a") })).toBe("At most 1000 names at a time");
    expect(message({ kind: "nanoid", alphabet: "aa" })).toBe('The alphabet has "a" more than once');
  });

  it("keeps v7 and ULID values increasing across calls of the shared generators", () => {
    const first = generateIds({ kind: "v7", count: 500 });
    const second = generateIds({ kind: "v7", count: 500 });
    const ids = [...(first.ok ? first.value : []), ...(second.ok ? second.value : []), uuidV7()];
    expect(ids.filter((id, i) => i > 0 && id <= ids[i - 1]!)).toEqual([]);
    const ulids = [ulid(), ulid(), ulid()];
    expect([...ulids].sort()).toEqual(ulids);
  });
});
