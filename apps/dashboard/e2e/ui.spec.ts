import { expect, test, type Page } from "@playwright/test";

const TOOLS = ["json-formatter", "json-convert", "json-diff", "json-schema-validator", "text-compare"];

type Boxes = Record<string, [number, number, number, number]>;

/** Place and size of every visible button in the toolbar and the pane headers, keyed by its name. */
function buttonBoxes(page: Page): Promise<Boxes> {
  return page.evaluate(() => {
    const boxes: Record<string, [number, number, number, number]> = {};
    for (const button of document.querySelectorAll(".wk-ui-editor__toolbar button, .wk-ui-pane__head button")) {
      const box = button.getBoundingClientRect();
      if (box.width === 0) continue;
      // A CopyButton's text holds all three labels, so the key stays the same after a copy.
      const key = button.getAttribute("aria-label") ?? button.textContent ?? "";
      boxes[key] = [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 2) / 2) as [
        number,
        number,
        number,
        number,
      ];
    }
    return boxes;
  });
}

/** Every button present in both snapshots is in the same place with the same size. */
function expectSameBoxes(before: Boxes, after: Boxes, step: string): void {
  const shared = Object.keys(before).filter((key) => key in after);
  expect(shared.length, step).toBeGreaterThan(3);
  for (const key of shared) expect([step, key, after[key]]).toEqual([step, key, before[key]]);
}

for (const tool of TOOLS) {
  test(`${tool}: no button moves or changes width after Copy or a segment switch`, async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`tools/${tool}/`);
    // Paste appears after hydration, once the page knows the clipboard can be read.
    await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
    const before = await buttonBoxes(page);

    const copy = page.locator(".wk-ui-copy").first();
    await copy.click();
    await expect(copy).toHaveAccessibleName("Copied");
    expectSameBoxes(before, await buttonBoxes(page), "after Copy");

    const segments = page.locator(".wk-ui-segment");
    const count = await segments.count();
    for (let index = 0; index < count; index++) {
      const segment = segments.nth(index);
      const name = (await segment.textContent()) ?? "";
      await segment.click();
      await expect(segment).toHaveAttribute("aria-pressed", "true");
      expectSameBoxes(before, await buttonBoxes(page), `after ${name}`);
    }

    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menu", { name: "More actions" })).toBeVisible();
    expectSameBoxes(before, await buttonBoxes(page), "with the menu open");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    expectSameBoxes(before, await buttonBoxes(page), "after the menu closed");
  });
}

for (const [width, height] of [
  [1280, 800],
  [390, 844],
] as const) {
  for (const tool of TOOLS) {
    test(`${tool} at ${width} px: no button moves when the page hydrates and Paste appears`, async ({ browser, baseURL }) => {
      // The page as the server sent it: no script runs, so Paste (shown only once the clipboard can be read) keeps its
      // place unseen, after Open file.
      const still = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width, height } });
      const before = await still.newPage();
      await before.goto(`tools/${tool}/`);
      await before.evaluate(() => document.fonts.ready);
      const server = await buttonBoxes(before);
      const kept = before.locator('[data-action="paste"]');
      expect(await kept.count()).toBeGreaterThan(0);
      for (const paste of await kept.all()) await expect(paste).toHaveCSS("visibility", "hidden");
      expect(Object.keys(server).filter((name) => name.startsWith("Paste")).length).toBe(await kept.count());
      await still.close();

      const live = await browser.newContext({ baseURL, viewport: { width, height } });
      const after = await live.newPage();
      await after.goto(`tools/${tool}/`);
      await expect(after.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
      await after.evaluate(() => document.fonts.ready);
      expectSameBoxes(server, await buttonBoxes(after), "after hydration");
      await live.close();
    });
  }

  test(`the tree's buttons keep their place and width at ${width} px`, async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height });
    await page.goto("tools/json-formatter/");
    await page.getByRole("button", { name: "Tree" }).click();
    await page.getByRole("treeitem", { name: /hello/ }).click();
    const boxes = () =>
      page.evaluate(() => {
        const found: Record<string, [number, number, number, number]> = {};
        for (const button of document.querySelectorAll(".wk-tree__toolbar button, .wk-tree__details button")) {
          const box = button.getBoundingClientRect();
          const name = button.querySelector(".wk-ui-copy__label")?.textContent ?? button.textContent ?? "";
          // Page coordinates: a click may scroll the page on a phone.
          found[name] = [box.x + scrollX, box.y + scrollY, box.width, box.height].map((value) => Math.round(value * 2) / 2) as [
            number,
            number,
            number,
            number,
          ];
        }
        return found;
      });
    const before = await boxes();
    // Every button is inside the output pane: the list gives up height on a short pane, not the details.
    const inside = await page.evaluate(() => {
      const pane = document.querySelector(".wk-json__pane--output")!.getBoundingClientRect();
      return [...document.querySelectorAll(".wk-tree__toolbar button, .wk-tree__details button")].every((button) => {
        const box = button.getBoundingClientRect();
        return box.top >= pane.top && box.bottom <= pane.bottom + 0.5 && box.left >= pane.left && box.right <= pane.right + 0.5;
      });
    });
    expect(inside).toBe(true);
    expect(Object.keys(before)).toEqual([
      "Previous match",
      "Next match",
      "Copy results",
      "Expand all",
      "Collapse all",
      "Copy path",
      "Copy value",
      "Show in input",
    ]);
    const search = page.getByLabel("Search or JSONPath");
    for (const step of [
      async () => page.getByRole("button", { name: "Copy path" }).click(),
      async () => page.getByRole("button", { name: "Copy value" }).click(),
      async () => search.fill("zzz"),
      async () => search.fill("$[?length(@) > 1] and a long tail to make the message longer than the toolbar"),
      async () => search.fill("o"),
      async () => page.getByRole("button", { name: "Copy results" }).click(),
    ]) {
      await step();
      await page.waitForTimeout(50);
      expect(await boxes()).toEqual(before);
    }
  });

  test(`More actions shares a row with other buttons at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const tool of TOOLS) {
      await page.goto(`tools/${tool}/`);
      const tops = await page.evaluate(() =>
        [...document.querySelectorAll(".wk-ui-editor__toolbar button")].map((button) => [
          button.getAttribute("aria-label") ?? button.textContent ?? "",
          Math.round(button.getBoundingClientRect().top),
        ]),
      );
      // Buttons on one row may differ in height by a few pixels (segments sit inside their group's padding).
      const more = Number(tops.find(([name]) => name === "More actions")![1]);
      expect([tool, tops.filter(([, top]) => Math.abs(Number(top) - more) < 8).length]).not.toEqual([tool, 1]);
    }
  });
}

test("json-schema-validator at 390 px: Undo appears after Generate without moving or wrapping anything", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("tools/json-schema-validator/");
  await expect(page.getByRole("button", { name: "Paste into Schema" })).toBeVisible();
  const rows = [".wk-ui-editor__toolbar", ".wk-schema__pane--schema .wk-ui-pane__head"];
  /** Height of the toolbar and the Schema header, and the box of every visible button in them. */
  const boxes = () =>
    page.evaluate((selectors) => {
      const buttons: Record<string, [number, number, number, number]> = {};
      const heights: number[] = [];
      for (const selector of selectors) {
        const row = document.querySelector(selector)!;
        heights.push(Math.round(row.getBoundingClientRect().height));
        for (const button of row.querySelectorAll("button")) {
          const box = button.getBoundingClientRect();
          if (box.width === 0) continue;
          buttons[button.getAttribute("aria-label") ?? button.textContent ?? ""] = [box.x, box.y, box.width, box.height].map(
            (value) => Math.round(value * 2) / 2,
          ) as [number, number, number, number];
        }
      }
      return { buttons, heights };
    }, rows);
  const before = await boxes();
  expect(Object.keys(before.buttons)).not.toContain("Undo generate");

  await page.getByRole("button", { name: "Generate schema from data" }).click();
  const undo = page.getByRole("button", { name: "Undo generate" });
  await expect(undo).toBeVisible();
  const after = await boxes();

  expect(after.heights, "neither row grows a second line").toEqual(before.heights);
  for (const [key, box] of Object.entries(before.buttons)) expect([key, after.buttons[key]]).toEqual([key, box]);
  // Undo is in the status line, next to the notice, with its label.
  expect(Object.keys(after.buttons)).not.toContain("Undo generate");
  await expect(page.locator(".wk-ui-status").getByRole("button", { name: "Undo generate" })).toHaveText("Undo");
  await expect(undo).toHaveAccessibleDescription("Bring back the schema you had before generating");
});

test("the footer sits at the bottom of a short page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // About has grown long; the page for an unknown address is still short.
  await page.goto("tools/does-not-exist/");
  const footer = (await page.getByRole("contentinfo").boundingBox())!;
  expect(Math.round(footer.y + footer.height)).toBe(800);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(800);
});

test("the footer follows the content on a long page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  const main = (await page.locator("main").boundingBox())!;
  const footer = (await page.getByRole("contentinfo").boundingBox())!;
  expect(Math.round(footer.y)).toBe(Math.round(main.y + main.height));
});

for (const [width, height] of [
  [1280, 800],
  [390, 844],
] as const) {
  test(`a select opens inside the window and closes with Escape at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("tools/json-convert/");
    const select = page.getByRole("button", { name: "Convert to" });
    await select.click();
    const list = page.getByRole("listbox", { name: "Convert to" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option")).toHaveCount(4);
    const box = (await list.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    // The editor card clips its content; the list is in the top layer, so nothing covers it.
    const center = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="listbox"]') !== null,
      { x: box.x + box.width / 2, y: box.y + box.height - 10 },
    );
    expect(center).toBe(true);
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(select).toBeFocused();
    await expect(select).toHaveAttribute("aria-expanded", "false");
  });
}

test("a click on the button of an open select closes it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("tools/json-convert/");
  const select = page.getByRole("button", { name: "Convert to" });
  const list = page.getByRole("listbox", { name: "Convert to" });
  await select.click();
  await expect(list).toBeVisible();
  await select.click();
  await expect(select).toHaveAttribute("aria-expanded", "false");
  await expect(list).toBeHidden();
  await select.click();
  await expect(list).toBeVisible();
});

test("a select near the bottom edge opens upward", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 340 });
  await page.goto("tools/json-formatter/");
  const select = page.getByRole("button", { name: "Indent" });
  await select.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const button = document.querySelector('[aria-label="Indent"]')!;
    window.scrollBy(0, button.getBoundingClientRect().bottom - window.innerHeight + 4);
  });
  const button = (await select.boundingBox())!;
  await select.click();
  const list = (await page.getByRole("listbox", { name: "Indent" }).boundingBox())!;
  expect(list.y + list.height).toBeLessThanOrEqual(button.y);
  expect(list.y).toBeGreaterThanOrEqual(0);
});

test("a select works with the keyboard", async ({ page }) => {
  await page.goto("tools/json-convert/");
  const select = page.getByRole("button", { name: "Convert to" });
  await select.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox", { name: "Convert to" })).toBeFocused();
  await page.keyboard.press("t");
  await page.keyboard.press("Enter");
  await expect(select).toHaveText("TypeScript");
  await expect(page.getByLabel("Output", { exact: true })).toContainText("export interface Root {");
});

test("tooltips appear on hover after a delay and at once on keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("tools/json-formatter/");
  const sample = page.getByRole("button", { name: "Sample" });
  const tip = page.getByRole("tooltip").filter({ hasText: "Replace the input with an example" });

  // The delay is 400 ms: still hidden at 150 ms, shown by 900 ms (wide margins for a slow runner).
  await sample.hover();
  const hovered = Date.now();
  await page.waitForTimeout(150);
  expect(await tip.isVisible(), "hidden 150 ms after hover").toBe(false);
  await expect(tip, "visible 900 ms after hover").toBeVisible({ timeout: Math.max(1, 900 - (Date.now() - hovered)) });
  const button = (await sample.boundingBox())!;
  const box = (await tip.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(button.y);
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();

  await page.getByRole("switch", { name: "Sort keys" }).focus();
  await page.keyboard.press("Tab");
  await expect(sample).toBeFocused();
  await expect(tip).toBeVisible({ timeout: 300 });
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
});

test("a tooltip does not change the accessible name", async ({ page }) => {
  await page.goto("tools/json-diff/");
  const copy = page.getByRole("button", { name: "Copy JSON Patch" });
  await expect(copy).toHaveAccessibleDescription("Copy RFC 6902 operations that turn Left into Right");
});

for (const width of [390, 700, 900, 1024, 1280]) {
  test(`json-convert at ${width} px: choosing another format moves nothing below the toolbar`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("tools/json-convert/");
    await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
    const seen: string[] = [];
    for (const format of ["YAML", "CSV", "XML", "TypeScript", "YAML"]) {
      await page.getByRole("button", { name: "Convert to" }).click();
      await page.getByRole("option", { name: format }).click();
      await expect(page.getByRole("button", { name: "Convert to" })).toContainText(format);
      const toolbar = (await page.locator(".wk-ui-editor__toolbar").boundingBox())!;
      const pane = (await page.locator('[data-pane="input"]').boundingBox())!;
      seen.push(`${format}: toolbar ${Math.round(toolbar.height)}, input at ${Math.round(pane.y)}`);
    }
    expect(new Set(seen.map((entry) => entry.split(": ")[1])).size, seen.join("; ")).toBe(1);
  });
}
