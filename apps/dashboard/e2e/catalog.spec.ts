import { expect, test, type Page } from "@playwright/test";
import { CATEGORY_LABELS, tools, upcoming } from "../src/registry";

const search = (page: Page) => page.getByRole("searchbox", { name: "Search utilities" });
const soonCards = (page: Page) => page.locator(".card--soon");

test.describe("home: empty states and planned tools", () => {
  test("a search without results says so, and Clear search brings every card back with focus in the field", async ({ page }) => {
    await page.goto("./");
    const cards = page.locator(".grid > li");
    const all = await cards.count();
    expect(all).toBe(tools.length + upcoming.length);
    await search(page).fill("zzz");
    const empty = page.locator(".wk-ui-empty");
    await expect(empty).toContainText("Nothing matches “zzz”");
    await expect(empty).toContainText("Try a shorter word, or browse every tool.");
    // A screen reader hears it too, from a polite live region.
    const status = page.locator('#tools [role="status"]');
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveText("Nothing matches “zzz”. Try a shorter word, or browse every tool.");
    await expect(cards).toHaveCount(0);
    await empty.getByRole("button", { name: "Clear search" }).click();
    await expect(search(page)).toHaveValue("");
    await expect(search(page)).toBeFocused();
    await expect(cards).toHaveCount(all);
    await expect(empty).toHaveCount(0);
    await search(page).fill("json");
    await expect(status).toHaveText(`${tools.length} tools ready, 0 planned`);
  });

  test("a category without ready tools says so and keeps its planned cards", async ({ page }) => {
    await page.goto("./");
    const planned = upcoming.filter((tool) => tool.category === "generators");
    await page.getByRole("group", { name: "Category" }).getByRole("button", { name: CATEGORY_LABELS.generators }).click();
    const empty = page.locator(".wk-ui-empty");
    await expect(empty).toContainText("No Generators tools yet");
    await expect(empty).toContainText(`${planned.length} are planned — see them below.`);
    await expect(soonCards(page)).toHaveCount(planned.length);
    for (const tool of planned) await expect(soonCards(page).filter({ hasText: tool.title })).toHaveCount(1);
    await expect(page.locator(".grid a.card")).toHaveCount(0);
  });

  test("planned tools are listed after the ready ones, found by search, and are not links", async ({ page }) => {
    await page.goto("./");
    const titles = await page.locator(".grid h2").allTextContents();
    expect(titles).toEqual([...tools.map((tool) => tool.title), ...upcoming.map((tool) => tool.title)]);
    await search(page).fill("jwt");
    await expect(page.locator(".grid > li")).toHaveCount(1);
    const card = soonCards(page);
    await expect(card).toContainText("JWT Decoder");
    await expect(card).toContainText("Soon");
    await expect(card).toContainText("Data");
    await expect(page.getByRole("link", { name: /JWT Decoder/ })).toHaveCount(0);
    await expect(page.locator(".wk-ui-empty")).toHaveCount(0);
  });

  for (const width of [1280, 1024, 390]) {
    test(`at ${width} px every planned card shows its own preview and "Soon" on the category line, never under the title`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("./");
      const cards = await soonCards(page).evaluateAll((elements) =>
        elements.map((card) => {
          const box = (selector: string) => card.querySelector(selector)!.getBoundingClientRect();
          const [title, category, soon] = [box("h2"), box(".card__category"), box(".soon")];
          const titleLine = parseFloat(getComputedStyle(card.querySelector("h2")!).lineHeight);
          return {
            preview: card.querySelector(".card__preview")!.textContent,
            soonOnCategoryLine: soon.top >= category.top - 4 && soon.bottom <= category.bottom + 4,
            soonBelowTitle: soon.top >= title.bottom,
            titleLines: Math.round(title.height / titleLine),
          };
        }),
      );
      expect(cards.map((card) => card.preview)).toEqual(upcoming.map((tool) => tool.preview));
      for (const card of cards) expect([card.preview, card.soonOnCategoryLine, card.soonBelowTitle]).toEqual([card.preview, true, true]);
    });
  }
});
