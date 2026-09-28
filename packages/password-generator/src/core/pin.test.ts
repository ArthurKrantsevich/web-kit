// @vitest-environment node
import { describe, expect, it } from "vitest";
import { countObviousPins, generatePin, isObviousPin, pinBits } from "./pin";
import { seededRandom } from "./seeded";

describe("PINs", () => {
  it("refuses repeated digits, runs up and down, repeated pairs and years 1900–2099", () => {
    for (const pin of ["0000", "7777", "1234", "6789", "9876", "3210", "1212", "90909", "1984", "2025", "0123456789", "121212121212"]) {
      expect([pin, isObviousPin(pin)]).toEqual([pin, true]);
    }
    for (const pin of ["1235", "8901", "1122", "2100", "1899", "4731", "12121213", "01234567890"]) {
      expect([pin, isObviousPin(pin)]).toEqual([pin, false]);
    }
  });

  it("counts the obvious PINs of 4 and 5 digits as trying every PIN does, and gives log2 of the rest", () => {
    for (const length of [4, 5]) {
      let obvious = 0;
      for (let n = 0; n < 10 ** length; n++) if (isObviousPin(String(n).padStart(length, "0"))) obvious++;
      expect([length, countObviousPins(length)]).toEqual([length, obvious]);
      expect(pinBits({ length })).toBeCloseTo(Math.log2(10 ** length - obvious), 10);
    }
    // Counted with Python: 10 repeated digits, 14 runs, 90 other repeated pairs, 198 other years (1919 and 2020 are pairs).
    expect(countObviousPins(4)).toBe(312);
  });

  it("never gives an obvious PIN, and gives only digits of the length asked for", () => {
    const random = seededRandom(31);
    for (let i = 0; i < 20_000; i++) {
      const pin = generatePin({ length: 4 }, random);
      expect(pin.ok && /^\d{4}$/.test(pin.value) && !isObviousPin(pin.value)).toBe(true);
    }
    const long = generatePin({ length: 12 });
    expect(long.ok && /^\d{12}$/.test(long.value)).toBe(true);
    expect(generatePin({ length: 3 })).toEqual({ ok: false, error: { message: "A PIN has 4 to 12 digits" } });
    expect(generatePin({ length: 13 }).ok).toBe(false);
    expect(pinBits({ length: 13 })).toBe(0);
  });
});
