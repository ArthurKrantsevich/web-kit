import { expect, test } from "@playwright/test";

for (const path of ["./", "tools/json-formatter/", "tools/json-convert/"]) {
  test(`no horizontal scroll at 390 px: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });
}

test("no horizontal scroll at 390 px: API tab", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("tools/json-formatter/");
  await page.getByRole("tab", { name: "API" }).click();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
