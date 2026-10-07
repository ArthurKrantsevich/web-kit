import { expect, test, type Page } from "@playwright/test";
import { compose, rasterize } from "../../../packages/code-scanner/bench/distort";
import { encodeSymbol, segmentsFor } from "../../../packages/code-scanner/test/encoders/qr";
import { encodePng } from "../../../packages/code-scanner/test/png";
import { hydrated } from "./hydrated";

const qrPng = (text: string, version = 2, module = 6): Buffer => Buffer.from(encodePng(rasterize(encodeSymbol("qr", version, "M", segmentsFor(text))!.matrix, { module })));
const sheetPng = (): Buffer => {
  const a = rasterize(encodeSymbol("qr", 2, "M", segmentsFor("left label"))!.matrix, { module: 5 });
  const b = rasterize(encodeSymbol("qr", 3, "Q", segmentsFor("right label"))!.matrix, { module: 5 });
  return Buffer.from(encodePng(compose(700, 320, [{ plane: a, x: 20, y: 40 }, { plane: b, x: 380, y: 20 }])));
};
type Boxes = Record<string, number[]>;

async function open(page: Page, width = 1280, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("tools/code-scanner/");
  await hydrated(page, "code-scanner");
  await page.evaluate(() => document.fonts.ready);
}
/** Place and size of the panels and of every visible button of the toolbar and the pane headers. */
function boxes(page: Page): Promise<Boxes> {
  return page.evaluate(() => {
    const found: Record<string, number[]> = {};
    const add = (key: string, element: Element | null) => {
      const box = element?.getBoundingClientRect();
      if (box && box.width > 0) found[key] = [box.x + scrollX, box.y + scrollY, box.width, box.height].map((v) => Math.round(v));
    };
    for (const [key, selector] of Object.entries({ toolbar: ".wk-ui-editor__toolbar", panes: ".wk-ui-editor__panes", image: ".wk-scanner__pane--image", results: ".wk-scanner__pane--results", status: ".wk-ui-status" })) add(key, document.querySelector(selector));
    for (const button of document.querySelectorAll(".wk-ui-editor__toolbar button, .wk-ui-pane__head button")) {
      if (getComputedStyle(button).visibility === "hidden") continue;
      add(button.getAttribute("aria-label") ?? button.textContent ?? "", button);
    }
    return found;
  });
}
function expectSame(before: Boxes, after: Boxes, step: string): void {
  expect(Object.keys(after).sort(), step).toEqual(Object.keys(before).sort());
  for (const key of Object.keys(before)) expect([step, key, after[key]]).toEqual([step, key, before[key]]);
}
/** The Open button and its hidden file input share the label; the file goes into the input. */
const upload = (page: Page, name: string, buffer: Buffer, mimeType = "image/png") =>
  page.getByLabel("Open image").and(page.locator('input[type="file"]')).setInputFiles({ name, mimeType, buffer });

test("scans an uploaded QR, lists it with its text, keeps the status line's form, and decodes the sample", async ({ page }) => {
  await open(page);
  await upload(page, "ticket.png", qrPng("https://example.com/t/42"));
  const entry = page.locator(".wk-scanner__entry").first();
  await expect(entry.locator(".wk-scanner__badge")).toHaveText("QR Code");
  await expect(entry.locator(".wk-scanner__text")).toHaveText("https://example.com/t/42");
  await expect(page.locator(".wk-scanner__summary")).toHaveText(/^QR Code · 25×25 · corrected 0 of \d+ · \d+ ms$/);
  await expect(page.getByAltText("ticket.png")).toBeVisible();
  await page.getByRole("button", { name: "Sample" }).click();
  await expect(page.locator(".wk-scanner__entry")).toHaveCount(2);
  await expect(page.locator(".wk-scanner__entry").first().locator(".wk-scanner__text")).toHaveText("https://arthurkrantsevich.github.io/web-kit/");
});

test("finds both codes on a sheet with Multiple codes, and only the larger one without", async ({ page }) => {
  await open(page);
  await upload(page, "sheet.png", sheetPng());
  await expect(page.locator(".wk-scanner__entry")).toHaveCount(1);
  await expect(page.locator(".wk-scanner__text")).toHaveText("right label");
  await page.getByRole("switch", { name: "Multiple codes" }).click();
  await expect(page.locator(".wk-scanner__entry")).toHaveCount(2);
  await expect(page.locator(".wk-scanner__text")).toHaveText(["left label", "right label"]);
  await expect(page.locator(".wk-scanner__summary")).toContainText("2 codes");
});

test("refuses a text file and keeps the earlier result", async ({ page }) => {
  await open(page);
  await upload(page, "ticket.png", qrPng("keep me"));
  await expect(page.locator(".wk-scanner__entry")).toHaveCount(1);
  await upload(page, "notes.txt", Buffer.from("hello"), "text/plain");
  await expect(page.locator(".wk-ui-status")).toContainText("notes.txt is not an image: open a PNG, JPEG, WebP, GIF, BMP or SVG");
  await expect(page.locator(".wk-scanner__entry")).toHaveCount(1);
  await expect(page.getByAltText("ticket.png")).toBeVisible();
});

for (const [width, height] of [[1280, 800], [390, 844]] as const) {
  test(`at ${width} px nothing moves when switches flip, an image is scanned, or the list is cleared`, async ({ page }) => {
    await open(page, width, height);
    const before = await boxes(page);
    await page.getByRole("switch", { name: "Try harder" }).click();
    expectSame(before, await boxes(page), "Try harder");
    await page.getByRole("switch", { name: "Multiple codes" }).click();
    expectSame(before, await boxes(page), "Multiple codes");
    await upload(page, "ticket.png", qrPng("steady"));
    await expect(page.locator(".wk-scanner__entry")).toHaveCount(1);
    expectSame(before, await boxes(page), "after a scan");
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.locator(".wk-scanner__entry")).toHaveCount(0);
    expectSame(before, await boxes(page), "after Clear");
  });
}

test("from 320 to 1920 px the scanner never scrolls sideways and keeps its controls inside the toolbar", async ({ page }) => {
  await open(page, 1280, 900);
  await upload(page, "ticket.png", qrPng("widths"));
  await expect(page.locator(".wk-scanner__entry")).toHaveCount(1);
  const problems: string[] = [];
  for (let width = 320; width <= 1920; width += 40) {
    await page.setViewportSize({ width, height: 900 });
    const report = await page.evaluate(() => {
      const toolbar = document.querySelector(".wk-ui-editor__toolbar")!.getBoundingClientRect();
      const outside = [...document.querySelectorAll(".wk-ui-editor__toolbar button, .wk-ui-editor__toolbar label")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.left < toolbar.left - 1 || b.right > toolbar.right + 1); }).length;
      return { scroll: document.documentElement.scrollWidth > innerWidth, outside };
    });
    if (report.scroll) problems.push(`${width}px: sideways scroll`);
    if (report.outside > 0) problems.push(`${width}px: ${report.outside} controls outside the toolbar`);
  }
  expect(problems).toEqual([]);
});

test("at 390 px the long status line of a Try harder scan stays one line inside the pane, gives way with an ellipsis, and says it all in its title", async ({ page }) => {
  await open(page, 390, 844);
  const status = page.locator(".wk-ui-status"), summary = page.locator(".wk-scanner__summary");
  const height = (await status.boundingBox())!.height;
  await page.getByRole("switch", { name: "Try harder" }).click();
  // exact: the empty state's "Try the sample" button also matches
  await page.getByRole("button", { name: "Sample", exact: true }).click();
  await expect(summary).toHaveText(/^QR Code · 33×33 · corrected 0 of \d+ · Try harder on · \d+ ms$/);
  const report = await summary.evaluate((node) => {
    const line = node.closest(".wk-ui-status")!.getBoundingClientRect(), own = node.getBoundingClientRect();
    // the element whose text overflows is the one that must draw the ellipsis: text-overflow works on a block container
    // with hidden overflow and one line, and not on the flex box that carries the state's dot
    const clipped = [node, ...node.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => {
      const s = getComputedStyle(el);
      return [s.display, s.overflowX, s.whiteSpace, s.textOverflow].join(" ");
    });
    return { inside: own.left >= line.left - 1 && own.right <= line.right + 1, clipped, title: node.getAttribute("title") === node.textContent };
  });
  expect(report).toEqual({ inside: true, clipped: ["block hidden nowrap ellipsis"], title: true });
  expect((await status.boundingBox())!.height).toBe(height);
});

test("a share link carries the switches only, and the saved input never holds an image or a result", async ({ page, context }) => {
  await open(page);
  await upload(page, "ticket.png", qrPng("private"));
  await expect(page.locator(".wk-scanner__entry")).toHaveCount(1);
  await page.getByRole("switch", { name: "Try harder" }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Save input in this browser" }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Share link…" }).click();
  const link = await page.getByRole("dialog").getByLabel("Share link").inputValue();
  expect(link).toMatch(/#code-scanner=/);
  const storage = await page.evaluate(() => Object.entries(localStorage).map(([k, v]) => `${k}=${v}`).join("\n"));
  expect([storage.includes("private"), storage.includes("blob:"), link.includes("private")]).toEqual([false, false, false]);
  const fresh = await context.newPage();
  await fresh.goto(link);
  await hydrated(fresh, "code-scanner");
  await expect(fresh.getByRole("switch", { name: "Try harder" })).toBeChecked();
  await expect(fresh.locator(".wk-scanner__entry")).toHaveCount(0);
});
