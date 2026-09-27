import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const css = (tool: string) => readFileSync(require.resolve(`@web-kit/${tool}/styles.css`), "utf8");

// Every tool's styles.css starts with the @web-kit/ui styles. A page that shows two tools loads both files, so the ui
// rules come again after the first tool's own rules; those own rules must still win.
for (const other of ["json-diff", "json-convert", "json-schema-validator"]) {
  test(`the formatter keeps its own layout when the ${other} styles load after it`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("tools/json-formatter/");
    const modes = page.locator(".wk-json__modes");
    await expect(modes).toHaveCSS("display", "grid");
    await page.addStyleTag({ content: css(other) });
    await expect(modes).toHaveCSS("display", "grid");
    await expect(modes).toHaveCSS("grid-template-columns", /^(\S+ ){3}\S+$/);
  });
}

// The page's element defaults (`:focus-visible`, `a`, …) sit in a sublayer of wk-ui, under the ui rules.
test("the page's focus ring does not replace the ui's inset ring or the open list's", async ({ page }) => {
  await page.goto("tools/json-convert/");
  const input = page.getByLabel("Input", { exact: true });
  await input.focus();
  await expect(input).toHaveCSS("outline-offset", "-2px");
  await page.getByRole("button", { name: "Convert to" }).focus();
  await page.keyboard.press("ArrowDown");
  const list = page.getByRole("listbox", { name: "Convert to" });
  await expect(list).toBeFocused();
  await expect(list).toHaveCSS("outline-style", "none");
});
