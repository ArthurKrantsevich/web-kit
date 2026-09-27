import { expect, test, type Locator, type Page } from "@playwright/test";

/** Opens Text Compare and waits for hydration (Paste appears only then). */
async function open(page: Page, width = 1280, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("tools/text-compare/");
  await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const left = (page: Page) => page.getByRole("textbox", { name: /^Left/ });
const right = (page: Page) => page.getByRole("textbox", { name: /^Right/ });
const body = (page: Page) => page.locator(".wk-compare__body");
const changes = (page: Page) => body(page).getByRole("group");
const lines = (count: number, changed: Record<number, string> = {}) =>
  Array.from({ length: count }, (_, i) => changed[i + 1] ?? `line ${i + 1} of the text`).join("\n") + "\n";

type Boxes = Record<string, number[]>;

/** Place and size of the panels and of every visible button of the toolbar and the pane headers. */
function boxes(page: Page): Promise<Boxes> {
  return page.evaluate(() => {
    const found: Record<string, number[]> = {};
    const add = (key: string, element: Element) => {
      const box = element.getBoundingClientRect();
      if (box.width > 0) found[key] = [box.x + scrollX, box.y + scrollY, box.width, box.height].map((value) => Math.round(value));
    };
    const panels = {
      toolbar: ".wk-ui-editor__toolbar",
      panes: ".wk-ui-editor__panes",
      result: ".wk-compare__result",
      "result header": ".wk-compare__result > .wk-ui-pane__head",
      "result body": ".wk-compare__frame",
      status: ".wk-ui-status",
    };
    for (const [key, selector] of Object.entries(panels)) add(key, document.querySelector(selector)!);
    for (const button of document.querySelectorAll(".wk-ui-editor__toolbar button, .wk-ui-pane__head button")) {
      // "Ignore (2)" is the Ignore button whatever the count.
      add((button.getAttribute("aria-label") ?? button.textContent ?? "").replace(/ \(\d\)$/, ""), button);
    }
    return found;
  });
}

function expectSame(before: Boxes, after: Boxes, step: string): void {
  expect(Object.keys(after).sort(), step).toEqual(Object.keys(before).sort());
  for (const key of Object.keys(before)) expect([step, key, after[key]]).toEqual([step, key, before[key]]);
}

/** Drops a file made in the page (large ones would be slow to send from the test) on a side. */
async function dropFile(page: Page, side: "left" | "right", name: string, make: string, arg: unknown = null): Promise<void> {
  const transfer = await page.evaluateHandle(
    ({ name, make, arg }) => {
      const text = new Function("arg", make)(arg) as string;
      const data = new DataTransfer();
      data.items.add(new File([text], name, { type: "text/plain" }));
      return data;
    },
    { name, make, arg },
  );
  const target = page.locator(`.wk-compare__pane--${side}`);
  await target.dispatchEvent("dragenter", { dataTransfer: transfer });
  await target.dispatchEvent("dragover", { dataTransfer: transfer });
  await target.dispatchEvent("drop", { dataTransfer: transfer });
}

for (const [width, height] of [
  [1280, 800],
  [390, 844],
] as const) {
  test.describe(`text-compare at ${width} px: nothing moves`, () => {
    test("while switching the layout, the highlight and every ignore option, moving between changes and merging", async ({ page }) => {
      await open(page, width, height);
      const before = await boxes(page);
      const steps: [string, () => Promise<unknown>][] = [
        ["Inline", () => page.getByRole("button", { name: "Inline" }).click()],
        ["Characters", () => page.getByRole("button", { name: "Characters" }).click()],
        ["Side by side", () => page.getByRole("button", { name: "Side by side" }).click()],
        ["Words", () => page.getByRole("button", { name: "Words" }).click()],
        ["Next", () => page.getByRole("button", { name: "Next change" }).click()],
        ["Next again", () => page.getByRole("button", { name: "Next change" }).click()],
        ["Previous", () => page.getByRole("button", { name: "Previous change" }).click()],
      ];
      for (const [step, run] of steps) {
        await run();
        expectSame(before, await boxes(page), step);
      }
      await page.getByRole("button", { name: /^Ignore/ }).click();
      for (const option of ["Whitespace", "Case", "Blank lines", "Line endings", "Line endings", "Blank lines", "Case", "Whitespace"]) {
        await page.getByRole("menuitemcheckbox", { name: option }).click();
        expectSame(before, await boxes(page), `Ignore ${option}`);
      }
      await page.keyboard.press("Escape");
      await changes(page).first().hover();
      await changes(page).first().getByRole("button", { name: "Use right" }).click();
      await expect(changes(page)).toHaveCount(1);
      expectSame(before, await boxes(page), "merge");
    });

    test("when the result appears, changes and goes", async ({ page }) => {
      await open(page, width, height);
      await page.getByRole("button", { name: "Clear" }).click();
      const before = await boxes(page);
      await left(page).fill(lines(40));
      await right(page).fill(lines(40, { 3: "line 3 changed", 30: "line 30 changed" }));
      await expect(changes(page)).toHaveCount(2);
      expectSame(before, await boxes(page), "two changes");
      await right(page).fill(lines(40));
      await expect(body(page)).toHaveText("Texts are identical.");
      expectSame(before, await boxes(page), "identical");
    });
  });
}

test("from 320 to 1920 px the page never scrolls sideways and every header and the toolbar keep their buttons inside", async ({ page }) => {
  await open(page);
  const problems: string[] = [];
  for (let width = 320; width <= 1920; width += 40) {
    await page.setViewportSize({ width, height: 900 });
    const found = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > window.innerWidth) out.push("page scrolls sideways");
      for (const row of document.querySelectorAll(".wk-ui-editor__toolbar, .wk-compare .wk-ui-pane__head")) {
        const box = row.getBoundingClientRect();
        for (const button of row.querySelectorAll("button")) {
          const own = button.getBoundingClientRect();
          if (own.width > 0 && (own.right > box.right + 0.5 || own.left < box.left - 0.5)) out.push(`${button.getAttribute("aria-label") ?? button.textContent} sticks out`);
        }
      }
      return out;
    });
    if (found.length > 0) problems.push(`${width}px: ${found.join(", ")}`);
  }
  expect(problems).toEqual([]);
});

test("Use right copies a change into Left, keeps the result's scroll and the page's, and Ctrl+Z in Left undoes it", async ({ page }) => {
  await open(page);
  const original = lines(80);
  await left(page).fill(original);
  await right(page).fill(lines(80, { 10: "line 10 changed", 70: "line 70 changed" }));
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Show all unchanged lines" }).click();
  // The second change in view, the result scrolled well away from both of its ends.
  await changes(page).nth(1).evaluate((group) => (group.closest(".wk-compare__body")!.scrollTop = (group as HTMLElement).offsetTop - 100));
  const scroll = await body(page).evaluate((element) => element.scrollTop);
  const pageScroll = await page.evaluate(() => scrollY);
  await changes(page).nth(1).hover();
  await changes(page).nth(1).getByRole("button", { name: "Use right" }).click();
  await expect(changes(page)).toHaveCount(1);
  expect(await left(page).inputValue()).toBe(lines(80, { 70: "line 70 changed" }));
  expect([await body(page).evaluate((element) => element.scrollTop), await page.evaluate(() => scrollY)]).toEqual([scroll, pageScroll]);
  await left(page).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(left(page)).toHaveValue(original);
  await expect(changes(page)).toHaveCount(2);
});

test("merge buttons show on hover and keyboard focus, and not otherwise", async ({ page }) => {
  await open(page);
  const button = changes(page).first().getByRole("button", { name: "Use left" });
  const opacity = () => button.evaluate((element) => getComputedStyle(element).opacity);
  await page.mouse.move(0, 0);
  expect(await opacity()).toBe("0");
  await changes(page).first().hover();
  expect(await opacity()).toBe("1");
  await page.mouse.move(0, 0);
  expect(await opacity()).toBe("0");
  await button.focus();
  expect(await opacity()).toBe("1");
});

test("merge buttons are always shown on a touch screen", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto("tools/text-compare/");
  await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);
  for (const button of await body(page).locator(".wk-compare__merge").all()) {
    expect(await button.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  }
  await context.close();
});

test("Next and Previous centre the current change in the result without scrolling the page", async ({ page }) => {
  await open(page);
  await left(page).fill(lines(120));
  await right(page).fill(lines(120, { 5: "line 5 changed", 60: "line 60 changed", 115: "line 115 changed" }));
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Show all unchanged lines" }).click();
  const pageScroll = await page.evaluate(() => scrollY);
  await page.getByRole("button", { name: "Next change" }).click();
  await page.getByRole("button", { name: "Next change" }).click();
  const current = changes(page).nth(1);
  await expect(current).toHaveAttribute("data-current", "true");
  const [frame, box] = [(await page.locator(".wk-compare__frame").boundingBox())!, (await current.boundingBox())!];
  expect(Math.abs(box.y + box.height / 2 - (frame.y + frame.height / 2))).toBeLessThan(4);
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
  await expect(page.getByRole("button", { name: "Next change" })).toHaveAccessibleDescription("Next change (Alt+↓ or F7). Change 2 of 3");
});

test("a dropped file names its side; a long name ends with an ellipsis on one line, whole in its tooltip", async ({ page }) => {
  await open(page);
  const name = "quarterly-report-for-the-northern-region-final-version-2.txt";
  await dropFile(page, "left", name, "return 'a\\nb\\n';");
  await expect(left(page)).toHaveValue("a\nb\n");
  const title = page.locator(".wk-compare__pane--left .wk-compare__name");
  await expect(title).toHaveText(name);
  const [cut, head] = await title.evaluate((element) => [
    element.scrollWidth > element.clientWidth,
    Math.round(element.closest(".wk-ui-pane__head")!.getBoundingClientRect().height),
  ]);
  expect([cut, head]).toEqual([true, 44]);
  await title.hover();
  await expect(page.getByRole("tooltip")).toHaveText(name);
});

test("the result's counts are never cut, from 320 px up and with five-digit counts", async ({ page }) => {
  const cut = () =>
    page.evaluate(() => {
      const head = document.querySelector(".wk-compare__result .wk-ui-pane__head")!;
      const title = head.querySelector<HTMLElement>(".wk-ui-pane__title")!;
      const counts = head.querySelector<HTMLElement>(".wk-compare__counts")!;
      const out: string[] = [];
      if (counts.scrollWidth > counts.clientWidth) out.push(`counts ${counts.textContent} ${counts.scrollWidth} > ${counts.clientWidth}`);
      // The title is either whole or hidden from sight (the section keeps "Changes" as its name).
      if (title.clientWidth > 1 && title.scrollWidth > title.clientWidth) out.push(`title ${title.scrollWidth} > ${title.clientWidth}`);
      return `${innerWidth}: ${out.join(", ")}`;
    });
  await open(page, 320);
  expect(await cut()).toBe("320: ");
  // Groups of ten lines in reverse order, as in the 5 MB test, but small enough to compare on the page.
  const make = `const lines = Array.from({ length: 30000 }, (_, i) => "l" + (i % 3000));
    if (arg) for (let i = 0; i < lines.length; i += 10) lines.splice(i, 10, ...lines.slice(i, i + 10).reverse());
    return lines.join("\\n");`;
  await dropFile(page, "left", "left.txt", make, false);
  await dropFile(page, "right", "right.txt", make, true);
  await expect(page.locator(".wk-compare__count--changed")).toHaveText(/^~\d{5}$/, { timeout: 60_000 });
  for (const width of [320, 360, 390, 430, 640, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await cut()).toBe(`${width}: `);
  }
  await expect(page.getByRole("region", { name: "Changes" })).toBeVisible();
});

test("the status line keeps one height from 320 to 768 px, whatever it notes", async ({ page }) => {
  const widths = [320, 360, 390, 480, 600, 768];
  const heights = async () => {
    const out: number[] = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      out.push(await page.locator(".wk-ui-status").evaluate((status) => Math.round(status.getBoundingClientRect().height)));
    }
    return out;
  };
  await open(page, 320);
  const plain = await heights();
  // Every note at once: groups of lines reversed (too many differences for an exact result), CRLF against LF, no
  // line break at the end of Right, and a file that was refused.
  const make = `const lines = Array.from({ length: 3000 }, (_, i) => "row " + (i % 300));
    if (arg) for (let i = 0; i < lines.length; i += 10) lines.splice(i, 10, ...lines.slice(i, i + 10).reverse());
    return arg ? lines.join("\\n") : lines.join("\\r\\n") + "\\r\\n";`;
  await dropFile(page, "left", "left.txt", make, false);
  await dropFile(page, "right", "right.txt", make, true);
  const image = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["x"], "photo.png", { type: "image/png" }));
    return data;
  });
  for (const type of ["dragenter", "dragover", "drop"]) await page.locator(".wk-compare__pane--left").dispatchEvent(type, { dataTransfer: image });
  const status = page.locator(".wk-ui-status");
  await expect(status).toContainText("Too many differences for an exact result");
  await expect(status).toContainText("Left ends lines with CRLF, Right with LF");
  await expect(status).toContainText("Right has no newline at the end");
  await expect(status).toContainText("photo.png");
  expect(await heights()).toEqual(plain);
});

test("Download saves the unified diff as compare.patch", async ({ page }) => {
  await open(page);
  await left(page).fill("a\nb\n");
  await right(page).fill("a\nc\n");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("compare.patch");
  const stream = await file.createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  expect(text).toBe("--- left\n+++ right\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n");
});

// Chromium alone needs about 250 ms to put a typed key into a 5 MB text field on the test machine, so the measure is
// what the page answers while the worker compares: a click on a control and typing into another field.
test("two 5 MB files are compared in the worker, and meanwhile the page answers input within 200 ms", async ({ page }) => {
  test.slow();
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await open(page);
  // Groups of ten lines in reverse order: every line is on both sides, so the diff has real work to do.
  const make = `const lines = Array.from({ length: 100000 }, (_, i) => "line " + (i % 5000) + ": the quick brown fox jumps over the lazy dog");
    if (arg) for (let i = 0; i < lines.length; i += 10) lines.splice(i, 10, ...lines.slice(i, i + 10).reverse());
    return lines.join("\\n");`;
  await dropFile(page, "left", "left.txt", make, false);
  await dropFile(page, "right", "right.txt", make, true);
  const pending = page.locator(".wk-compare__pending");
  await expect(pending).toHaveText(/^Comparing \d+\.\d MB…$/, { timeout: 30_000 });
  // Let the page draw the two large fields first.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  /** Waits for the next `type` event on the element `find` returns; __answer is its time stamp to the second frame after it. */
  const listen = (find: string, type: "click" | "keydown") =>
    page.evaluate(
      ({ find, type }) => {
        const target = new Function(find)() as Element;
        (window as unknown as { __answer: Promise<number> }).__answer = new Promise((resolve) =>
          target.addEventListener(type, (event) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - event.timeStamp))), {
            once: true,
          }),
        );
      },
      { find, type },
    );
  const answered = () => page.evaluate(() => (window as unknown as { __answer: Promise<number> }).__answer);

  await listen('return [...document.querySelectorAll(".wk-ui-segment")].find((button) => button.textContent === "Characters");', "click");
  await page.getByRole("button", { name: "Characters" }).click();
  const clicked = await answered();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Load Left from URL…" }).click();
  const field = page.getByRole("dialog", { name: "Load Left from URL" }).getByLabel("URL");
  await expect(field).toBeFocused();
  await listen('return document.querySelector("dialog input[type=url]");', "keydown");
  await page.keyboard.type("h");
  const typed = await answered();
  await expect(field).toHaveValue("h");
  // All of it happened while the worker was still comparing.
  await expect(pending).toBeVisible();
  test.info().annotations.push({ type: "answer", description: `click ${Math.round(clicked)} ms, key ${Math.round(typed)} ms` });
  expect(clicked, "click on Characters").toBeLessThan(200);
  expect(typed, "a key in the URL field").toBeLessThan(200);
  await page.keyboard.press("Escape");

  await expect(pending).toHaveCount(0, { timeout: 90_000 });
  expect(workers.length).toBeGreaterThan(0);
  const status = page.locator(".wk-ui-status");
  await expect(status).toContainText(/changes: \+/);
  await expect(status).toContainText("Too many differences for an exact result");
  await expect(page.locator(".wk-compare__more")).toContainText("Showing 5,000 of");
});
