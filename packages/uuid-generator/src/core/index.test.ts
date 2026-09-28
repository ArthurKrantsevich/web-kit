import { describe, expect, it } from "vitest";
import { uuidGenerator } from "./index";

describe("uuidGenerator", () => {
  it("returns an error for empty input", () => {
    expect(uuidGenerator("  ")).toEqual({ ok: false, error: "Input is empty" });
  });

  it("returns a value for input", () => {
    expect(uuidGenerator(" a ")).toEqual({ ok: true, value: "a" });
  });
});
