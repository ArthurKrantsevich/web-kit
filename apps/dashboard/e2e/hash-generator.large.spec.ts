import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

// Hash Generator on a 200 MB file with every algorithm. It runs in the "large" project, after the others and alone.

interface Frame {
  start: number;
  duration: number;
  ours: number;
}

/** Opens Hash Generator, waits for hydration and records long animation frames with the time our scripts took in them. */
async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: Frame[] = [];
    Object.assign(window, { __frames: frames });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as (PerformanceEntry & { scripts: { sourceURL: string; duration: number }[] })[]) {
        const ours = entry.scripts.filter((script) => script.sourceURL.includes("/_next/")).reduce((sum, script) => sum + script.duration, 0);
        frames.push({ start: entry.startTime, duration: entry.duration, ours });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("tools/hash-generator/");
  await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
}

const PART = 4 * 1024 * 1024;
const PARTS = 50;
/** One 4 MB part, the same in the page and here: byte i is (i × 31 + 7) mod 256. */
const part = () => Uint8Array.from({ length: PART }, (_, i) => (i * 31 + 7) % 256);

test("a 200 MB file is hashed with every algorithm in workers, with progress, and the page is never busy for 200 ms", async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  await page.getByRole("button", { name: "More algorithms" }).click();
  await expect(page.locator(".wk-hash__row")).toHaveCount(17);
  await expect(page.locator(".wk-hash__row").nth(16).locator(".wk-hash__value")).not.toHaveText("…");

  const transfer = await page.evaluateHandle(
    ({ size, parts }) => {
      const chunk = Uint8Array.from({ length: size }, (_, i) => (i * 31 + 7) % 256);
      const data = new DataTransfer();
      data.items.add(new File(Array(parts).fill(chunk), "big.bin"));
      return data;
    },
    { size: PART, parts: PARTS },
  );
  const from = await page.evaluate(() => performance.now());
  const pane = page.locator(".wk-hash__pane--input");
  for (const type of ["dragenter", "dragover", "drop"]) await pane.dispatchEvent(type, { dataTransfer: transfer });

  const status = page.locator(".wk-ui-status [role='status']");
  await expect(status).toHaveText(/^Hashing big\.bin… ([1-9]|[1-9]\d)%$/, { timeout: 60_000 });
  const started = Date.now();
  await expect(status).toHaveText("Hashed big.bin (200.0 MB)", { timeout: 240_000 });
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const until = await page.evaluate(() => performance.now());

  const frames = await page.evaluate(({ from, until }) => (window as unknown as { __frames: Frame[] }).__frames.filter((frame) => frame.start >= from && frame.start <= until), { from, until });
  const longest = Math.round(Math.max(0, ...frames.map((frame) => frame.ours)));
  test.info().annotations.push({ type: "200 MB, 17 algorithms", description: JSON.stringify({ seconds, longestFrameOfOurScripts: longest }) });
  expect(longest).toBeLessThan(200);

  const chunk = part();
  const expected = (algorithm: string) => {
    const hash = createHash(algorithm);
    for (let i = 0; i < PARTS; i++) hash.update(chunk);
    return hash.digest("hex");
  };
  const value = (name: string) => page.locator(".wk-hash__row", { has: page.locator(".wk-hash__algorithm", { hasText: new RegExp(`^${name}$`) }) }).locator(".wk-hash__value");
  await expect(value("MD5")).toHaveText(expected("md5"));
  await expect(value("SHA-256")).toHaveText(expected("sha256"));
  await expect(value("SHA3-256")).toHaveText(expected("sha3-256"));
  await expect(value("BLAKE2b-512")).toHaveText(expected("blake2b512"));
  await expect(value("RIPEMD-160")).toHaveText(expected("ripemd160"));
});
