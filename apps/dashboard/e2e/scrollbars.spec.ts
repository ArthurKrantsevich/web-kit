import { expect, test } from "@playwright/test";

// Headless Chromium hides scrollbars by default, which would hide the jump this file checks.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("the content has the same width on the home page, About and every tab of a tool page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const box = async () => {
    const { x, width } = (await page.locator("main").boundingBox())!;
    return `${x}:${width}`;
  };
  const seen: string[] = [];
  await page.goto("./");
  seen.push(await box());
  await page.goto("about/");
  seen.push(await box());
  await page.goto("tools/json-formatter/");
  for (const tab of ["Demo", "Install & Usage", "API"]) {
    await page.getByRole("tab", { name: tab }).click();
    seen.push(await box());
  }
  expect(new Set(seen).size, seen.join(" ")).toBe(1);
});

test.describe("scrollbars", () => {
  for (const [scheme, thumb] of [
    ["light", "rgb(194, 192, 182)"],
    ["dark", "rgb(77, 76, 72)"],
  ] as const) {
    test(`the page and the tools use the thin ${scheme} scrollbar`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("tools/json-formatter/");
      const styles = await page.evaluate(() =>
        [document.documentElement, document.querySelector(".wk-ui-area")!, document.querySelector(".wk-json__body")!].map((element) => {
          const style = getComputedStyle(element);
          return [style.scrollbarWidth, style.scrollbarColor];
        }),
      );
      expect(styles).toEqual(Array(3).fill(["thin", `${thumb} rgba(0, 0, 0, 0)`]));
    });
  }
});
