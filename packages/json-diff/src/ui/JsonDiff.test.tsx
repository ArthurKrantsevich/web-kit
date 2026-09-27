import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonDiff } from "./JsonDiff";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const area = (name: "Left" | "Right") => screen.getByLabelText(name) as HTMLTextAreaElement;
const rows = () => within(screen.getByRole("list", { name: "Changes" })).getAllByRole("button");

function mockClipboard() {
  const writeText = vi.fn((_text: string) => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

describe("JsonDiff", () => {
  it("lists changes with a summary", () => {
    render(<JsonDiff initialLeft='{"a":1,"b":2}' initialRight='{"a":1,"b":3,"c":4}' />);
    expect(rows().map((row) => row.textContent)).toEqual(["~$.b2→3", "+$.c4"]);
    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.getByText("~1")).toBeTruthy();
  });

  it("gives each change row a clear accessible name", () => {
    render(<JsonDiff initialLeft='{"a":1,"b":2,"x":true}' initialRight='{"a":1,"b":3,"c":4}' />);
    expect(rows().map((row) => row.getAttribute("aria-label"))).toEqual([
      "Changed $.b: 2 → 3",
      "Removed $.x: true",
      "Added $.c: 4",
    ]);
    expect(screen.getByRole("button", { name: "Changed $.b: 2 → 3" })).toBe(rows()[0]);
  });

  it("announces the result in one live region that is there from the start", () => {
    render(<JsonDiff />);
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("");
    fireEvent.change(area("Left"), { target: { value: '{"a":1}' } });
    fireEvent.change(area("Right"), { target: { value: '{"a":2,"b":3}' } });
    expect(screen.getByRole("status")).toBe(live);
    expect(live.textContent).toBe("2 changes");
    fireEvent.change(area("Right"), { target: { value: '{"a":1.0}' } });
    expect(live.textContent).toBe("No differences");
    fireEvent.change(area("Right"), { target: { value: "{" } });
    expect(screen.getByRole("status")).toBe(live);
    expect(live.textContent).toMatch(/^Right: Line 1, column 2: /);
    fireEvent.change(area("Right"), { target: { value: "" } });
    expect(live.textContent).toBe("");
  });

  it("says there are no differences and copies an empty patch", async () => {
    const writeText = mockClipboard();
    render(<JsonDiff initialLeft='{"a":1.0,"b":[1]}' initialRight='{"b":[1],"a":1}' />);
    expect(screen.getByText("No differences.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy JSON Patch" }));
    });
    expect(writeText).toHaveBeenCalledWith("[]");
  });

  it("copies the JSON Patch", async () => {
    const writeText = mockClipboard();
    render(<JsonDiff initialLeft='{"n":1}' initialRight='{"n":1.50}' />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy JSON Patch" }));
    });
    expect(writeText).toHaveBeenCalledWith('[\n  {"op": "replace", "path": "/n", "value": 1.50}\n]');
  });

  it("selects the change in the right text, BOM included", () => {
    render(<JsonDiff initialLeft='{"a":1}' initialRight={'﻿{"a":22}'} />);
    fireEvent.click(rows()[0]!);
    expect([area("Right").selectionStart, area("Right").selectionEnd]).toEqual([6, 8]);
  });

  it("selects a removed value in the left text", () => {
    render(<JsonDiff initialLeft='{"a":1,"gone":true}' initialRight='{"a":1}' />);
    fireEvent.click(rows()[0]!);
    expect([area("Left").selectionStart, area("Left").selectionEnd]).toEqual([14, 18]);
  });

  it("names the side of a parse error", () => {
    render(<JsonDiff initialLeft="{}" initialRight="{" />);
    expect(screen.getByRole("status").textContent).toMatch(/^Right: Line 1, column 2: /);
  });

  it("matches arrays by key when asked and says when only the order differs", () => {
    render(<JsonDiff initialLeft='[{"id":1,"v":1},{"id":2,"v":2}]' initialRight='[{"id":2,"v":2},{"id":1,"v":1}]' />);
    expect(rows()).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "By key" }));
    expect(screen.getByRole("textbox", { name: "Array key" })).toBeTruthy();
    expect(screen.getByText("Only the order of array items differs.")).toBeTruthy();
  });

  it("compares numbers as written when asked", () => {
    render(<JsonDiff initialLeft='{"n":1.0}' initialRight='{"n":1}' />);
    expect(screen.getByText("No differences.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "As written" }));
    expect(rows()).toHaveLength(1);
  });

  it("swaps, clears and loads a sample", () => {
    render(<JsonDiff initialLeft='{"l":1}' initialRight='{"r":1}' />);
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect([area("Left").value, area("Right").value]).toEqual(['{"r":1}', '{"l":1}']);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect([area("Left").value, area("Right").value]).toEqual(["", ""]);
    expect(screen.getByText("Paste JSON into both sides to compare.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sample" }));
    expect(rows().length).toBeGreaterThan(0);
  });

  // Renders 1,000 rows; under a full parallel `pnpm verify` this takes about 4.5 s, so it gets its own timeout.
  it("lists at most 1,000 changes and says how many more there are", { timeout: 20_000 }, () => {
    const left = `[${Array.from({ length: 1500 }, (_, i) => i).join(",")}]`;
    const right = `[${Array.from({ length: 1500 }, (_, i) => i + 1).join(",")}]`;
    render(<JsonDiff initialLeft={left} initialRight={right} />);
    expect(rows()).toHaveLength(1000);
    expect(screen.getByText("500 more changes are not listed. Copy JSON Patch includes all of them.")).toBeTruthy();
  });
});


function openInto(name: string, file: File) {
  return act(async () => {
    // The hidden file input: the Open file button has the same name.
    fireEvent.change(screen.getByLabelText(name, { selector: 'input[type="file"]' }), { target: { files: [file] } });
  });
}

const tooltipOf = (element: HTMLElement) =>
  element
    .getAttribute("aria-describedby")
    ?.split(" ")
    .map((id) => document.getElementById(id)?.textContent)
    .join(" ");

describe("JsonDiff actions", () => {
  it("opens a file into Left and into Right", async () => {
    render(<JsonDiff />);
    await openInto("Open file into Left", new File(['{"a":1}'], "left.json"));
    await openInto("Open file into Right", new File(['﻿{"a":2}'], "right.json"));
    expect([area("Left").value, area("Right").value]).toEqual(['{"a":1}', '{"a":2}']);
    expect(rows().map((row) => row.textContent)).toEqual(["~$.a1→2"]);
  });

  it("says when a file is too large and forgets it on the next edit", async () => {
    render(<JsonDiff initialLeft="{}" />);
    const big = new File(["x"], "big.json");
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    await openInto("Open file into Left", big);
    expect(area("Left").value).toBe("{}");
    expect(screen.getByText("File is larger than 10 MB")).toBeTruthy();
    fireEvent.change(area("Right"), { target: { value: "[]" } });
    expect(screen.queryByText("File is larger than 10 MB")).toBeNull();
  });

  it("puts Open file, then Paste in each side's header, both with their labels", () => {
    Object.defineProperty(navigator, "clipboard", { value: { readText: () => Promise.resolve("") }, configurable: true });
    render(<JsonDiff />);
    const head = screen.getByLabelText("Left", { selector: "textarea" }).closest("section")!.firstElementChild as HTMLElement;
    const buttons = within(head).getAllByRole("button");
    expect(buttons.map((button) => [button.getAttribute("aria-label"), button.textContent])).toEqual([
      ["Open file into Left", "Open file"],
      ["Paste into Left", "Paste"],
    ]);
  });

  it("has Paste's place in the server HTML already, hidden, so nothing moves when it appears", () => {
    const page = document.createElement("div");
    page.innerHTML = renderToString(<JsonDiff />);
    const heads = [...page.querySelectorAll('[data-pane="input"] > .wk-ui-pane__head')];
    expect(heads.map((head) => [...head.querySelectorAll("[data-action]")].map((button) => button.getAttribute("data-action")))).toEqual([
      ["open", "paste"],
      ["open", "paste"],
    ]);
    for (const head of heads) expect(head.querySelector('[data-action="paste"]')!.className).toContain("wk-ui-button--pending");
  });

  it("puts Swap, Sample, Clear and More in the toolbar, Download and Copy JSON Patch over the changes", () => {
    const { container } = render(<JsonDiff />);
    const actions = (row: Element | null) => [...(row?.querySelectorAll("[data-action]") ?? [])].map((button) => button.getAttribute("data-action"));
    expect(actions(screen.getByRole("group", { name: "Options" }))).toEqual(["custom", "sample", "clear", "more"]);
    expect(actions(container.querySelector('[data-pane="output"] > .wk-ui-pane__head'))).toEqual(["download", "copy"]);
  });

  it("takes at most 64 characters as the array key", () => {
    render(<JsonDiff />);
    expect((screen.getByRole("textbox", { name: "Array key" }) as HTMLInputElement).maxLength).toBe(64);
  });

  it("pastes into one side", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { readText: () => Promise.resolve("[1]") }, configurable: true });
    render(<JsonDiff initialLeft="[0]" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Paste into Right" }));
    });
    expect([area("Left").value, area("Right").value]).toEqual(["[0]", "[1]"]);
  });

  it("downloads the JSON Patch as patch.json", async () => {
    const saved: { name: string; type: string }[] = [];
    let blob: Blob | undefined;
    Object.defineProperty(URL, "createObjectURL", {
      value: (value: Blob) => {
        blob = value;
        return "blob:test";
      },
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, type: blob?.type ?? "" });
    });
    render(<JsonDiff initialLeft='{"n":1}' initialRight='{"n":2}' />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(saved).toEqual([{ name: "patch.json", type: "application/json" }]);
    expect(await blob!.text()).toBe('[\n  {"op": "replace", "path": "/n", "value": 2}\n]');
  });

  it("disables Download and Copy JSON Patch until both sides are filled", () => {
    render(<JsonDiff initialLeft="{}" />);
    for (const name of ["Download", "Copy JSON Patch"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("keeps the Array key field in place, disabled until By key", () => {
    render(<JsonDiff />);
    const key = screen.getByRole("textbox", { name: "Array key" }) as HTMLInputElement;
    expect(key.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "By key" }));
    expect(key.disabled).toBe(false);
  });

  it("status line: nothing yet, parse error, same JSON, changes", () => {
    const status = () => document.querySelector(".wk-ui-status")!.textContent;
    const { rerender } = render(<JsonDiff key="a" />);
    expect(status()).toBe("Nothing to compare yet.");
    rerender(<JsonDiff key="b" initialLeft="{" initialRight="{}" />);
    expect(status()).toBe("Left is not valid JSON");
    rerender(<JsonDiff key="c" initialLeft='{"a":1.0}' initialRight='{"a":1}' />);
    expect(status()).toBe("Same JSON");
    rerender(<JsonDiff key="d" initialLeft='{"a":1}' initialRight='{"a":2,"b":3}' />);
    expect(status()).toBe("2 changes");
  });

  it("every action says what it does", () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: () => Promise.resolve(""), writeText: () => Promise.resolve() },
      configurable: true,
    });
    render(<JsonDiff />);
    const expected: [string, string][] = [
      ["By index", "Compare array items at the same position"],
      ["By key", "Match object items by a key, in any order"],
      ["By value", "1.0 and 1 are the same number"],
      ["As written", "1.0 and 1 differ because they are written differently"],
      ["Swap", "Swap Left and Right"],
      ["Sample", "Replace both sides with an example"],
      ["Clear", "Empty both sides"],
      ["Open file into Left", "Open a .json or .txt file into Left (up to 10 MB), or drop it on Left"],
      ["Paste into Left", "Paste from the clipboard into Left"],
      ["Open file into Right", "Open a .json or .txt file into Right (up to 10 MB), or drop it on Right"],
      ["Paste into Right", "Paste from the clipboard into Right"],
      ["Download", "Save the JSON Patch as patch.json"],
      ["Copy JSON Patch", "Copy RFC 6902 operations that turn Left into Right"],
      ["More actions", "Load from a URL, share, save, keyboard shortcuts"],
    ];
    for (const [name, tip] of expected) expect([name, tooltipOf(screen.getByRole("button", { name }))]).toEqual([name, tip]);
  });
});

describe("JsonDiff before hydration", () => {
  it("renders its text fields read-only in the server HTML, so nothing typed before hydration is silently lost", () => {
    const html = renderToString(<JsonDiff />);
    const areas = html.match(/<textarea[^>]*>/g) ?? [];
    expect(areas.length).toBeGreaterThan(0);
    for (const area of areas) expect(area).toContain('readOnly=""');
    const { container } = render(<JsonDiff />);
    for (const area of container.querySelectorAll("textarea")) expect(area.readOnly).toBe(false);
  });
});
