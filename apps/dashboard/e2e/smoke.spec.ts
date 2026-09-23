import { expect, test } from "@playwright/test";
import { tools } from "../src/registry";

test("home lists utilities and filters them", async ({ page }) => {
  await page.goto("./");
  const search = page.getByRole("searchbox", { name: "Search utilities" });
  await expect(page.getByRole("link", { name: /JSON Formatter/ })).toBeVisible();

  await search.fill("zzz-no-match");
  await expect(page.getByText("No utilities match your search.")).toBeVisible();

  await search.fill("json");
  await page.getByRole("link", { name: /JSON Formatter/ }).click();
  await expect(page).toHaveURL(/\/web-kit\/tools\/json-formatter\/$/);
});

for (const tool of tools) {
  test(`${tool.id}: page opens by direct link`, async ({ page }) => {
    const response = await page.goto(`tools/${tool.id}/`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: tool.title })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Demo" })).toHaveAttribute("aria-selected", "true");
  });
}

test("json-formatter works inside the dashboard", async ({ page }) => {
  await page.goto("tools/json-formatter/");
  const input = page.getByLabel("Input", { exact: true });

  await input.fill('{"a": }');
  await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText("Line 1, column 7: Unexpected character '}'");

  await expect(page.getByLabel("Error location")).toContainText("^");

  await input.fill("{a: 1, b: [True,]}");
  await page.getByRole("button", { name: "Fix all (4 changes)" }).click();
  await expect(input).toHaveValue('{"a": 1, "b": [true]}');

  await input.fill('{"a":1}');
  await expect(page.getByLabel("Output", { exact: true })).toHaveValue('{\n  "a": 1\n}');

  await page.getByRole("tab", { name: "Install & Usage" }).click();
  await expect(page.getByText("npm i @web-kit/json-formatter")).toBeVisible();

  await page.getByRole("tab", { name: "API" }).click();
  await expect(page.getByRole("cell", { name: "formatJson", exact: true })).toBeVisible();
});

test("unknown path shows the 404 page", async ({ page }) => {
  const response = await page.goto("tools/does-not-exist/");
  expect(response?.status()).toBe(404);
});

test("tabs switch with the keyboard", async ({ page }) => {
  await page.goto("tools/json-formatter/");
  const demo = page.getByRole("tab", { name: "Demo" });
  const usage = page.getByRole("tab", { name: "Install & Usage" });
  const api = page.getByRole("tab", { name: "API" });

  await demo.focus();
  await page.keyboard.press("ArrowRight");
  await expect(usage).toBeFocused();
  await expect(usage).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("End");
  await expect(api).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(demo).toBeFocused();

  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await expect(demo).toHaveAttribute("aria-selected", "true");
  await expect(demo).toHaveAttribute("tabindex", "0");
  await expect(api).toHaveAttribute("tabindex", "-1");
});
