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
