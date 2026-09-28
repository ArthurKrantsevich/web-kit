// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodeCrockford, encodeCrockford } from "./crockford";
import { createIdGenerators } from "./generators";
import { URL_ALPHABET } from "./nanoid";
import { chiSquare, cyclingRandom, scriptedRandom, seededRandom } from "./seeded";

const RFC = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** RFC 9562 Appendix A: Tuesday, February 22, 2022 2:22:22 PM GMT-05:00. */
const RFC_MS = 1645557742000;

describe("uuid v7", () => {
  it("gives RFC 9562's example A.6 from its time, rand_a and rand_b", () => {
    // Ten random bytes per value: two for the counter (its low 12 bits are rand_a), eight for rand_b.
    const random = scriptedRandom([0x0c, 0xc3, 0x18, 0xc4, 0xdc, 0x0c, 0x0c, 0x07, 0x39, 0x8f]);
    expect(createIdGenerators({ random }).uuidV7(RFC_MS)).toBe("017f22e2-79b0-7cc3-98c4-dc0c0c07398f");
  });

  it("strictly increases within one millisecond and across a counter overflow, from a random start", () => {
    const { uuidV7 } = createIdGenerators({ random: seededRandom(3), now: () => RFC_MS });
    const ids = Array.from({ length: 10_000 }, () => uuidV7());
    expect(ids.filter((id) => RFC.exec(id)?.[1] !== "7")).toEqual([]);
    expect(ids.filter((id, i) => i > 0 && id <= ids[i - 1]!)).toEqual([]);
    // 10,000 values need more than one 4,096-value counter: the later ones borrow the next milliseconds.
    expect(ids.at(-1)!.slice(0, 13)).not.toBe(ids[0]!.slice(0, 13));
  });

  it("moves to the next millisecond when the counter is full, and starts it at a new random value", () => {
    const random = scriptedRandom([0x0f, 0xff, ...Array(8).fill(0), 0x01, 0x23, ...Array(8).fill(0)]);
    const { uuidV7 } = createIdGenerators({ random });
    expect(uuidV7(RFC_MS)).toBe("017f22e2-79b0-7fff-8000-000000000000");
    expect(uuidV7(RFC_MS)).toBe("017f22e2-79b1-7123-8000-000000000000");
  });

  it("keeps increasing when the clock goes back", () => {
    const { uuidV7 } = createIdGenerators({ random: seededRandom(4) });
    const first = uuidV7(RFC_MS);
    const second = uuidV7(RFC_MS - 60_000);
    expect(second > first).toBe(true);
    expect(second.slice(0, 13)).toBe(first.slice(0, 13));
  });
});

describe("uuid v1 and v6", () => {
  // Appendix A: clock sequence 0x33C8 and node 9F6BDECED846 (its multicast bit already set).
  const random = () => scriptedRandom([0x33, 0xc8, 0x9f, 0x6b, 0xde, 0xce, 0xd8, 0x46]);

  it("gives RFC 9562's examples A.1 and A.5 from the same time, clock sequence and node", () => {
    expect(createIdGenerators({ random: random() }).uuidV1(RFC_MS)).toBe("c232ab00-9414-11ec-b3c8-9f6bdeced846");
    expect(createIdGenerators({ random: random() }).uuidV6(RFC_MS)).toBe("1ec9414c-232a-6b00-b3c8-9f6bdeced846");
  });

  it("sets the multicast bit of the random node, never uses a MAC address, and keeps the node and clock sequence", () => {
    const { uuidV1, uuidV6 } = createIdGenerators({ random: scriptedRandom([0x12, 0x34, 0x02, 1, 2, 3, 4, 5]) });
    const [one, six] = [uuidV1(RFC_MS), uuidV6(RFC_MS)];
    expect(one.slice(19)).toBe("9234-030102030405");
    expect(six.slice(19)).toBe(one.slice(19));
  });

  it("have version 1 and 6 and strictly increasing times in 10,000 values made in one millisecond", () => {
    const { uuidV1, uuidV6 } = createIdGenerators({ random: seededRandom(5), now: () => RFC_MS });
    const ones = Array.from({ length: 10_000 }, () => uuidV1());
    const sixes = Array.from({ length: 10_000 }, () => uuidV6());
    expect(ones.filter((id) => RFC.exec(id)?.[1] !== "1")).toEqual([]);
    expect(sixes.filter((id) => RFC.exec(id)?.[1] !== "6")).toEqual([]);
    // v6 sorts by time as text; v1 keeps its time in time_hi, time_mid, time_low order.
    const v1Time = (id: string) => BigInt(`0x${id.slice(15, 18)}${id.slice(9, 13)}${id.slice(0, 8)}`);
    expect(ones.filter((id, i) => i > 0 && v1Time(id) <= v1Time(ones[i - 1]!))).toEqual([]);
    expect(sixes.filter((id, i) => i > 0 && id <= sixes[i - 1]!)).toEqual([]);
  });
});

describe("ULID", () => {
  // The ULID spec's example: 01BX5ZZKBK is its time, ACTAV9WEVGEMMVRZ its random part.
  const time = Number(decodeCrockford("01BX5ZZKBK"));
  const bytes = (value: bigint) => Array.from({ length: 10 }, (_, i) => Number((value >> BigInt(72 - i * 8)) & 0xffn));

  it("encodes time as the ulid library does: encodeTime(1469918176385) is 01ARYZ6S41", () => {
    expect(encodeCrockford(1469918176385n, 10)).toBe("01ARYZ6S41");
  });

  it("counts the random part up by one within a millisecond, as the spec's monotonic example shows", () => {
    const { ulid } = createIdGenerators({ random: scriptedRandom(bytes(decodeCrockford("ACTAV9WEVGEMMVRZ"))) });
    expect([ulid(time), ulid(time)]).toEqual(["01BX5ZZKBKACTAV9WEVGEMMVRZ", "01BX5ZZKBKACTAV9WEVGEMMVS0"]);
  });

  it("moves to the next millisecond when the random part cannot count up (the library throws there)", () => {
    const { ulid } = createIdGenerators({ random: scriptedRandom([...bytes(decodeCrockford("ZZZZZZZZZZZZZZZY")), ...Array(10).fill(0)]) });
    expect([ulid(time), ulid(time), ulid(time)]).toEqual([
      "01BX5ZZKBKZZZZZZZZZZZZZZZY",
      "01BX5ZZKBKZZZZZZZZZZZZZZZZ",
      "01BX5ZZKBM0000000000000000",
    ]);
  });

  it("is 26 characters of Crockford's Base32 and sorts in the order it was made", () => {
    const { ulid } = createIdGenerators({ random: seededRandom(6), now: () => time });
    const ids = Array.from({ length: 5000 }, () => ulid());
    expect(ids.filter((id) => !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id))).toEqual([]);
    expect(ids.filter((id, i) => i > 0 && id <= ids[i - 1]!)).toEqual([]);
  });
});

describe("NanoID", () => {
  it("has 21 URL-safe characters by default, and the size and alphabet it is given", () => {
    const { nanoid } = createIdGenerators();
    const id = nanoid();
    expect(id.ok && id.value.length === 21 && [...id.value].every((char) => URL_ALPHABET.includes(char))).toBe(true);
    const digits = nanoid({ size: 255, alphabet: "0123456789" });
    expect(digits.ok && /^\d{255}$/.test(digits.value)).toBe(true);
    const emoji = nanoid({ size: 8, alphabet: "🙂🙃" });
    expect(emoji.ok && Array.from(emoji.value).length === 8).toBe(true);
  });

  it("refuses a size or an alphabet it cannot use", () => {
    const { nanoid } = createIdGenerators();
    expect(nanoid({ size: 1 })).toEqual({ ok: false, error: { message: "The size must be a whole number from 2 to 255" } });
    expect(nanoid({ size: 256 }).ok).toBe(false);
    expect(nanoid({ alphabet: "abca" })).toEqual({ ok: false, error: { message: 'The alphabet has "a" more than once' } });
    expect(nanoid({ alphabet: "a" })).toEqual({ ok: false, error: { message: "The alphabet needs 2 to 256 different characters; it has 1" } });
  });

  it("has no bias: fed every byte value equally often, it uses every character equally often", () => {
    // 10 characters: bytes are masked to 0–15 and 10–15 are thrown away, never wrapped onto the first characters.
    const { nanoid } = createIdGenerators({ random: cyclingRandom() });
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const id = nanoid({ size: 80, alphabet: "0123456789" });
      for (const char of id.ok ? id.value : "") counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(new Set(counts.values()).size).toBe(1);
  });

  // Seconds on a CI runner that is 2–3 times slower than a laptop, under a full parallel `pnpm verify`: its own timeout.
  it("passes a χ² test for 36 characters over 360,000 of them (critical value 58.62 for p = 0.01, 35 degrees of freedom)", { timeout: 20_000 }, () => {
    const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
    const { nanoid } = createIdGenerators({ random: seededRandom(8) });
    const counts = new Array<number>(alphabet.length).fill(0);
    for (let i = 0; i < 1800; i++) {
      const id = nanoid({ size: 200, alphabet });
      for (const char of id.ok ? id.value : "") counts[alphabet.indexOf(char)]! += 1;
    }
    expect(chiSquare(counts)).toBeLessThan(58.62);
  });
});

it("gives the same IDs for the same random source and clock: nothing else is random", () => {
  const make = () => createIdGenerators({ random: seededRandom(7), now: () => RFC_MS });
  const [a, b] = [make(), make()];
  expect([a.uuidV4(), a.uuidV7(), a.uuidV1(), a.ulid(), a.nanoid()]).toEqual([b.uuidV4(), b.uuidV7(), b.uuidV1(), b.ulid(), b.nanoid()]);
});
