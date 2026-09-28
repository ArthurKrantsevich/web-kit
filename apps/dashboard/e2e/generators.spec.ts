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

/** The labels of the shown options panel that are not on the line of the field after them ("<label>"). */
function strayLabels(page: Page, options: string): Promise<string[]> {
  return page.evaluate(
    (options) =>
      [...document.querySelectorAll(`${options} [data-active="true"] .wk-ui-field`)].flatMap((label) => {
        const field = label.nextElementSibling;
        if (!field) return [];
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
  test("Verify keeps one height for nothing, a match, no match, a suggestion and an unreadable hash", async ({ page }) => {
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
    ] as const) {
      await open(page, "hash-generator", width, height);
      const verify = page.getByRole("textbox", { name: "Verify" });
      const verdict = page.locator(".wk-hash__verdict");
      const block = page.locator(".wk-hash__verify");
      const seen: string[] = [];
      for (const [text, expected] of [
        ["", "Paste a hash to check it"],
        ["2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", "Matches SHA-256"],
        ["00", "No algorithm matches"],
        ["3338be694f50c5f338814986cdf0686453a888b84f424d792af4b9202398f392", "SHA3-256"],
        ["not a hash!", "Not a hash in hex or Base64"],
      ]) {
        await verify.fill(text);
        await expect(verdict).toContainText(expected);
        seen.push(`${expected}: ${Math.round((await block.boundingBox())!.height)}`);
      }
      expect(new Set(seen.map((entry) => entry.split(": ")[1])).size, seen.join(", ")).toBe(1);
    }
  });

  test("hashes a dropped file, saves hashes.txt in sha256sum form, goes back to the text, and refuses a file over 512 MB", async ({ page }) => {
    await open(page, "hash-generator");
    const drop = async (make: string) => {
      const transfer = await page.evaluateHandle((code) => {
        const data = new DataTransfer();
        data.items.add(new Function(code)() as File);
        return data;
      }, make);
      const pane = page.locator(".wk-hash__pane--input");
      for (const type of ["dragenter", "dragover", "drop"]) await pane.dispatchEvent(type, { dataTransfer: transfer });
    };
    await drop(`return new File(["hello"], "hello.txt", { type: "text/plain" });`);
    await expect(page.locator(".wk-ui-status")).toContainText("Hashed hello.txt (5 B)");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toBe("hashes.txt");
    const sums = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"));
    expect(sums).toContain(`# SHA-256\n${createHash("sha256").update("hello").digest("hex")}  hello.txt\n`);
    expect(sums).toContain(`# MD5\n${createHash("md5").update("hello").digest("hex")}  hello.txt\n`);
    await page.getByRole("button", { name: "Back to text" }).click();
    await expect(page.getByRole("textbox", { name: "Text" })).toHaveValue("hello");
    // 600 MB made of one 4 MB part: the browser does not allocate it.
    await drop(`const part = new Uint8Array(4 * 1024 * 1024); return new File(Array(150).fill(part), "disk.iso");`);
    await expect(page.locator(".wk-ui-status")).toContainText("File is larger than 512 MB");
  });
});
