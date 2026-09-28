import { describe, expect, it } from "vitest";
import { passwordGenerator } from "./index";

describe("passwordGenerator", () => {
  it("returns an error for empty input", () => {
    expect(passwordGenerator("  ")).toEqual({ ok: false, error: "Input is empty" });
  });

  it("returns a value for input", () => {
    expect(passwordGenerator(" a ")).toEqual({ ok: true, value: "a" });
  });
});
