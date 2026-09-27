import { describe, expect, it } from "vitest";
import { compareTexts } from "./compare";
import { GIT_FIXTURES } from "./git-fixtures";
import { toUnifiedDiff } from "./unified";

// git compares lines with their line breaks, so these run with ignoreLineEndings off; `git diff -w` is ignoreWhitespace.
describe("toUnifiedDiff against the recorded output of git diff --no-index -U3", () => {
  it("has the recorded examples", () => {
    expect(GIT_FIXTURES.length).toBeGreaterThanOrEqual(20);
  });

  for (const fixture of GIT_FIXTURES) {
    it(fixture.name, () => {
      const options = { ignoreLineEndings: false, ignoreWhitespace: fixture.ignoreWhitespace };
      const diff = compareTexts(fixture.left, fixture.right, options);
      expect(toUnifiedDiff(fixture.left, fixture.right, diff)).toBe(fixture.patch);
    });
  }
});
