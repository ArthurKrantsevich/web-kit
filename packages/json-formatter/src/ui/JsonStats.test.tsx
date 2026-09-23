import { getStats, parseJson } from "@web-kit/json-core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatBytes, formatStats, JsonStats } from "./JsonStats";

afterEach(cleanup);

describe("JsonStats", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("describes the data in one line", () => {
    const input = '{"a":[1,2,3],"b":{"c":null,"d":"é"}}';
    const result = parseJson(input);
    if (!result.ok) throw new Error("invalid");
    const stats = getStats(result.value, input);
    expect(formatStats(stats)).toBe(
      "37 B · 4 keys · depth 2 · 2 objects · 1 array · 1 string · 3 numbers · 0 booleans · 1 null value · longest array 3",
    );
    const { container } = render(<JsonStats stats={stats} />);
    expect(container.textContent).toBe(formatStats(stats));
  });
});
