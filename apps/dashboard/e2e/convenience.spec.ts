import { expect, test, type Locator, type Page } from "@playwright/test";

/** Opens the "More actions" menu of the tool and picks an item. */
async function choose(page: Page, item: string): Promise<void> {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menu", { name: "More actions" }).getByText(item, { exact: true }).click();
}

/** Drags a file over `target` and drops it, the way the browser does it for a file from the desktop. */
async function dropFile(page: Page, target: Locator, name: string, text: string, type = "application/json"): Promise<void> {
  const transfer = await page.evaluateHandle(
    ({ name, text, type }) => {
      const data = new DataTransfer();
      data.items.add(new File([text], name, { type }));
      return data;
    },
    { name, text, type },
  );
  await target.dispatchEvent("dragenter", { dataTransfer: transfer });
  await target.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(target.locator(".wk-ui-pane__drop")).toBeVisible();
  await target.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(target.locator(".wk-ui-pane__drop")).toBeHidden();
}

const status = (page: Page) => page.locator(".wk-ui-status");

/** Opens a tool page and waits for hydration (Paste appears only then), so nothing typed before it is lost. */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
}

test.describe("drag and drop", () => {
  test("a file dropped on the formatter's input opens in it", async ({ page }) => {
    await open(page, "tools/json-formatter/");
    const input = page.getByLabel("Input", { exact: true });
    await dropFile(page, page.locator(".wk-json__pane--input"), "dropped.json", '{"dropped":true}');
    await expect(input).toHaveValue('{"dropped":true}');
    await expect(page.getByLabel("Output", { exact: true })).toHaveText('{\n  "dropped": true\n}');
  });

  test("a file dropped on Right opens there, and an image is refused", async ({ page }) => {
    await open(page, "tools/json-diff/");
    await dropFile(page, page.locator(".wk-diff__pane--right"), "right.json", '{"version":"9"}');
    await expect(page.getByLabel("Right", { exact: true })).toHaveValue('{"version":"9"}');
    await dropFile(page, page.locator(".wk-diff__pane--left"), "photo.png", "x", "image/png");
    await expect(status(page)).toContainText('Cannot open "photo.png": choose a .json or .txt file');
  });
});

test.describe("share links", () => {
  test("a share link opens the same data and options, and the hash leaves the address bar", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, "tools/json-formatter/");
    await page.getByLabel("Input", { exact: true }).fill('{"b":[1,2],"a":"é 😀"}');
    await page.getByRole("button", { name: "Minify" }).click();
    await page.getByLabel("Sort keys").check();
    await choose(page, "Share link…");
    const dialog = page.getByRole("dialog", { name: "Share link" });
    await expect(dialog).toContainText("Anyone with the link can see the data.");
    const link = await dialog.getByRole("textbox", { name: "Share link" }).inputValue();
    expect(link).toMatch(/\/web-kit\/tools\/json-formatter\/#json-formatter=[A-Za-z0-9_-]+$/);
    await dialog.getByRole("button", { name: "Copy link" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

    const other = await context.newPage();
    const requests: string[] = [];
    other.on("request", (request) => requests.push(request.url()));
    await other.goto(link);
    await expect(other.getByLabel("Input", { exact: true })).toHaveValue('{"b":[1,2],"a":"é 😀"}');
    await expect(other.getByRole("button", { name: "Minify" })).toHaveAttribute("aria-pressed", "true");
    await expect(other.getByLabel("Output", { exact: true })).toHaveText('{"a":"é 😀","b":[1,2]}');
    await expect(other).toHaveURL(/\/tools\/json-formatter\/$/);
    // The data is in the hash, which is never sent: no request carries it.
    expect(requests.filter((url) => url.includes("json-formatter="))).toEqual([]);
  });

  test("Diff shares both sides and its options", async ({ page, context }) => {
    await open(page, "tools/json-diff/");
    await page.getByLabel("Left", { exact: true }).fill('[{"id":1,"v":1}]');
    await page.getByLabel("Right", { exact: true }).fill('[{"id":1,"v":2}]');
    await page.getByRole("button", { name: "By key" }).click();
    await choose(page, "Share link…");
    const link = await page.getByRole("textbox", { name: "Share link" }).inputValue();
    const other = await context.newPage();
    await other.goto(link);
    await expect(other.getByLabel("Right", { exact: true })).toHaveValue('[{"id":1,"v":2}]');
    await expect(other.getByRole("button", { name: "By key" })).toHaveAttribute("aria-pressed", "true");
    await expect(other.getByRole("list", { name: "Changes" })).toContainText("$[0].v");
  });

  test("a long link warns that messengers may cut it", async ({ page }) => {
    await open(page, "tools/json-formatter/");
    const noise = await page.evaluate(() => {
      let seed = 7;
      return JSON.stringify(Array.from({ length: 2000 }, () => (seed = (seed * 48271) % 2147483647).toString(36)));
    });
    await page.getByLabel("Input", { exact: true }).fill(noise);
    await choose(page, "Share link…");
    await expect(page.getByRole("dialog", { name: "Share link" })).toContainText(
      "Messengers and email may cut links longer than 8,000 characters.",
    );
  });
});

test.describe("saved input", () => {
  test("is off by default, survives reloads once on, and is deleted when turned off", async ({ page }) => {
    await open(page, "tools/json-formatter/");
    const input = page.getByLabel("Input", { exact: true });
    const demo = await input.inputValue();
    await input.fill('{"kept":1}');
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("wk:json-formatter")))).toEqual([]);

    await choose(page, "Save input in this browser");
    await expect(status(page)).toContainText("The input is saved in this browser");
    await input.fill('{"kept":2}');
    await page.reload();
    await expect(input).toHaveValue('{"kept":2}');

    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Save input in this browser" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("menuitemcheckbox", { name: "Save input in this browser" }).click();
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("wk:")))).toEqual([]);
    await page.reload();
    await expect(input).toHaveValue(demo);
  });
});

test.describe("keyboard", () => {
  test("Ctrl+Enter, Ctrl+Shift+M and Ctrl+Shift+F work in the formatter's input", async ({ page }) => {
    await open(page, "tools/json-formatter/");
    const input = page.getByLabel("Input", { exact: true });
    await input.fill('{"a": 1}');
    await input.press("Control+Shift+KeyM");
    await expect(page.getByRole("button", { name: "Minify" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Output", { exact: true })).toHaveText('{"a":1}');
    await input.press("Control+Enter");
    await expect(page.getByRole("button", { name: "Format" })).toHaveAttribute("aria-pressed", "true");
    await input.fill("{a: 1, b: [True,]}");
    await input.press("Control+Shift+KeyF");
    await expect(input).toHaveValue('{"a": 1, "b": [true]}');
  });

  test("? outside the fields shows the shortcuts in a modal dialog that keeps focus and gives it back", async ({ page }) => {
    await open(page, "tools/json-diff/");
    const input = page.getByLabel("Left", { exact: true });
    await input.press("?");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const sample = page.getByRole("button", { name: "Sample" });
    await sample.focus();
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Swap Left and Right");
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(sample).toBeFocused();
  });

  test("browser shortcuts are left alone", async ({ page }) => {
    await open(page, "tools/json-formatter/");
    const input = page.getByLabel("Input", { exact: true });
    const prevented = await input.evaluate((element) => {
      const results: boolean[] = [];
      for (const init of [
        { key: "s", code: "KeyS", ctrlKey: true },
        { key: "f", code: "KeyF", ctrlKey: true },
        { key: "M", code: "KeyM", ctrlKey: true, shiftKey: true, altKey: true },
      ]) {
        const event = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        results.push(event.defaultPrevented);
      }
      return results;
    });
    expect(prevented).toEqual([false, false, false]);
  });
});

test.describe("the worker", () => {
  /** About 5.4 MB of JSON, set straight into the field (typing it would take minutes). */
  async function fillBig(page: Page, seed: string): Promise<void> {
    await page.getByLabel("Input", { exact: true }).evaluate((area: HTMLTextAreaElement, seed) => {
      const text = JSON.stringify(Array.from({ length: 120_000 }, (_, id) => ({ id, name: `${seed} ${id}`, tags: ["a", "b"] })));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, text);
      area.dispatchEvent(new Event("input", { bubbles: true }));
    }, seed);
  }

  test("formats more than 1 MB off the main thread, says so, and a new input cancels the running job", async ({ page }) => {
    // Hold the worker script back, so the job is still running when the next input arrives.
    await page.route("**/_next/static/chunks/turbopack-worker-*.js", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    const workers: { closed: boolean }[] = [];
    page.on("worker", (worker) => {
      const entry = { closed: false };
      workers.push(entry);
      worker.on("close", () => (entry.closed = true));
    });
    await open(page, "tools/json-formatter/");
    await fillBig(page, "first");
    await expect(status(page)).toHaveText(/^Formatting \d+\.\d MB…$/);
    await expect(page.locator(".wk-json__body")).toContainText("Formatting");
    await fillBig(page, "second");
    await expect(status(page)).toContainText("Valid JSON", { timeout: 20_000 });
    await expect(page.getByLabel("Output", { exact: true })).toContainText('"name": "second 0"');
    expect(workers.length).toBe(2);
    await expect.poll(() => workers[0]!.closed).toBe(true);
    expect(workers[1]!.closed).toBe(false);
  });

  test("works on the page with a visible warning when the worker cannot load", async ({ page }) => {
    await page.route("**/_next/static/chunks/turbopack-worker-*.js", (route) => route.abort());
    await open(page, "tools/json-formatter/");
    await fillBig(page, "fallback");
    await expect(status(page)).toContainText("The background worker could not start", { timeout: 20_000 });
    await expect(status(page)).toContainText("Valid JSON");
  });
});

test.describe("loading from a URL", () => {
  const URL = "https://data.example.test/users.json";

  test("loads the input straight from the browser, without cookies", async ({ page, context }) => {
    await context.addCookies([{ name: "session", value: "secret", domain: "data.example.test", path: "/", secure: true }]);
    let credentials: string | undefined;
    await page.route(URL, async (route) => {
      credentials = route.request().headers()["cookie"];
      await route.fulfill({ body: '[{"id":1}]', headers: { "access-control-allow-origin": "*", "content-type": "application/json" } });
    });
    await open(page, "tools/json-formatter/");
    await choose(page, "Load from URL…");
    const dialog = page.getByRole("dialog", { name: "Load from URL" });
    await expect(dialog.getByLabel("URL")).toBeFocused();
    await dialog.getByLabel("URL").fill(URL);
    await dialog.getByRole("button", { name: "Load" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Input", { exact: true })).toHaveValue('[{"id":1}]');
    expect(credentials).toBeUndefined();
  });

  test("says when the server does not allow reading from the browser", async ({ page }) => {
    await open(page, "tools/json-schema-validator/");
    // The same test server under another origin: it sends no CORS headers, so the browser refuses to show the body.
    const otherOrigin = new globalThis.URL(page.url()).origin.replace("localhost", "127.0.0.1");
    await choose(page, "Load Data from URL…");
    const dialog = page.getByRole("dialog", { name: "Load Data from URL" });
    await dialog.getByLabel("URL").fill(`${otherOrigin}/web-kit/404.html`);
    await dialog.getByRole("button", { name: "Load" }).click();
    await expect(dialog.getByRole("status")).toHaveText(
      "Could not load: the server does not allow reading from the browser, or it cannot be reached",
    );
  });

  test("refuses a response over 10 MB and anything but http: and https:", async ({ page }) => {
    await page.route(URL, (route) =>
      route.fulfill({ body: "x".repeat(10 * 1024 * 1024 + 1), headers: { "access-control-allow-origin": "*" } }),
    );
    await open(page, "tools/json-convert/");
    await choose(page, "Load from URL…");
    const dialog = page.getByRole("dialog", { name: "Load from URL" });
    await dialog.getByLabel("URL").fill(URL);
    await dialog.getByRole("button", { name: "Load" }).click();
    await expect(dialog.getByRole("status")).toHaveText("File is larger than 10 MB");
    await dialog.getByLabel("URL").fill("javascript:alert(1)");
    await dialog.getByRole("button", { name: "Load" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Only http: and https: addresses can be loaded");
  });
});
