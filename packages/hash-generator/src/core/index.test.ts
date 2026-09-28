import { describe, expect, it } from "vitest";
import { hashGenerator } from "./index";

describe("hashGenerator", () => {
  it("returns an error for empty input", () => {
    expect(hashGenerator("  ")).toEqual({ ok: false, error: "Input is empty" });
  });

  it("returns a value for input", () => {
    expect(hashGenerator(" a ")).toEqual({ ok: true, value: "a" });
  });
});
