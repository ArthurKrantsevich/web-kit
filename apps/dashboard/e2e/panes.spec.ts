import { expect, test, type Page } from "@playwright/test";
import { hydrated } from "./hydrated";

// A pane's header is one line at every width: its action labels give way to icons (the tooltip and the accessible
// name stay) when the pane, not the whole editor, is too narrow for them. Two panes side by side have headers of the
// same height, and a header does not grow when the size label does (B, then KB, then MB).
const TOOLS = [
  "json-formatter",
  "json-convert",
  "json-diff",
  "json-schema-validator",
  "text-compare",
  "uuid-generator",
  "password-generator",
  "hash-generator",
  "code-scanner",
] as const;
/** The tools whose input is a text field that can take a megabyte. */
const TEXT_TOOLS = ["json-formatter", "json-convert", "json-diff", "json-schema-validator", "text-compare", "hash-generator"] as const;
/** The longest size label the tools show: formatBytes() of 1,048,575 bytes. */
const LONGEST_SIZE = "1023.9 KB";

async function prepare(page: Page, tool: (typeof TOOLS)[number]) {
  await page.goto(`tools/${tool}/`);
  await hydrated(page, tool);
  if (tool === "json-convert") {
    // The longest output format name.
    await page.getByRole("button", { name: "Convert to" }).click();
    await page.getByRole("option", { name: "TypeScript" }).click();
  }
}

/** Every pane header's height, with every size label made as long as it gets. */
const headerHeights = (page: Page) =>
  page.evaluate((longest) => {
    for (const meta of document.querySelectorAll(".wk-ui-pane__meta")) {
      const walker = document.createTreeWalker(meta, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        node.textContent = node.textContent!.replace(/\d+(\.\d)? [KM]?B/, longest);
      }
    }
    return [...document.querySelectorAll<HTMLElement>(".wk-ui-pane__head")].map((head) => Math.round(head.getBoundingClientRect().height));
  }, LONGEST_SIZE);

// The megabyte tests run one at a time: each tool works hard on 1 MB, and other tests time their own work.
test.describe("with a megabyte of input", () => {
  test.describe.configure({ mode: "serial" });
  for (const tool of TEXT_TOOLS) {
    test(`${tool}: a pane header does not change height when the input grows from bytes to megabytes`, async ({ page }) => {
      await megabytes(page, tool);
    });
  }
});

for (const tool of TOOLS) {
  test(`${tool}: every pane header is one line from 320 to 1920 px`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepare(page, tool);
    const wrapped: string[] = [];
    for (let width = 320; width <= 1920; width += 20) {
      await page.setViewportSize({ width, height: 900 });
      const heights = await headerHeights(page);
      if (heights.some((height) => height !== 44)) wrapped.push(`${width}px: ${heights.join(", ")}`);
    }
    expect(wrapped, "headers taller than one line (44 px)").toEqual([]);
  });

}

async function megabytes(page: Page, tool: (typeof TEXT_TOOLS)[number]) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepare(page, tool);
  const input = page.locator('[data-pane~="input"] textarea').first();
  const big = JSON.stringify({ items: Array.from({ length: 34000 }, (_, index) => ({ id: index, name: `item ${index}` })) });
  const measure = async () => {
    const seen: string[] = [];
    for (const width of [390, 700, 1024, 1160, 1220, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const heights = await page.locator(".wk-ui-pane__head").evaluateAll((heads) => heads.map((head) => head.getBoundingClientRect().height));
      seen.push(`${width}px: ${heights.join(", ")}`);
    }
    return seen;
  };
  await input.fill("{}");
  await expect(page.locator(".wk-ui-pane__meta").first()).toContainText(/\d B/);
  const small = await measure();
  await input.fill(big);
  await expect(page.locator(".wk-ui-pane__meta").first()).toContainText("MB");
  expect(await measure()).toEqual(small);
}
