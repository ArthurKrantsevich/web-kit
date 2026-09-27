import { expect, test, type Page } from "@playwright/test";
import { ACTIONS, type ActionId, type ActionPlace } from "@web-kit/ui";

const TOOLS = ["json-formatter", "json-convert", "json-diff", "json-schema-validator", "text-compare"];

interface Found {
  row: number;
  places: ActionPlace[];
  action: string;
  name: string;
  label: string;
  labelShown: boolean;
  icon: boolean;
  quiet: boolean;
  crowded: boolean;
}

/** Every button of the toolbar and of the pane headers: shared actions with what they look like, and the rest. */
function rows(page: Page): Promise<{ found: Found[]; unlisted: string[] }> {
  return page.evaluate(() => {
    const found: Found[] = [];
    const unlisted: string[] = [];
    const heads = [
      ...[...document.querySelectorAll(".wk-ui-editor__toolbar")].map((row) => ({ row, places: ["toolbar"] })),
      ...[...document.querySelectorAll("[data-pane] > .wk-ui-pane__head")].map((row) => ({
        row,
        places: row.parentElement!.getAttribute("data-pane")!.split(" "),
      })),
    ];
    heads.forEach(({ row, places }, index) => {
      for (const button of row.querySelectorAll("button")) {
        const name = button.getAttribute("aria-label") ?? button.textContent ?? "";
        const action = button.getAttribute("data-action");
        if (action === null) {
          // Segments, selects and the Validator's outline "Generate schema from data" are the tool's own controls.
          if (button.matches(".wk-ui-button--quiet")) unlisted.push(name);
          continue;
        }
        const label = button.querySelector(".wk-ui-button__label, .wk-ui-sr-only");
        const box = label?.getBoundingClientRect();
        found.push({
          row: index,
          places: places as ActionPlace[],
          action,
          name,
          // The label of Copy is the one shown now: "Copy", "Copied" or "Copy failed".
          label: (label?.querySelector('[data-shown="true"]') ?? label)?.textContent ?? "",
          labelShown: !!box && box.width > 1 && !label!.classList.contains("wk-ui-sr-only"),
          icon: button.querySelector("svg.wk-ui-icon") !== null,
          quiet: button.classList.contains("wk-ui-button--quiet"),
          // A crowded pane (four labelled actions, or a long size label) shows icons only below 620 px.
          crowded: row.parentElement!.classList.contains("wk-ui-pane--crowded"),
        });
      }
    });
    return { found, unlisted };
  });
}

for (const [width, height] of [
  [1280, 800],
  [390, 844],
] as const) {
  for (const tool of TOOLS) {
    test(`${tool} at ${width} px: every shared action looks, sits and is ordered as the ACTIONS table says`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`tools/${tool}/`);
      await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
      const { found, unlisted } = await rows(page);
      expect(unlisted, "quiet buttons that are not in the table").toEqual([]);
      // The editor is narrower than 640 px only on the phone: there every label hides and the icon stays.
      const wide = width === 1280;
      for (const button of found) {
        const spec = ACTIONS[button.action as ActionId];
        expect(spec, `${button.name}: data-action="${button.action}" is not in ACTIONS`).toBeDefined();
        expect(
          [button.name, button.places.some((place) => spec.places.includes(place))],
          `${button.name} sits in ${button.places.join("/")}, ACTIONS says ${spec.places.join(" or ")}`,
        ).toEqual([button.name, true]);
        expect([button.name, button.icon, button.quiet]).toEqual([button.name, true, true]);
        expect([button.name, button.labelShown]).toEqual([button.name, wide && !spec.iconOnly && !button.crowded]);
        // The tool's own action names itself; a shared one shows the table's label ("Copy JSON Patch" says what it copies).
        if (button.action !== "custom") expect(button.label.startsWith(spec.label), `${button.name}: "${button.label}"`).toBe(true);
      }
      for (const row of new Set(found.map((button) => button.row))) {
        const order = found.filter((button) => button.row === row).map((button) => ACTIONS[button.action as ActionId].order);
        expect(order, `row ${row}: ${found.filter((button) => button.row === row).map((b) => b.action)}`).toEqual(
          [...order].sort((a, b) => a - b),
        );
      }
      // Every input pane starts with Open file, then Paste; the toolbar ends with Sample, Clear and More actions.
      const inputs = new Set(found.filter((button) => button.places.includes("input")).map((button) => button.row));
      expect(inputs.size).toBeGreaterThan(0);
      for (const row of inputs) {
        expect(found.filter((button) => button.row === row).slice(0, 2).map((button) => button.action)).toEqual(["open", "paste"]);
      }
      expect(found.filter((button) => button.places.includes("toolbar")).slice(-3).map((button) => button.action)).toEqual([
        "sample",
        "clear",
        "more",
      ]);
      expect(found.filter((button) => button.action === "download")).toHaveLength(1);
      expect(found.filter((button) => button.action === "copy")).toHaveLength(1);
    });
  }
}

test.describe("option fields", () => {
  /** Width of the toolbar and of the field, and whether the page scrolls sideways. */
  const measure = (page: Page, field: string) =>
    page.evaluate((name) => {
      const input = document.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;
      return {
        toolbar: Math.round(document.querySelector(".wk-ui-editor__toolbar")!.getBoundingClientRect().width),
        field: Math.round(input.getBoundingClientRect().width),
        pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
        length: input.value.length,
      };
    }, field);

  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    for (const [tool, field, prepare] of [
      ["json-diff", "Array key", (page: Page) => page.getByRole("button", { name: "By key" }).click()],
      ["json-convert", "Root element", (page: Page) => page.getByRole("button", { name: "Convert to" }).click().then(() => page.getByRole("option", { name: "XML" }).click())],
      ["json-convert", "Type name", (page: Page) => page.getByRole("button", { name: "Convert to" }).click().then(() => page.getByRole("option", { name: "TypeScript" }).click())],
    ] as const) {
      test(`${field} at ${width} px: 200 typed characters stop at 64 and move nothing`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto(`tools/${tool}/`);
        await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
        await prepare(page);
        const before = await measure(page, field);
        expect(before.field, "8 to 12 rem").toBeGreaterThanOrEqual(128);
        expect(before.field).toBeLessThanOrEqual(192);
        await page.getByRole("textbox", { name: field }).fill("x".repeat(200));
        const after = await measure(page, field);
        expect(after).toEqual({ ...before, length: 64 });
        expect(after.pageScrolls).toBe(false);
      });
    }
  }

  test("the Load from URL field takes a long address and stays as wide as the dialog", async ({ page }) => {
    await page.goto("tools/json-formatter/");
    await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Load from URL…" }).click();
    const dialog = page.getByRole("dialog", { name: "Load from URL" });
    const field = dialog.getByLabel("URL");
    const width = async () => Math.round((await field.boundingBox())!.width);
    const before = await width();
    await field.fill(`https://example.com/${"a".repeat(3000)}`);
    expect((await field.inputValue()).length).toBe(2048);
    expect(await width()).toBe(before);
  });
});

test("a long line wraps in the input and scrolls inside the output, never the page", async ({ page }) => {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("tools/json-formatter/");
    await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
    const input = page.getByLabel("Input", { exact: true });
    const panes = await page.locator(".wk-ui-editor__panes").evaluate((element) => Math.round(element.getBoundingClientRect().width));
    await input.fill(`["${"long ".repeat(400)}"]`);
    await page.getByRole("button", { name: "Minify" }).click();
    await expect(page.getByLabel("Output", { exact: true })).toContainText("long long");
    const sizes = await page.evaluate(() => {
      const area = document.querySelector<HTMLTextAreaElement>(".wk-json__pane--input textarea")!;
      const body = document.querySelector(".wk-json__body")!;
      return {
        inputWraps: area.scrollWidth <= area.clientWidth,
        outputScrolls: body.scrollWidth > body.clientWidth,
        panes: Math.round(document.querySelector(".wk-ui-editor__panes")!.getBoundingClientRect().width),
        pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(sizes).toEqual({ inputWraps: true, outputScrolls: true, panes, pageScrolls: false });
  }
});
