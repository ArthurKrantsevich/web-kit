import { expect, test } from "@playwright/test";
import { tools, upcoming } from "../src/registry";

test.describe("footer", () => {
  const links = [
    ["About", "/web-kit/about/"],
    ["GitHub", "https://github.com/ArthurKrantsevich/web-kit"],
    ["flutter-kit", "https://arthurkrantsevich.github.io/flutter-kit/"],
    ["MIT license", "https://github.com/ArthurKrantsevich/web-kit/blob/main/LICENSE"],
  ];

  test("is one compact row on a desktop: the mark, the privacy line, the project's links and the year", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("about/");
    const footer = page.getByRole("contentinfo");
    const box = (await footer.boundingBox())!;
    expect(box.height, "72 to 88 px").toBeGreaterThanOrEqual(72);
    expect(box.height).toBeLessThanOrEqual(88);
    await expect(footer.getByRole("link", { name: "web-kit" })).toHaveAttribute("href", "/web-kit/");
    await expect(footer).toContainText("Everything runs in your browser. Your data never leaves your device.");
    await expect(footer.getByRole("navigation", { name: "Footer" }).getByRole("link")).toHaveText(links.map(([name]) => name));
    for (const [name, href] of links) await expect(footer.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    await expect(footer).toContainText("© 2026");
    // The header links to the tools; the footer no longer lists them.
    await expect(footer.getByRole("heading")).toHaveCount(0);
    await expect(footer.getByRole("link", { name: tools[0]!.title })).toHaveCount(0);
    const tops = await footer.locator(".logo, p, nav").evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return Math.round(rect.top + rect.height / 2);
    }));
    expect(Math.max(...tops) - Math.min(...tops), "everything on one row").toBeLessThanOrEqual(2);
  });

  test("stacks into a few short lines on a phone, without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./");
    const footer = (await page.getByRole("contentinfo").boundingBox())!;
    expect(footer.height).toBeLessThanOrEqual(180);
    const lefts = await page.locator(".site-footer .logo, .site-footer p, .site-footer nav").evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().left)),
    );
    expect(new Set(lefts).size, "left-aligned").toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe("About", () => {
  test("has a heading, four principles, the tools, and links to GitHub and flutter-kit", async ({ page }) => {
    await page.goto("about/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Small tools you can trust with your data.");
    await expect(page.locator(".about__principle h3")).toHaveText([
      "Your data stays on your device",
      "Numbers stay exact",
      "Only checked fixes",
      "Logic without UI",
    ]);
    const main = page.getByRole("main");
    for (const tool of tools) await expect(main.getByRole("link", { name: new RegExp(`^${tool.title}`) })).toHaveAttribute("href", `/web-kit/tools/${tool.id}/`);
    await expect(main).toContainText(`${upcoming.length} more are planned`);
    await expect(main.getByRole("link", { name: /^Source code/ })).toHaveAttribute("href", "https://github.com/ArthurKrantsevich/web-kit");
    await expect(main.getByRole("link", { name: /^Also in Flutter/ })).toHaveAttribute("href", "https://arthurkrantsevich.github.io/flutter-kit/");
  });

  test("keeps its text within 720 px and uses one column on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("about/");
    expect((await page.locator(".about__lead").boundingBox())!.width).toBeLessThanOrEqual(720);
    await page.setViewportSize({ width: 390, height: 844 });
    const lefts = await page.locator(".about__principle").evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(1);
  });
});

test("links styled as buttons or cards are never underlined, at rest or on hover", async ({ page }) => {
  for (const path of ["no-such-page/", "about/", "./"]) {
    await page.goto(path);
    const links = page.locator("a.wk-ui-button, main a.card, main a[class*='about__']");
    const count = await links.count();
    expect(count, path).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const link = links.nth(index);
      const decoration = () => link.evaluate((element) => `${element.textContent?.trim()}: ${getComputedStyle(element).textDecorationLine}`);
      const name = (await link.textContent())?.trim();
      expect(await decoration(), path).toBe(`${name}: none`);
      await link.hover();
      expect(await decoration(), `${path} on hover`).toBe(`${name}: none`);
    }
  }
});
