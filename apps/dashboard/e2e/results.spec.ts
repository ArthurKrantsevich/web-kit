import { expect, test, type Page } from "@playwright/test";

// The results area of Diff, Validator and Text Compare keeps its height while the result flips between "all good",
// one result and a short error (or many changes), so the page under it does not jump as the user types.
async function heights(page: Page, area: string, states: [string, () => Promise<void>, string][]) {
  const seen: string[] = [];
  for (const [name, set, expected] of states) {
    await set();
    await expect(page.locator(area)).toContainText(expected);
    seen.push(`${name}: ${Math.round((await page.locator(area).boundingBox())!.height)}`);
  }
  return seen;
}

for (const width of [1280, 390]) {
  test(`json-diff at ${width} px: the results area has one height for no differences, one change and an error`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("tools/json-diff/");
    const left = page.getByRole("textbox", { name: "Left", exact: true });
    const right = page.getByRole("textbox", { name: "Right", exact: true });
    const seen = await heights(page, ".wk-diff__result", [
      ["same", async () => (await left.fill('{"a": 1}'), await right.fill('{"a": 1}')), "No differences."],
      ["one change", () => right.fill('{"a": 2}'), "$.a"],
      ["error", () => right.fill('{"a": '), "Show in Right"],
      ["same again", () => right.fill('{"a": 1}'), "No differences."],
    ]);
    expect(new Set(seen.map((entry) => entry.split(": ")[1])).size, seen.join(", ")).toBe(1);
  });

  test(`text-compare at ${width} px: the result has one height when empty, identical, changed, folded and identical when ignoring`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("tools/text-compare/");
    await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
    const left = page.getByRole("textbox", { name: "Left", exact: true });
    const right = page.getByRole("textbox", { name: "Right", exact: true });
    const lines = (count: number, change = -1) => Array.from({ length: count }, (_, i) => (i === change ? `line ${i} changed` : `line ${i}`)).join("\n");
    const seen = await heights(page, ".wk-compare__result", [
      ["empty", () => page.getByRole("button", { name: "Clear" }).click(), "Paste or drop two texts to compare."],
      ["identical", async () => (await left.fill("same"), await right.fill("same")), "Texts are identical."],
      ["one change", () => right.fill("same!"), "same!"],
      ["folded", async () => (await left.fill(lines(200)), await right.fill(lines(200, 100))), "Show 97 unchanged lines"],
      ["identical when ignoring", async () => (await left.fill("A b"), await right.fill("a b"), await page.getByRole("button", { name: /^Ignore/ }).click(), await page.getByRole("menuitemcheckbox", { name: "Case" }).click(), await page.keyboard.press("Escape")), "Identical when ignoring case and line endings."],
    ]);
    expect(new Set(seen.map((entry) => entry.split(": ")[1])).size, seen.join(", ")).toBe(1);
  });

  test(`json-schema-validator at ${width} px: the results area has one height for valid, one error and a parse error`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("tools/json-schema-validator/");
    const data = page.getByRole("textbox", { name: "Data", exact: true });
    const schema = page.getByRole("textbox", { name: "Schema", exact: true });
    const seen = await heights(page, ".wk-schema__result", [
      ["valid", async () => (await schema.fill('{"type": "integer"}'), await data.fill("1")), "The data matches the schema."],
      ["one error", () => data.fill('"x"'), "1 error"],
      ["parse error", () => data.fill("{"), "Show in Data"],
      ["valid again", () => data.fill("2"), "The data matches the schema."],
    ]);
    expect(new Set(seen.map((entry) => entry.split(": ")[1])).size, seen.join(", ")).toBe(1);
  });
}
