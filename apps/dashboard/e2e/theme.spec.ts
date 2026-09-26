import { expect, test } from "@playwright/test";

const DARK_BG = "rgb(26, 25, 24)";
const LIGHT_BG = "rgb(250, 249, 245)";

test("theme toggle switches to dark and survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: "Toggle theme" });

  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_BG);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_BG);
});

test("system dark applies without a stored choice; choosing light survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./");
  const toggle = page.getByRole("button", { name: "Toggle theme" });

  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_BG);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await toggle.click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_BG);
});

test("an unknown stored value is ignored", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("wk-theme", "blue"));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_BG);
});

test("the toggle works when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("phone menu opens, closes with Escape and after navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const menu = page.getByRole("button", { name: "Menu" });
  const about = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "About" });

  await expect(about).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(about).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await about.click();
  await expect(page).toHaveURL(/\/web-kit\/about\/$/);
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(about).toBeHidden();
});

test("footer carries the privacy line", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("contentinfo")).toContainText("Your data never leaves your device.");
});
