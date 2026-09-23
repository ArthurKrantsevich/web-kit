import { describe, expect, it } from "vitest";
import { compareNumbers, isMultipleOf } from "./numbers";

describe("compareNumbers", () => {
  it.each([
    ["1.0", "1", 0],
    ["1e2", "100", 0],
    ["1.5E-1", "0.15", 0],
    ["-0", "0", 0],
    ["0.000", "0", 0],
    ["12345678901234567890", "12345678901234567889", 1],
    ["-1", "1", -1],
    ["-2", "-10", 1],
    ["0.1", "0.10000000000000001", -1],
    ["99", "100", -1],
    ["1e400", "1e399", 1],
    ["-1e-400", "0", -1],
  ] as const)("compares %s with %s", (a, b, expected) => {
    expect(compareNumbers(a, b)).toBe(expected);
  });

  it("stays exact for exponents beyond Number precision", () => {
    expect(compareNumbers("1e9007199254740993", "1e9007199254740992")).toBe(1);
    expect(compareNumbers("1e99999999999999999999", "1e99999999999999999998")).toBe(1);
    expect(compareNumbers("1e" + "9".repeat(400), "1e" + "9".repeat(399) + "8")).toBe(1);
    expect(compareNumbers("-1e" + "9".repeat(400), "-1e" + "9".repeat(400))).toBe(0);
  });

  it("rejects text that is not a JSON number", () => {
    expect(() => compareNumbers("abc", "1")).toThrow(TypeError);
  });
});

describe("isMultipleOf", () => {
  it.each([
    ["10", "2.5", true],
    ["0.3", "0.1", true],
    ["7", "2", false],
    ["1e3", "1e-2", true],
    ["-9", "3", true],
    ["0.5", "1", false],
    ["0.5", "0.25", true],
    ["0", "7", true],
    ["5", "0", false],
    ["1e1000", "3", false],
    ["3e1000", "3", true],
    ["1e" + "9".repeat(400), "1", true],
    ["1e" + "9".repeat(400), "1e" + "9".repeat(400), true],
    ["1", "1e" + "9".repeat(400), false],
  ] as const)("%s is a multiple of %s: %s", (a, b, expected) => {
    expect(isMultipleOf(a, b)).toBe(expected);
  });
});
