import { expect, test } from "@playwright/test";
import { tools, upcoming } from "../src/registry";

test.describe("footer", () => {
  test("links every ready tool and the project, and counts the planned ones", async ({ page }) => {
    await page.goto("about/");
    const footer = page.getByRole("contentinfo");
    for (const tool of tools) {
      await expect(footer.getByRole("link", { name: tool.title, exact: true })).toHaveAttribute("href", `/web-kit/tools/${tool.id}/`);
    }
    for (const [name, href] of [
      ["About", "/web-kit/about/"],
      ["GitHub", "https://github.com/ArthurKrantsevich/web-kit"],
      ["flutter-kit", "https://arthurkrantsevich.github.io/flutter-kit/"],
      ["License MIT", "https://github.com/ArthurKrantsevich/web-kit/blob/main/LICENSE"],
      ["Source code", "https://github.com/ArthurKrantsevich/web-kit"],
    ]) {
      await expect(footer.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
    await expect(footer).toContainText(`${upcoming.length} more utilities`);
    await expect(footer).toContainText("© 2026 · MIT");
  });

  test("puts its columns under each other on a phone, without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./");
    const lefts = await page.locator(".site-footer__columns > div").evaluateAll((columns) =>
      columns.map((column) => Math.round(column.getBoundingClientRect().left)),
    );
    expect(new Set(lefts).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
