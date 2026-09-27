import { describe, expect, it } from "vitest";
import { textCompare } from "./index";

describe("textCompare", () => {
  it("returns an error for empty input", () => {
    expect(textCompare("  ")).toEqual({ ok: false, error: "Input is empty" });
  });

  it("returns a value for input", () => {
    expect(textCompare(" a ")).toEqual({ ok: true, value: "a" });
  });
});
