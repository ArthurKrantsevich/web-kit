// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
}

describe("json-formatter styles", () => {
  it("draws code line numbers in --wk-muted at full opacity, which meets 4.5:1 on --wk-surface", () => {
    const numbers = rule(".wk-code__line::before");
    expect(numbers).toMatch(/color:\s*var\(--wk-muted\b/);
    expect(numbers).not.toMatch(/opacity/);
  });
});
