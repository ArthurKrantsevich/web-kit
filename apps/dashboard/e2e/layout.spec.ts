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

test("formatter: input and output side by side at 1280 × 800, output visible without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("tools/json-formatter/");
  const input = (await page.getByLabel("Input", { exact: true }).boundingBox())!;
  const output = (await page.getByLabel("Output", { exact: true }).boundingBox())!;
  expect(output.x).toBeGreaterThanOrEqual(input.x + input.width - 1);
  expect(Math.abs(output.y - input.y)).toBeLessThan(60);
  expect(output.y).toBeLessThan(800);
});

test("formatter: modes fit one row on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("tools/json-formatter/");
  const tops = await page
    .getByRole("group", { name: "Mode" })
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

test("tool page: tabs beside the title, description in Install & Usage", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("tools/json-formatter/");
  const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  const tabs = (await page.getByRole("tablist", { name: "Sections" }).boundingBox())!;
  expect(tabs.x).toBeGreaterThan(title.x + title.width);
  await page.getByRole("tab", { name: "Install & Usage" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Format, minify, sort, escape and validate JSON.");
});

test("formatter page loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("tools/json-formatter/");
  await page.getByLabel("Input", { exact: true }).waitFor();
  expect(errors).toEqual([]);
});

test("formatter: file actions stay on one row on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("tools/json-formatter/");
  const tops = await page
    .getByRole("group", { name: "Options" })
    .getByRole("button", { name: /^(Open file|Sample|Clear)$/ })
    .evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
  expect(tops).toHaveLength(3);
  expect(new Set(tops).size).toBe(1);
});

test("formatter: keyboard focus on the output is visible inside the pane", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("tools/json-formatter/");
  const output = page.getByLabel("Output", { exact: true });
  await output.focus();
  expect(await output.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe("-2px");
});

test("formatter: keeps its width inside a shrink-to-fit parent", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("tools/json-formatter/");
  const width = await page.evaluate(() => {
    const editor = document.querySelector(".wk-json")!;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.width = "1000px";
    const aside = document.createElement("aside");
    aside.style.width = "100px";
    editor.replaceWith(row);
    row.append(aside, editor);
    return editor.getBoundingClientRect().width;
  });
  expect(width).toBeGreaterThan(800);
});
