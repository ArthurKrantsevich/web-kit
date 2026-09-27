import { expect, test, type Page } from "@playwright/test";

// Text Compare on two 5 MB files. These run in their own project ("large"), after the others and one at a time.

/** Opens Text Compare, waits for hydration and starts recording long animation frames. */
async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: { start: number; duration: number; ours: number; invokers: string[] }[] = [];
    const events: { name: string; start: number; delay: number; duration: number }[] = [];
    Object.assign(window, { __frames: frames, __events: events });
    // Event Timing: how long each input waited for the page (processingStart - startTime) and took until the next
    // paint (duration). Inputs faster than 16 ms are not reported.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { name: string; startTime: number; processingStart: number; duration: number }[]) {
        events.push({ name: entry.name, start: entry.startTime, delay: entry.processingStart - entry.startTime, duration: entry.duration });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
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
/**
 * The longest time our scripts took in one frame since `from`. `skip` leaves out frames started by those inputs: a
 * merge's click (the browser editing a 5 MB field), or every input when Event Timing measures the inputs instead.
 */
async function longest(page: Page, from: number, skip?: RegExp): Promise<number> {
  const frames = await page.evaluate(
    (from) => (window as unknown as { __frames: { start: number; ours: number; invokers: string[] }[] }).__frames.filter((f) => f.start >= from),
    from,
  );
  return Math.round(Math.max(0, ...frames.filter((f) => !skip || !f.invokers.some((i) => skip.test(i))).map((f) => f.ours)));
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
  measured.merge = await longest(page, from, /click/);

  test.info().annotations.push({ type: "longest frame of our scripts", description: JSON.stringify(measured) });
  expect(Object.entries(measured).filter(([, ms]) => ms >= 200), JSON.stringify(measured)).toEqual([]);
});

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

// Chromium alone needs about 250 ms to put a typed key into a 5 MB text field, so the measure is what the page answers
// while the worker compares: clicks on a control and keys typed into another field, five of each.
test("two 5 MB files are compared in the worker, and meanwhile the page answers input quickly", async ({ page }) => {
  test.slow();
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await open(page);
  await dropLarge(page, "left", false);
  await dropLarge(page, "right", true);
  const pending = page.locator(".wk-compare__pending");
  await expect(pending).toHaveText(/^Comparing \d+\.\d MB…$/, { timeout: 30_000 });
  await expect.poll(() => page.getByRole("textbox", { name: /^Right/ }).evaluate((area: HTMLTextAreaElement) => area.value.length), { timeout: 30_000 }).toBeGreaterThan(1_000_000);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(pending).toBeVisible();
  const from = await now(page);

  /** The slowest reported event of one input, or 16 ms (the threshold) when none was reported. */
  const sample = async (act: () => Promise<void>, names: string[]) => {
    const start = await now(page);
    await act();
    await page.evaluate(() => new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 50)));
    const events = await page.evaluate(
      ({ start, names }) =>
        (window as unknown as { __events: { name: string; start: number; delay: number; duration: number }[] }).__events.filter(
          (event) => event.start >= start && names.includes(event.name),
        ),
      { start, names },
    );
    return { delay: Math.max(0, ...events.map((event) => event.delay)), duration: Math.max(16, ...events.map((event) => event.duration)) };
  };
  const clicks = [];
  for (const name of ["Characters", "Words", "Characters", "Words", "Characters"]) {
    clicks.push(await sample(() => page.getByRole("button", { name }).click(), ["pointerdown", "pointerup", "click"]));
  }
  await page.getByRole("button", { name: "More actions" }).click();
  // Opening a modal dialog makes the page inert, and Chromium then restyles the 5 MB fields (about 300–400 ms in a
  // bare page too): that input is the browser's, and not one of the samples.
  await page.getByRole("menuitem", { name: "Load Left from URL…" }).click();
  const field = page.getByRole("dialog", { name: "Load Left from URL" }).getByLabel("URL");
  await expect(field).toBeFocused();
  const keys = [];
  for (const key of "https") keys.push(await sample(() => page.keyboard.press(key), ["keydown", "keypress", "keyup"]));
  await expect(field).toHaveValue("https");
  // All of it happened while the worker was still comparing.
  await expect(pending).toBeVisible();
  // The inputs are measured above; here the frames our scripts ran on their own while the worker compared.
  const busy = await longest(page, from, /click|key|pointer/);
  await page.keyboard.press("Escape");

  const summary = {
    clicks: { delay: median(clicks.map((s) => s.delay)), duration: median(clicks.map((s) => s.duration)) },
    keys: { delay: median(keys.map((s) => s.delay)), duration: median(keys.map((s) => s.duration)) },
    "longest frame of our scripts while comparing": busy,
  };
  test.info().annotations.push({ type: "answer", description: JSON.stringify(summary) });
  expect(Math.max(summary.clicks.delay, summary.clicks.duration, summary.keys.delay, summary.keys.duration), JSON.stringify(summary)).toBeLessThan(100);
  expect(busy, JSON.stringify(summary)).toBeLessThan(200);

  await expect(pending).toHaveCount(0, { timeout: 90_000 });
  expect(workers.length).toBeGreaterThan(0);
  const status = page.locator(".wk-ui-status");
  await expect(status).toContainText(/changes: \+/);
  await expect(status).toContainText("Too many differences for an exact result");
  await expect(page.locator(".wk-compare__more")).toContainText("Showing 5,000 of");
});
