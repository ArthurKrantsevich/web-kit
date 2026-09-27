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
    await expect(cards).toHaveCount(0);
    await empty.getByRole("button", { name: "Clear search" }).click();
    await expect(search(page)).toHaveValue("");
    await expect(search(page)).toBeFocused();
    await expect(cards).toHaveCount(all);
    await expect(empty).toHaveCount(0);
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
});
