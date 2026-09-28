import { expect, test, type Page } from "@playwright/test";
import { decompressText } from "@web-kit/ui";
import { createHash } from "node:crypto";
import { hydrated } from "./hydrated";

type Boxes = Record<string, number[]>;

/** Opens a generator and waits for hydration and fonts. */
async function open(page: Page, tool: string, width = 1280, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(`tools/${tool}/`);
  await hydrated(page, tool);
  await page.evaluate(() => document.fonts.ready);
}

/** Drops the File that `make` (a function body run in the page) returns on the hash tool's Text pane. */
async function dropFile(page: Page, make: string): Promise<void> {
  const transfer = await page.evaluateHandle((code) => {
    const data = new DataTransfer();
    data.items.add(new Function(code)() as File);
    return data;
  }, make);
  const pane = page.locator(".wk-hash__pane--input");
  for (const type of ["dragenter", "dragover", "drop"]) await pane.dispatchEvent(type, { dataTransfer: transfer });
}

/** The labels of the shown options panel that are not on the line of the field after them ("<label>"). */
function strayLabels(page: Page, options: string): Promise<string[]> {
  return page.evaluate(
    (options) =>
      [...document.querySelectorAll(`${options} [data-active="true"] .wk-ui-field`)].flatMap((label) => {
        const field = label.nextElementSibling;
        // A label hidden on purpose (display: none) has no line to share.
        if (!field || label.getBoundingClientRect().width === 0) return [];
        const [a, b] = [label.getBoundingClientRect(), field.getBoundingClientRect()];
        return Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) > 4 ? [label.textContent ?? ""] : [];
      }),
    options,
  );
}

/** Place and size of the panels and of every visible button of the toolbar and the pane headers, in page coordinates. */
function boxes(page: Page, extra: Record<string, string> = {}): Promise<Boxes> {
  return page.evaluate((more) => {
    const found: Record<string, number[]> = {};
    const add = (key: string, element: Element | null) => {
      const box = element?.getBoundingClientRect();
      if (box && box.width > 0) found[key] = [box.x + scrollX, box.y + scrollY, box.width, box.height].map((value) => Math.round(value));
    };
    const panels: Record<string, string> = {
      toolbar: ".wk-ui-editor__toolbar",
      options: ".wk-ui-stack",
      panes: ".wk-ui-editor__panes",
      status: ".wk-ui-status",
      ...more,
    };
    for (const [key, selector] of Object.entries(panels)) add(key, document.querySelector(selector));
    for (const button of document.querySelectorAll(".wk-ui-editor__toolbar button, .wk-ui-pane__head button")) {
      if (getComputedStyle(button).visibility === "hidden") continue;
      add(button.getAttribute("aria-label") ?? button.textContent ?? "", button);
    }
    return found;
  }, extra);
}

function expectSame(before: Boxes, after: Boxes, step: string): void {
  expect(Object.keys(after).sort(), step).toEqual(Object.keys(before).sort());
  for (const key of Object.keys(before)) expect([step, key, after[key]]).toEqual([step, key, before[key]]);
}

async function chooseKind(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: "Kind" }).click();
  await page.getByRole("option", { name: label }).click();
  await expect(page.getByRole("button", { name: "Kind" })).toHaveAccessibleDescription(label);
}

const KIND_LABELS = ["UUID v7", "UUID v1", "UUID v6", "UUID v5", "UUID v3", "Nil UUID", "Max UUID", "ULID", "NanoID", "UUID v4"];

for (const [width, height] of [
  [1280, 800],
  [390, 844],
] as const) {
  test.describe(`at ${width} px nothing moves`, () => {
    test("uuid-generator: every kind, the namespace, the alphabet and the output", async ({ page }) => {
      await open(page, "uuid-generator", width, height);
      const before = await boxes(page);
      for (const kind of KIND_LABELS) {
        await chooseKind(page, kind);
        expectSame(before, await boxes(page), kind);
      }
      await chooseKind(page, "UUID v5");
      await page.getByRole("button", { name: "Namespace" }).click();
      await page.getByRole("option", { name: "Custom" }).click();
      expectSame(before, await boxes(page), "custom namespace");
      await chooseKind(page, "NanoID");
      await page.getByRole("button", { name: "Alphabet" }).click();
      await page.getByRole("option", { name: "Alphanumeric" }).click();
      await page.getByRole("button", { name: "JSON" }).click();
      expectSame(before, await boxes(page), "alphabet and JSON");
    });

    test("password-generator: every mode, each option and Clear", async ({ page }) => {
      await open(page, "password-generator", width, height);
      const before = await boxes(page, { estimate: ".wk-password__estimate" });
      for (const mode of ["Words", "Memorable", "PIN", "Characters"]) {
        await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: mode }).click();
        await expect(page.locator(".wk-password__item").first()).toBeVisible();
        expectSame(before, await boxes(page, { estimate: ".wk-password__estimate" }), mode);
      }
      await page.getByRole("switch", { name: "Symbols" }).click();
      await page.getByRole("switch", { name: "Exclude ambiguous" }).click();
      expectSame(before, await boxes(page, { estimate: ".wk-password__estimate" }), "sets");
      await page.getByRole("button", { name: "Clear" }).click();
      await expect(page.locator(".wk-password__item")).toHaveCount(0);
      const cleared = await boxes(page, { estimate: ".wk-password__estimate" });
      delete before.Clear;
      delete cleared.Clear;
      expectSame(before, cleared, "cleared");
    });

    test("hash-generator: HMAC, the key format, the encodings and More algorithms", async ({ page }) => {
      await open(page, "hash-generator", width, height);
      const rows = { verify: ".wk-hash__verify", md5: ".wk-hash__row:nth-child(1)", crc32: ".wk-hash__row:nth-child(6)", more: ".wk-hash__more-row" };
      // On a phone the button is below the table's fold: scrolled to first, as a user would, so the click scrolls nothing.
      await page.getByRole("button", { name: "More algorithms" }).scrollIntoViewIfNeeded();
      const before = await boxes(page, rows);
      for (const encoding of ["HEX", "Base64", "Base64url", "hex"]) {
        await page.getByRole("group", { name: "Encoding" }).getByRole("button", { name: encoding, exact: true }).click();
        expectSame(before, await boxes(page, rows), encoding);
      }
      await page.getByRole("switch", { name: "HMAC" }).click();
      await page.getByRole("textbox", { name: "HMAC key" }).fill("key");
      await expect(page.locator(".wk-hash__algorithm").nth(1)).toHaveText("HMAC-SHA-1");
      const withHmac = await boxes(page, rows);
      // The key format appears where it was kept.
      expect(Object.keys(withHmac).filter((key) => !(key in before)).sort()).toEqual(["Hex", "Text"]);
      delete withHmac.Hex;
      delete withHmac.Text;
      expectSame(before, withHmac, "HMAC on");
      await page.getByRole("switch", { name: "HMAC" }).click();
      await page.getByRole("button", { name: "More algorithms" }).click();
      await expect(page.locator(".wk-hash__algorithm", { hasText: "BLAKE3-256" })).toBeVisible();
      await expect(page.locator(".wk-hash__row").nth(14).locator(".wk-hash__value")).not.toHaveText("…");
      expectSame(before, await boxes(page, rows), "More algorithms");
    });
  });
}

test("from 320 to 1920 px the generators never scroll sideways, keep their controls inside, and switching moves nothing", async ({ page }) => {
  test.slow();
  const problems: string[] = [];
  const steps: Record<string, [string, (page: Page) => Promise<void>][]> = {
    "uuid-generator": [
      ["v5", (p) => chooseKind(p, "UUID v5")],
      ["NanoID", (p) => chooseKind(p, "NanoID")],
      ["v4", (p) => chooseKind(p, "UUID v4")],
    ],
    "password-generator": ["Words", "Memorable", "PIN", "Characters"].map((mode) => [
      mode,
      (p: Page) => p.getByRole("group", { name: "Mode" }).getByRole("button", { name: mode }).click(),
    ]),
    "hash-generator": [
      ["HMAC on", (p) => p.getByRole("switch", { name: "HMAC" }).click()],
      ["HMAC off", (p) => p.getByRole("switch", { name: "HMAC" }).click()],
    ],
  };
  for (const [tool, switches] of Object.entries(steps)) {
    await open(page, tool);
    for (let width = 320; width <= 1920; width += 40) {
      await page.setViewportSize({ width, height: 900 });
      const layout = () =>
        page.evaluate(() => {
          const out: string[] = [];
          if (document.documentElement.scrollWidth > window.innerWidth) out.push("page scrolls sideways");
          for (const row of document.querySelectorAll(".wk-ui-editor__toolbar, .wk-ui-pane__head, .wk-ui-stack")) {
            const box = row.getBoundingClientRect();
            for (const button of row.querySelectorAll('button, input, textarea, [data-active="true"] .wk-ui-switch')) {
              if (button.closest('[data-active="false"], [data-hidden="true"]')) continue;
              const own = button.getBoundingClientRect();
              if (own.width > 0 && (own.right > box.right + 0.5 || own.left < box.left - 0.5)) {
                out.push(`${button.getAttribute("aria-label") ?? button.textContent} sticks out`);
              }
            }
          }
          const panes = document.querySelector(".wk-ui-editor__panes")!.getBoundingClientRect();
          return { out, panes: `${Math.round(panes.y)} ${Math.round(panes.height)}` };
        });
      const first = await layout();
      if (first.out.length > 0) problems.push(`${tool} ${width}px: ${first.out.join(", ")}`);
      for (const [name, run] of switches) {
        await run(page);
        const next = await layout();
        if (next.out.length > 0) problems.push(`${tool} ${width}px after ${name}: ${next.out.join(", ")}`);
        if (next.panes !== first.panes) problems.push(`${tool} ${width}px: ${name} moved the panes from ${first.panes} to ${next.panes}`);
      }
    }
  }
  expect(problems).toEqual([]);
});

test.describe("uuid-generator", () => {
  test("inspects RFC 9562's v7 example, saves the IDs as uuids.json, and makes new ones with Ctrl+Enter", async ({ page }) => {
    await open(page, "uuid-generator");
    await page.getByRole("textbox", { name: "Inspect" }).fill("017F22E2-79B0-7CC3-98C4-DC0C0C07398F");
    await expect(page.locator(".wk-uuid__result")).toContainText("2022-02-22T19:22:22.000Z");
    await page.getByRole("button", { name: "JSON" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toBe("uuids.json");
    const ids = page.getByRole("textbox", { name: "IDs" });
    const before = await ids.inputValue();
    expect(JSON.parse(before)).toHaveLength(10);
    await ids.focus();
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(ids).not.toHaveValue(before);
  });
});

test("the status line keeps one height in every state, and Count keeps its label beside its field, from 320 to 1920 px", async ({ page }) => {
  test.slow();
  const states: Record<string, [string, (page: Page) => Promise<void>][]> = {
    "uuid-generator": [
      ["v4", (p) => chooseKind(p, "UUID v4")],
      ["v1", (p) => chooseKind(p, "UUID v1")],
      ["a bad namespace", async (p) => {
        await chooseKind(p, "UUID v5");
        await p.getByRole("button", { name: "Namespace" }).click();
        await p.getByRole("option", { name: "Custom" }).click();
        await p.getByRole("textbox", { name: "Namespace UUID" }).fill("certainly not a namespace uuid");
      }],
      ["NanoID with a bad alphabet", async (p) => {
        await chooseKind(p, "NanoID");
        await p.getByRole("button", { name: "Alphabet" }).click();
        await p.getByRole("option", { name: "Custom" }).click();
        await p.getByRole("textbox", { name: "Custom alphabet" }).fill("abca");
      }],
      ["v4 again", (p) => chooseKind(p, "UUID v4")],
    ],
    "password-generator": [
      ...["Words", "Memorable", "PIN", "Characters"].map((mode) => [mode, (p: Page) => p.getByRole("group", { name: "Mode" }).getByRole("button", { name: mode }).click()] as [string, (p: Page) => Promise<void>]),
      ["no sets", async (p) => {
        for (const set of ["Lowercase", "Uppercase", "Digits", "Symbols"]) await p.getByRole("switch", { name: set }).click();
      }],
      ["cleared", async (p) => {
        for (const set of ["Lowercase", "Uppercase", "Digits", "Symbols"]) await p.getByRole("switch", { name: set }).click();
        await p.getByRole("button", { name: "Clear" }).click();
      }],
    ],
    "hash-generator": [
      ["HMAC with a bad hex key", async (p) => {
        await p.getByRole("switch", { name: "HMAC" }).click();
        await p.getByRole("group", { name: "Key format" }).getByRole("button", { name: "Hex" }).click();
        await p.getByRole("textbox", { name: "HMAC key" }).fill("not hex at all, not even close");
      }],
      ["HMAC off", (p) => p.getByRole("switch", { name: "HMAC" }).click()],
      ["a file", (p) => dropFile(p, `return new File(["hello"], "a-rather-long-file-name-for-a-small-screen-2026.txt");`)],
    ],
  };
  const problems: string[] = [];
  for (const [tool, steps] of Object.entries(states)) {
    for (const width of [320, 390, 480, 640, 1024, 1920]) {
      await open(page, tool, width);
      const status = page.locator(".wk-ui-status");
      const heights = new Set([Math.round((await status.boundingBox())!.height)]);
      for (const [name, step] of steps) {
        await step(page);
        await page.waitForTimeout(50);
        heights.add(Math.round((await status.boundingBox())!.height));
        const count = page.locator(".wk-ui-editor__toolbar .wk-ui-field", { hasText: "Count" });
        if (tool !== "hash-generator" && (await page.getByRole("spinbutton", { name: "Count" }).isVisible())) {
          const [label, field] = [await count.boundingBox(), await page.getByRole("spinbutton", { name: "Count" }).boundingBox()];
          if (!label || label.width === 0 || Math.abs(label.y + label.height / 2 - (field!.y + field!.height / 2)) > 4) problems.push(`${tool} ${width} px ${name}: Count has no label beside it`);
        }
      }
      if (heights.size !== 1) problems.push(`${tool} ${width} px: status heights ${[...heights].join(", ")}`);
    }
  }
  expect(problems).toEqual([]);
});

test.describe("uuid-generator layout", () => {
  test("the Inspect field keeps its height with nothing, a result, an error and a ULID, from 320 to 1920 px", async ({ page }) => {
    await open(page, "uuid-generator", 320);
    const field = page.getByRole("textbox", { name: "Inspect" });
    const problems: string[] = [];
    for (const width of [320, 390, 480, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const heights = new Set<number>();
      for (const text of ["", "C232AB00-9414-11EC-B3C8-9F6BDECED846", "919108f7-52d1-9320-9bac-f847db4148a8", "01ARYZ6S41TSV4RRFFQ69G5FAV", ""]) {
        await field.fill(text);
        heights.add(Math.round((await field.boundingBox())!.height));
      }
      if (heights.size !== 1) problems.push(`${width} px: ${[...heights].join(", ")}`);
    }
    expect(problems).toEqual([]);
  });

  test("the options zone is one row of fields from 600 px of the tool's width and two below, as tall for every kind", async ({ page }) => {
    test.slow();
    await open(page, "uuid-generator", 320);
    const zone = page.locator(".wk-uuid__options");
    const problems: string[] = [];
    for (const width of [320, 390, 480, 600, 640, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const tool = (await page.locator(".wk-uuid").boundingBox())!.width;
      const heights = new Set<number>();
      for (const kind of KIND_LABELS) {
        await chooseKind(page, kind);
        if (kind === "UUID v5" || kind === "NanoID") {
          await page.getByRole("button", { name: kind === "NanoID" ? "Alphabet" : "Namespace" }).click();
          await page.getByRole("option", { name: "Custom" }).click();
          const rows = await zone.locator('[data-active="true"]').evaluate((panel) => {
            const tops = [...panel.querySelectorAll("input, button")].filter((node) => node.getBoundingClientRect().width > 0).map((node) => Math.round(node.getBoundingClientRect().top));
            return new Set(tops).size;
          });
          const expected = tool >= 600 ? 1 : 2;
          if (rows !== expected) problems.push(`${width} px (tool ${Math.round(tool)}) ${kind}: ${rows} rows, not ${expected}`);
        }
        heights.add(Math.round((await zone.boundingBox())!.height));
      }
      if (heights.size !== 1) problems.push(`${width} px: zone heights ${[...heights].join(", ")}`);
    }
    expect(problems).toEqual([]);
  });

  test("puts each UUID on its name's line, and the two columns scroll together", async ({ page }) => {
    await open(page, "uuid-generator", 1280);
    await chooseKind(page, "UUID v5");
    const names = page.getByRole("textbox", { name: "Names" });
    const ids = page.getByRole("textbox", { name: "IDs" });
    await names.fill(Array.from({ length: 60 }, (_, i) => (i % 7 === 3 ? "" : `host-${i}.example.com`)).join("\n"));
    const look = (node: HTMLElement) => {
      const style = getComputedStyle(node);
      return [Math.round(node.getBoundingClientRect().top), style.fontSize, style.lineHeight, style.paddingTop, style.whiteSpace].join(" ");
    };
    expect(await ids.evaluate(look)).toBe(await names.evaluate(look));
    const lines = (await ids.inputValue()).split("\n");
    expect([lines.length, lines[3], lines[4]!.length]).toEqual([60, "", 36]);
    await names.evaluate((node) => {
      node.scrollTop = 200;
      node.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => ids.evaluate((node) => node.scrollTop)).toBe(await names.evaluate((node) => node.scrollTop));
  });
});

test("below 600 px Names → IDs stacks each name above its whole UUID, with no sideways scroll, and typing moves nothing", async ({ page }) => {
  const problems: string[] = [];
  for (const width of [320, 390]) {
    await open(page, "uuid-generator", width, 844);
    await chooseKind(page, "UUID v5");
    await page.getByRole("button", { name: "Format" }).click();
    await page.getByRole("menuitemradio", { name: "URN urn:uuid:…" }).click();
    await page.keyboard.press("Escape");
    const names = page.getByRole("textbox", { name: "Names" });
    const pane = page.locator(".wk-uuid__pane--output");
    const before = await pane.boundingBox();
    const field = await names.boundingBox();
    await names.fill("www.example.com\nexample.org\n\na-rather-long-host-name.subdomain.example.com\n");
    await expect(page.locator(".wk-uuid__pairs li")).toHaveCount(3);
    const after = await pane.boundingBox();
    if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(field) !== JSON.stringify(await names.boundingBox())) problems.push(`${width} px: typing moved the pane or the field`);
    problems.push(
      ...(await pane.evaluate((node, width) => {
        const out: string[] = [];
        const box = node.getBoundingClientRect();
        for (const scroller of [node, ...node.querySelectorAll("*")]) {
          const style = getComputedStyle(scroller);
          if (style.display === "none" || scroller.tagName === "TEXTAREA") continue;
          if (scroller.scrollWidth > scroller.clientWidth + 1 && style.overflowX !== "hidden") out.push(`${width} px: ${scroller.className} scrolls sideways`);
        }
        for (const id of node.querySelectorAll(".wk-uuid__pairs code")) {
          const own = id.getBoundingClientRect();
          if (own.left < box.left - 0.5 || own.right > box.right + 0.5 || id.scrollWidth > id.clientWidth + 1) out.push(`${width} px: ${id.textContent} is cut`);
          if (!/^urn:uuid:[0-9a-f-]{36}$/.test(id.textContent ?? "")) out.push(`${width} px: not a whole UUID: ${id.textContent}`);
        }
        return out;
      }, width)),
    );
  }
  expect(problems).toEqual([]);
});

test.describe("uuid-generator options", () => {
  test("keep each option's label on the line of its field for every kind, from 320 to 1920 px", async ({ page }) => {
    await open(page, "uuid-generator", 320);
    const strays = [];
    for (const width of [320, 390, 480, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const kind of ["UUID v5", "UUID v3", "NanoID", "UUID v4"]) {
        await page.getByRole("button", { name: "Kind" }).click();
        await page.getByRole("option", { name: kind, exact: true }).click();
        for (const label of await strayLabels(page, ".wk-uuid__options")) strays.push(`${width} px ${kind}: ${label}`);
      }
      if (width >= 1024) {
        // Wide enough for NanoID's Size and Alphabet side by side, so the zone stays two rows tall.
        await chooseKind(page, "NanoID");
        const tops = await page.locator('.wk-uuid__options [data-active="true"] .wk-ui-field').evaluateAll((labels) => labels.map((label) => Math.round(label.getBoundingClientRect().top)));
        if (new Set(tops).size !== 1) strays.push(`${width} px NanoID: Size and Alphabet on different lines`);
      }
    }
    expect(strays).toEqual([]);
  });
});

test.describe("password-generator", () => {
  test("keeps passwords out of the address, storage, share links and the console", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const logged: string[] = [];
    page.on("console", (message) => logged.push(message.text()));
    await open(page, "password-generator");
    const passwords = await page.locator(".wk-password__value").allTextContents();
    expect(passwords).toHaveLength(5);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Save input in this browser" }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Share link…" }).click();
    const link = await page.getByRole("dialog", { name: "Share link" }).getByRole("textbox", { name: "Share link" }).inputValue();
    const shared = await decompressText(new URL(link).hash.replace(/^#password-generator=/, ""));
    expect(shared.ok && shared.value).toContain('"mode":"characters"');
    const storage = await page.evaluate(() => Object.keys(localStorage).map((key) => localStorage.getItem(key)).join("\n"));
    for (const password of passwords) {
      expect([shared.ok && shared.value.includes(password), storage.includes(password), page.url().includes(password), logged.some((line) => line.includes(password))]).toEqual([
        false,
        false,
        false,
        false,
      ]);
    }
  });

  test("keeps each option's label on the line of its field in every mode, from 320 to 1920 px", async ({ page }) => {
    await open(page, "password-generator", 320);
    const strays = [];
    for (const width of [320, 390, 480, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ["Characters", "Words", "Memorable", "PIN"]) {
        await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: mode }).click();
        for (const label of await strayLabels(page, ".wk-password__options")) strays.push(`${width} px ${mode}: ${label}`);
      }
    }
    expect(strays).toEqual([]);
  });

  test("never cuts the strength line, in any mode, from 320 to 1920 px", async ({ page }) => {
    await open(page, "password-generator", 320);
    const problems: string[] = [];
    for (const width of [320, 360, 390, 414, 480, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ["Characters", "Words", "Memorable", "PIN"]) {
        await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: mode }).click();
        await expect(page.locator(".wk-password__item").first()).toBeVisible();
        const cut = await page.locator(".wk-password__bits").evaluate((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1);
        if (cut) problems.push(`${width} px ${mode}: ${await page.locator(".wk-password__bits").textContent()}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("loads the word list only when Words is chosen", async ({ page }) => {
    await open(page, "password-generator");
    const scripts = () => page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.endsWith(".js")).length);
    const before = await scripts();
    await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Words" }).click();
    await expect(page.locator(".wk-password__value").first()).toHaveText(/^[a-z-]+(-[a-z-]+){5}$/);
    expect(await scripts()).toBeGreaterThan(before);
  });
});

test.describe("hash-generator", () => {
  test("Verify keeps one height for nothing, a match, no match, a suggestion and an unreadable hash, and never cuts its verdict, from 320 to 1920 px", async ({ page }) => {
    test.slow();
    await open(page, "hash-generator", 320);
    const verify = page.getByRole("textbox", { name: "Verify" });
    const verdict = page.locator(".wk-hash__verdict");
    const block = page.locator(".wk-hash__verify");
    const problems: string[] = [];
    for (const width of [320, 360, 390, 414, 480, 640, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const heights = new Set<number>();
      for (const [text, expected] of [
        ["", ""],
        ["2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", "Matches SHA-256"],
        ["00", "No algorithm matches"],
        ["3338be694f50c5f338814986cdf0686453a888b84f424d792af4b9202398f392", "No match yet; 4 more algorithms have this length"],
        ["not a hash!", "Not a hash in hex or Base64"],
      ]) {
        await verify.fill(text);
        await expect(verdict).toHaveText(expected);
        heights.add(Math.round((await block.boundingBox())!.height));
        if (await verdict.evaluate((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)) {
          problems.push(`${width} px: "${expected}" is cut`);
        }
      }
      if (heights.size !== 1) problems.push(`${width} px: heights ${[...heights].join(", ")}`);
    }
    expect(problems).toEqual([]);
  });

  test("keeps Sample, Clear and More actions on one line, HMAC on or off, from 320 to 1920 px", async ({ page }) => {
    await open(page, "hash-generator", 320);
    const problems: string[] = [];
    for (const width of [320, 360, 390, 414, 480, 640, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const hmac of ["off", "on"]) {
        if (hmac === "on") await page.getByRole("switch", { name: "HMAC" }).click();
        const tops = await Promise.all(["Sample", "Clear", "More actions"].map(async (name) => Math.round((await page.getByRole("button", { name, exact: true }).boundingBox())!.y)));
        if (new Set(tops).size !== 1) problems.push(`${width} px, HMAC ${hmac}: ${tops.join(", ")}`);
        // Below 640 px they share the HMAC switch's row (no empty band above them); the key's row comes after.
        const tool = (await page.locator(".wk-hash").boundingBox())!.width;
        if (tool < 640) {
          const middle = async (locator: ReturnType<Page["locator"]>) => {
            const box = (await locator.boundingBox())!;
            return box.y + box.height / 2;
          };
          const [toggle, sample, key] = [
            await middle(page.locator(".wk-ui-editor__toolbar .wk-ui-switch")),
            await middle(page.getByRole("button", { name: "Sample", exact: true })),
            (await page.locator(".wk-hash__hmac").boundingBox())!.y,
          ];
          if (Math.abs(toggle - sample) > 4) problems.push(`${width} px, HMAC ${hmac}: the actions are not on the HMAC row`);
          if (key < sample) problems.push(`${width} px, HMAC ${hmac}: the key row is above the actions`);
        }
        if (hmac === "on") await page.getByRole("switch", { name: "HMAC" }).click();
      }
    }
    expect(problems).toEqual([]);
  });

  test("every row keeps its height in every encoding, the main ones and the extra ones, from 320 to 1920 px", async ({ page }) => {
    test.slow();
    await open(page, "hash-generator", 320);
    await page.getByRole("button", { name: "More algorithms" }).click();
    await expect(page.locator(".wk-hash__row")).toHaveCount(17);
    await expect(page.locator(".wk-hash__value", { hasText: "…" })).toHaveCount(0);
    const encodings = page.getByRole("group", { name: "Encoding" });
    const heights = () => page.locator(".wk-hash__row").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height.toFixed(1)));
    const moved: string[] = [];
    for (const width of [320, 360, 390, 414, 480, 640, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await encodings.getByRole("button", { name: "hex", exact: true }).click();
      const hex = await heights();
      for (const encoding of ["HEX", "Base64", "Base64url"]) {
        await encodings.getByRole("button", { name: encoding, exact: true }).click();
        const now = await heights();
        now.forEach((height, index) => {
          if (height !== hex[index]) moved.push(`${width} px ${encoding} row ${index + 1}: ${hex[index]} → ${height}`);
        });
      }
    }
    expect(moved).toEqual([]);
  });

  test("a long file name never squeezes the Text pane's buttons, from 320 to 1920 px", async ({ page }) => {
    await open(page, "hash-generator", 320);
    const head = page.locator(".wk-hash__pane--input .wk-ui-pane__head");
    const buttons = () =>
      head.evaluate((row) => {
        const box = row.getBoundingClientRect();
        return [...row.querySelectorAll("button")].map((button) => {
          const own = button.getBoundingClientRect();
          return `${button.getAttribute("aria-label")} ${own.width.toFixed(1)}${own.right > box.right + 0.5 ? " sticks out" : ""}`;
        });
      });
    const widths = [320, 360, 390, 414, 480, 768, 1280, 1920];
    const text: string[][] = [];
    const problems: string[] = [];
    // The size follows its title, as in every pane; only a long file name gives way.
    const gap = () =>
      head.evaluate((row) => {
        // Where the title's text ends, not its box: a box that grows would hide the gap.
        const text = document.createRange();
        text.selectNodeContents(row.querySelector(".wk-ui-pane__title")!);
        return row.querySelector(".wk-ui-pane__meta")!.getBoundingClientRect().left - text.getBoundingClientRect().right;
      });
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      text.push(await buttons());
      if ((await gap()) > 16) problems.push(`${width} px: the size is ${Math.round(await gap())} px after "Text"`);
    }
    await dropFile(page, `return new File(["hello"], "quarterly-report-of-the-whole-department-2026-09-28-final-v3.iso");`);
    await expect(page.locator(".wk-ui-status")).toContainText("Hashed quarterly-report");
    for (const [index, width] of widths.entries()) {
      await page.setViewportSize({ width, height: 900 });
      const now = await buttons();
      if (now.join() !== text[index]!.join()) problems.push(`${width} px: ${text[index]!.join(", ")} → ${now.join(", ")}`);
      if (!(await head.locator(".wk-ui-pane__meta").isVisible())) problems.push(`${width} px: the size is hidden`);
    }
    expect(problems).toEqual([]);
  });

  test("hashes a dropped file, saves hashes.txt as BSD tagged lines, goes back to the text, and refuses a file over 512 MB", async ({ page }) => {
    await open(page, "hash-generator");
    const drop = (make: string) => dropFile(page, make);
    await drop(`return new File(["hello"], "hello.txt", { type: "text/plain" });`);
    await expect(page.locator(".wk-ui-status")).toContainText("Hashed hello.txt (5 B)");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toBe("hashes.txt");
    const sums = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"));
    expect(sums).toContain(`SHA256 (hello.txt) = ${createHash("sha256").update("hello").digest("hex")}\n`);
    expect(sums).toContain(`MD5 (hello.txt) = ${createHash("md5").update("hello").digest("hex")}\n`);
    await page.getByRole("button", { name: "Back to text" }).click();
    await expect(page.getByRole("textbox", { name: "Text" })).toHaveValue("hello");
    // 600 MB made of one 4 MB part: the browser does not allocate it.
    await drop(`const part = new Uint8Array(4 * 1024 * 1024); return new File(Array(150).fill(part), "disk.iso");`);
    await expect(page.locator(".wk-ui-status")).toContainText("File is larger than 512 MB");
  });
});
