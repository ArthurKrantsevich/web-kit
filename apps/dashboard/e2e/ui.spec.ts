import { expect, test, type Page } from "@playwright/test";

const TOOLS = ["json-formatter", "json-convert", "json-diff", "json-schema-validator"];

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
  await page.goto("about/");
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

  await sample.hover();
  await expect(tip).toBeHidden();
  await expect(tip).toBeVisible();
  const button = (await sample.boundingBox())!;
  const box = (await tip.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(button.y);
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();

  await page.getByRole("button", { name: "Open file" }).focus();
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
