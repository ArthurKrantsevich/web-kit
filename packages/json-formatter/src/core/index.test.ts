import { describe, expect, it } from "vitest";
import * as core from "./index";

describe("@web-kit/json-formatter/core", () => {
  it("re-exports the same six functions from @web-kit/json-core", () => {
    expect(Object.keys(core).sort()).toEqual([
      "codeFrame",
      "formatJson",
      "minifyJson",
      "repairJson",
      "suggestFixes",
      "validateJson",
    ]);
    expect(core.formatJson('{"a":1}')).toEqual({ ok: true, value: '{\n  "a": 1\n}' });
  });
});
