import { expect, test, type Page } from "@playwright/test";

// Text Compare on two 5 MB files. These run in their own project ("large"), after the others and one at a time.

/** Opens Text Compare, waits for hydration and starts recording long animation frames. */
async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: { start: number; duration: number; ours: number; invokers: string[] }[] = [];
    (window as unknown as { __frames: typeof frames }).__frames = frames;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as PerformanceLongAnimationFrameTiming[]) {
        // Only the scripts of the page (its bundles); the browser's own work in a text field is not ours to cut.
        const scripts = entry.scripts.filter((script) => script.sourceURL.includes("/_next/"));
        frames.push({
          start: entry.startTime,
          duration: entry.duration,
          ours: scripts.reduce((sum, script) => sum + script.duration, 0),
          invokers: scripts.map((script) => script.invoker),
        });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("tools/text-compare/");
  await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
}

interface PerformanceLongAnimationFrameTiming extends PerformanceEntry {
  scripts: { sourceURL: string; duration: number; invoker: string }[];
}

/** Groups of ten lines in reverse order on the right: every line is on both sides, so the diff has real work to do. */
const MAKE = `const lines = Array.from({ length: 100000 }, (_, i) => "line " + (i % 5000) + ": the quick brown fox jumps over the lazy dog");
  if (arg) for (let i = 0; i < lines.length; i += 10) lines.splice(i, 10, ...lines.slice(i, i + 10).reverse());
  return lines.join("\\n");`;

export async function dropLarge(page: Page, side: "left" | "right", reverse: boolean): Promise<void> {
  const transfer = await page.evaluateHandle(
    ({ make, arg }) => {
      const data = new DataTransfer();
      data.items.add(new File([new Function("arg", make)(arg) as string], `${arg ? "right" : "left"}.txt`, { type: "text/plain" }));
      return data;
    },
    { make: MAKE, arg: reverse },
  );
  const target = page.locator(`.wk-compare__pane--${side}`);
  for (const type of ["dragenter", "dragover", "drop"]) await target.dispatchEvent(type, { dataTransfer: transfer });
}

const now = (page: Page) => page.evaluate(() => performance.now());
/** Lets the page settle: two frames after a quiet second. */
const settle = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 1000)));
/** The longest time our scripts took in one frame since `from`, with the frames where the page edited a field left out. */
async function longest(page: Page, from: number, skipEdits = false): Promise<number> {
  const frames = await page.evaluate(
    (from) => (window as unknown as { __frames: { start: number; ours: number; invokers: string[] }[] }).__frames.filter((f) => f.start >= from),
    from,
  );
  return Math.round(Math.max(0, ...frames.filter((f) => !skipEdits || !f.invokers.some((i) => i.includes("click"))).map((f) => f.ours)));
}

test("large results never keep the page busy for more than 200 ms: the result, Show more, Inline, Show all and a merge", async ({ page }) => {
  test.slow();
  await open(page);
  await dropLarge(page, "left", false);
  await dropLarge(page, "right", true);
  const pending = page.locator(".wk-compare__pending");
  // The browser takes a second or two to put 5 MB into a text field; that frame is its own, so it comes first.
  await expect.poll(() => page.getByRole("textbox", { name: /^Right/ }).evaluate((area: HTMLTextAreaElement) => area.value.length), { timeout: 30_000 }).toBeGreaterThan(1_000_000);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(pending).toBeVisible();
  const measured: Record<string, number> = {};

  let from = await now(page);
  await expect(pending).toHaveCount(0, { timeout: 90_000 });
  await settle(page);
  measured.result = await longest(page, from);

  from = await now(page);
  await page.getByRole("button", { name: "Show more" }).click();
  await settle(page);
  measured["Show more"] = await longest(page, from);

  from = await now(page);
  await page.getByRole("button", { name: "Inline" }).click();
  await settle(page);
  measured.Inline = await longest(page, from);

  from = await now(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Show all unchanged lines" }).click();
  await settle(page);
  measured["Show all"] = await longest(page, from);

  // The frame of the click itself is the browser editing a 5 MB field (execCommand, so Ctrl+Z undoes it): left out.
  await page.locator(".wk-compare__body").evaluate((body) => (body.scrollTop = 0));
  from = await now(page);
  const first = page.locator(".wk-compare__body").getByRole("group").first();
  await first.hover();
  await first.getByRole("button", { name: "Use right" }).click();
  await expect(pending).toBeVisible({ timeout: 30_000 });
  await expect(pending).toHaveCount(0, { timeout: 90_000 });
  await settle(page);
  measured.merge = await longest(page, from, true);

  test.info().annotations.push({ type: "longest frame of our scripts", description: JSON.stringify(measured) });
  expect(Object.entries(measured).filter(([, ms]) => ms >= 200), JSON.stringify(measured)).toEqual([]);
});
