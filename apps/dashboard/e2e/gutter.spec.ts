import { expect, test, type Page } from "@playwright/test";

// No room is kept for a scrollbar the page does not have: a short page's footer and header reach the window's right
// edge, a long page's reach the scrollbar. The content is centred in the window, not beside the scrollbar, so it
// does not move when a scrollbar appears.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

/** [r, g, b] of the pixel at (x, y) of the window. */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, png.toString("base64"));
}

const widths = (page: Page) => page.evaluate(() => ({ client: document.documentElement.clientWidth, window: window.innerWidth }));

for (const scheme of ["light", "dark"] as const) {
  test.describe(`page edges, ${scheme}`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 1280, height: 800 } });

    test("on a short page the footer and the header reach the window's right edge, with no strip", async ({ page }) => {
      await page.goto("no-such-page/");
      const { client, window } = await widths(page);
      expect(client, "a short page has no scrollbar and keeps no room for one").toBe(window);
      for (const selector of ["footer", ".site-header"]) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(box.x + box.width, selector).toBe(window);
      }
      const footer = (await page.locator("footer").boundingBox())!;
      const y = Math.round(footer.y + 30);
      expect(await pixel(page, window - 1, y), "the last column of the window is the footer's").toEqual(await pixel(page, window - 40, y));
    });

    test("on a long page the footer and the scrolled header's border reach the scrollbar", async ({ page }) => {
      await page.goto("about/");
      await page.evaluate(() => window.scrollTo(0, 400));
      await expect(page.locator(".site-header")).toHaveAttribute("data-scrolled", "true");
      const { client, window } = await widths(page);
      expect(client, "a long page has a scrollbar").toBeLessThan(window);
      for (const selector of ["footer", ".site-header"]) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(box.x + box.width, selector).toBe(client);
      }
    });
  });
}

test("the content does not move between a page without a scrollbar and one with it", async ({ page }) => {
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    const seen: string[] = [];
    for (const path of ["no-such-page/", "about/", "./"]) {
      await page.goto(path);
      const boxes = await Promise.all(
        ["main", ".site-header__inner", ".site-footer .container"].map(async (selector) => (await page.locator(selector).first().boundingBox())!.x),
      );
      seen.push(boxes.join(":"));
    }
    expect(new Set(seen).size, `${width} px: ${seen.join(" ")}`).toBe(1);
  }
});
