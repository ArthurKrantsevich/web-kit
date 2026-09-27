import { expect, test, type Page } from "@playwright/test";
import { tools, upcoming } from "../src/registry";

/**
 * Opens a tool page and waits for hydration (Paste appears only then). Typing or clicking before it races React:
 * with the heavier 4b pages the full suite lost a fill about one run in three.
 */
async function openTool(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
}

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
  await openTool(page, "tools/json-formatter/");
  const input = page.getByLabel("Input", { exact: true });

  await input.fill('{"a": }');
  await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText("Line 1, column 7: Unexpected character '}'");

  await expect(page.getByLabel("Error location")).toContainText("^");

  await input.fill("{a: 1, b: [True,]}");
  await page.getByRole("button", { name: "Fix all (4 changes)" }).click();
  await expect(input).toHaveValue('{"a": 1, "b": [true]}');

  await input.fill('{"a":1}');
  await expect.poll(() => page.getByLabel("Output", { exact: true }).textContent()).toBe('{\n  "a": 1\n}');

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
  await openTool(page, "tools/json-formatter/");
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

  await page.keyboard.press("Alt+ArrowRight");
  await expect(demo).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await expect(demo).toHaveAttribute("aria-selected", "true");
  await expect(demo).toHaveAttribute("tabindex", "0");
  await expect(api).toHaveAttribute("tabindex", "-1");
});

test("tree view shows the path of a node and stats", async ({ page }) => {
  await openTool(page, "tools/json-formatter/");
  await page.getByRole("button", { name: "Tree" }).click();
  await page.getByRole("treeitem", { name: /hello/ }).click();
  await expect(page.getByLabel("Selected path")).toHaveText("$.hello");
  await expect(page.getByText(/· 3 numbers ·/)).toBeVisible();
});

test("sort keys and unescape in the formatter", async ({ page }) => {
  await openTool(page, "tools/json-formatter/");
  const input = page.getByLabel("Input", { exact: true });
  const output = page.getByLabel("Output", { exact: true });
  await input.fill('{"b":1,"a":2}');
  await page.getByLabel("Sort keys").check();
  await expect.poll(() => output.textContent()).toBe('{\n  "a": 2,\n  "b": 1\n}');
  await page.getByRole("button", { name: "Unescape" }).click();
  await input.fill('"{\\"x\\":true}"');
  await expect.poll(() => output.textContent()).toBe('{\n  "x": true\n}');
});

test("json-convert turns JSON into TypeScript", async ({ page }) => {
  await openTool(page, "tools/json-convert/");
  await page.getByRole("button", { name: "Convert to" }).click();
  await page.getByRole("option", { name: "TypeScript" }).click();
  await expect(page.getByLabel("Output", { exact: true })).toContainText("export interface Root {");
  await expect(page.getByLabel("Output", { exact: true })).toContainText("email: string | null;");
});

test("JSONPath in the tree selects the match", async ({ page }) => {
  await openTool(page, "tools/json-formatter/");
  await page.getByRole("button", { name: "Tree" }).click();
  await page.getByLabel("Search or JSONPath").fill("$.list[?@ > 1]");
  await expect(page.getByText("1 of 2")).toBeVisible();
  await expect(page.getByLabel("Selected path")).toHaveText("$.list[1]");
});

test("coming-soon cards follow the registry and hide during a search", async ({ page }) => {
  await page.goto("./");
  // `upcoming` is empty after the schema validator shipped; this still checks that no stale "Soon" card is shown,
  // and checks each card's title and missing link again as soon as a planned tool is added.
  await expect(page.locator(".card--soon")).toHaveCount(upcoming.length);
  for (const tool of upcoming) {
    await expect(page.getByText(tool.title, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: tool.title })).toHaveCount(0);
  }

  await page.getByRole("searchbox", { name: "Search utilities" }).fill("json");
  await expect(page.locator(".card--soon")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /JSON Formatter/ })).toBeVisible();
});

test("tool cards show a preview", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("link", { name: /JSON Formatter/ }).locator(".card__preview")).toContainText('"name"');
});

test("breadcrumbs lead back to all tools", async ({ page }) => {
  await page.goto("tools/json-formatter/");
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs).toContainText("Data");
  await crumbs.getByRole("link", { name: "Tools" }).click();
  await expect(page).toHaveURL(/\/web-kit\/$/);
});

test("the category crumb is not marked as the current page", async ({ page }) => {
  await page.goto("tools/json-formatter/");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).locator("[aria-current]")).toHaveCount(0);
});

test("code blocks announce a copy", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openTool(page, "tools/json-formatter/");
  await page.getByRole("tab", { name: "Install & Usage" }).click();
  await page.getByRole("button", { name: "Copy npm" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied" })).toHaveCount(1);
});

test("json-diff compares and copies a JSON Patch", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openTool(page, "tools/json-diff/");
  await page.getByLabel("Left", { exact: true }).fill('{"a":1,"b":2}');
  await page.getByLabel("Right", { exact: true }).fill('{"a":1.0,"b":3,"c":4}');
  await expect(page.getByRole("list", { name: "Changes" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Copy JSON Patch" }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(text)).toEqual([
    { op: "replace", path: "/b", value: 3 },
    { op: "add", path: "/c", value: 4 },
  ]);
});

test("json-schema-validator lists errors and selects them in the data", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("link", { name: /JSON Schema Validator/ })).toBeVisible();

  await page.goto("tools/json-schema-validator/");
  const data = page.getByLabel("Data", { exact: true });
  await data.fill('{"age": -1}');
  await page.getByLabel("Schema", { exact: true }).fill('{"type":"object","properties":{"age":{"minimum":0}},"required":["name"]}');
  const errors = page.getByRole("list", { name: "Errors" }).getByRole("button");
  await expect(errors).toHaveCount(2);
  // The status line; the same summary is also in a screen-reader-only live region.
  const statusLine = page.locator(".wk-ui-status");
  await expect(statusLine.getByText("Not valid: 2 errors")).toBeVisible();

  await errors.nth(1).click();
  const selection = await data.evaluate((area: HTMLTextAreaElement) => [area.selectionStart, area.selectionEnd]);
  expect(selection).toEqual([8, 10]);

  await page.getByRole("button", { name: "Generate schema from data" }).click();
  await expect(statusLine.getByText("Valid", { exact: true })).toBeVisible();
  await expect(page.getByText("The data matches the schema.")).toBeVisible();
});

test("code blocks announce every copy and keep Copied for 1.5 s after the last one", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("tools/json-formatter/");
  await page.getByRole("tab", { name: "Install & Usage" }).click();
  const button = page.getByRole("button", { name: "Copy npm" });
  const live = button.locator("xpath=following-sibling::*[@role='status']");
  // Recorded in the page with its own clock, so a slow test runner cannot shift the timings: every text of the live
  // region, the time of each click, and when the button's label went back to "Copy".
  await live.evaluate((element) => {
    const log = { texts: [] as string[], clicks: [] as number[], idleAt: 0 };
    (window as unknown as { copyLog: typeof log }).copyLog = log;
    const button = element.previousElementSibling!;
    button.addEventListener("click", () => log.clicks.push(performance.now()));
    new MutationObserver(() => log.texts.push(element.textContent ?? "")).observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    new MutationObserver(() => {
      if (button.textContent === "Copy") log.idleAt = performance.now();
    }).observe(button, { childList: true, characterData: true, subtree: true });
  });
  await button.click();
  await expect(button).toHaveText("Copied");
  await page.waitForTimeout(1000);
  await button.click();
  await expect(button).toHaveText("Copy", { timeout: 5000 });
  const log = await page.evaluate(() => (window as unknown as { copyLog: { texts: string[]; clicks: number[]; idleAt: number } }).copyLog);
  expect(log.texts.filter((text) => text === "Copied"), "each copy is announced").toHaveLength(2);
  expect(log.clicks).toHaveLength(2);
  expect(log.clicks[1]! - log.clicks[0]!, "the second copy came before the first one's 1.5 s ran out").toBeLessThan(1500);
  // "Copied" stays 1.5 s after the last copy, not after the first.
  expect(log.idleAt - log.clicks[1]!).toBeGreaterThanOrEqual(1400);
});
