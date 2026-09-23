import { describe, expect, it } from "vitest";
import * as pkg from "./index";

describe("@web-kit/json-formatter", () => {
  it("exports what the standalone tree and stats need", () => {
    for (const name of ["parseJson", "getStats", "printJson", "escapeJson", "unescapeJson", "JsonTree", "HighlightedJson", "JsonStats", "JsonFormatter"] as const) {
      expect(typeof pkg[name]).toBe("function");
    }
  });
});
