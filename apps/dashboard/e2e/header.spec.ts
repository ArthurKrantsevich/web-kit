import { expect, test } from "@playwright/test";

test.describe("sticky header", () => {
  // A phone: the home page scrolls more than 1000 px there, whatever the number of tools.
  test("stays at the top after scrolling 1000 px and shows its border only then", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./");
    const header = page.locator(".site-header");
    await expect(header).toHaveCSS("border-bottom-color", "rgba(0, 0, 0, 0)");
    await page.mouse.wheel(0, 1000);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(1000);
    await expect(header).toHaveAttribute("data-scrolled", "true");
    expect((await header.boundingBox())!.y).toBe(0);
    await expect(header).not.toHaveCSS("border-bottom-color", "rgba(0, 0, 0, 0)");
    await expect(page.getByRole("button", { name: "Menu" })).toBeInViewport();
  });

  test("does not cover the element that Tab or Shift+Tab focuses", async ({ page }) => {
    // On a phone the tool cards are stacked, one link under the other.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./");
    const header = (await page.locator(".site-header").boundingBox())!.height;
    const links = page.locator(".grid a.card");
    for (const [from, key] of [
      [0, "Tab"],
      [2, "Shift+Tab"],
    ] as const) {
      // The second card sits 20 px from the top of the window, under the header; focus comes from its neighbour.
      await links.nth(1).evaluate((link) => window.scrollBy(0, link.getBoundingClientRect().top - 20));
      await links.nth(from).evaluate((link: HTMLElement) => link.focus({ preventScroll: true }));
      await page.keyboard.press(key);
      await expect(links.nth(1)).toBeFocused();
      const top = await links.nth(1).evaluate((link) => link.getBoundingClientRect().top);
      expect([key, top >= header]).toEqual([key, true]);
    }
  });

  test("the phone menu opens under it and stays with it while the page scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./");
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.getByRole("button", { name: "Menu" }).click();
    const links = page.locator("#site-links");
    await expect(links).toBeVisible();
    const header = (await page.locator(".site-header").boundingBox())!;
    const box = (await links.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(box.y).toBeLessThan(header.y + header.height + 2);
  });
});
