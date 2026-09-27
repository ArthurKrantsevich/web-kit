import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonFormatter } from "./JsonFormatter";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

/** Puts back a global property a test replaced, or removes it when there was none. */
function restore(target: object, key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else delete (target as Record<string, unknown>)[key];
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  restore(navigator, "clipboard", originalClipboard);
  restore(URL, "createObjectURL", originalCreateObjectURL);
  restore(URL, "revokeObjectURL", originalRevokeObjectURL);
});

const inputArea = () => screen.getByLabelText("Input") as HTMLTextAreaElement;
const output = () => screen.getByLabelText("Output").textContent;
const type = (value: string) => fireEvent.change(inputArea(), { target: { value } });

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("JsonFormatter", () => {
  it("formats input as you type", () => {
    render(<JsonFormatter />);
    type('{"a":1}');
    expect(output()).toBe('{\n  "a": 1\n}');
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the error with line and column", () => {
    render(<JsonFormatter />);
    type('{"a": }');
    expect(screen.getByRole("status").textContent).toBe("Line 1, column 7: Unexpected character '}'");
    expect(screen.queryByLabelText("Output")).toBeNull();
  });

  it("shows where the error is", () => {
    render(<JsonFormatter />);
    type('{"a": }');
    expect(screen.getByRole("region", { name: "Error location" }).textContent).toBe('> 1 | {"a": }\n    |       ^');
  });

  it("moves the cursor to the error", () => {
    render(<JsonFormatter />);
    type('{"a": }');
    fireEvent.click(screen.getByRole("button", { name: "Show in input" }));
    expect(document.activeElement).toBe(inputArea());
    expect([inputArea().selectionStart, inputArea().selectionEnd]).toEqual([6, 7]);
  });

  it("selects a whole emoji when the error is on it", () => {
    render(<JsonFormatter />);
    type("[😀]");
    fireEvent.click(screen.getByRole("button", { name: "Show in input" }));
    expect([inputArea().selectionStart, inputArea().selectionEnd]).toEqual([1, 3]);
  });

  it("switches to a tree and shows stats", () => {
    render(<JsonFormatter />);
    type('{"a":[1,2]}');
    expect(screen.getByText(/· 2 numbers ·/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.getAllByRole("treeitem").map((item) => item.textContent)).toEqual(["{1}", "a: [2]", "0: 1", "1: 2"]);
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    expect(output()).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
  });

  it("selects a tree node in the input, even after a BOM", () => {
    render(<JsonFormatter />);
    type('﻿{"a": 12}');
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    fireEvent.click(screen.getByRole("treeitem", { name: "a: 12" }));
    fireEvent.click(screen.getByRole("button", { name: "Show in input" }));
    expect([inputArea().selectionStart, inputArea().selectionEnd]).toEqual([7, 9]);
  });

  it("asks to fix the error before showing a tree", () => {
    render(<JsonFormatter />);
    type("[1,");
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.getByRole("status").textContent).toMatch(/^Line 1, column \d+: /);
  });

  it("keeps the tree and its selection while typing", () => {
    render(<JsonFormatter />);
    type('{"a": 1, "b": 2}');
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    fireEvent.click(screen.getByRole("treeitem", { name: "b: 2" }));
    type('{"a": 1, "b": 23}');
    expect(screen.getByRole("treeitem", { selected: true }).getAttribute("aria-label")).toBe("b: 23");
  });

  it("sorts keys without touching numbers", () => {
    render(<JsonFormatter />);
    type('{"b":12345678901234567890,"a":{"d":2,"c":3}}');
    fireEvent.click(screen.getByLabelText("Sort keys"));
    expect(output()).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 12345678901234567890\n}');
    fireEvent.click(screen.getByRole("button", { name: "Minify" }));
    expect(output()).toBe('{"a":{"c":3,"d":2},"b":12345678901234567890}');
  });

  it("escapes any text, even invalid JSON, without an error box", () => {
    render(<JsonFormatter />);
    type('say "hi" [1,');
    fireEvent.click(screen.getByRole("button", { name: "Escape" }));
    expect(output()).toBe('"say \\"hi\\" [1,"');
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("list", { name: "Suggested fixes" })).toBeNull();
    expect((screen.getByLabelText("Sort keys") as HTMLInputElement).disabled).toBe(true);
  });

  it("unescapes a string that contains JSON and formats it", () => {
    render(<JsonFormatter />);
    fireEvent.click(screen.getByRole("button", { name: "Unescape" }));
    type('"{\\"a\\":[1]}"');
    expect(output()).toBe('{\n  "a": [\n    1\n  ]\n}');
    expect(screen.getByText("The string contains JSON; shown formatted.")).toBeTruthy();
  });

  it("unescapes plain text and says it is not JSON", () => {
    render(<JsonFormatter />);
    fireEvent.click(screen.getByRole("button", { name: "Unescape" }));
    type('"hello\\nworld"');
    expect(output()).toBe("hello\nworld");
    expect(screen.getByText("The string is not JSON; shown as plain text.")).toBeTruthy();
  });

  it("reads escaped JSON without quotes and says so", () => {
    render(<JsonFormatter />);
    fireEvent.click(screen.getByRole("button", { name: "Unescape" }));
    type('{\\"a\\":1}');
    expect(output()).toBe('{\n  "a": 1\n}');
    expect(screen.getByText("No surrounding quotes: read the input as the inside of a JSON string.")).toBeTruthy();
  });

  it("explains what Unescape needs and offers no fixes", () => {
    render(<JsonFormatter />);
    fireEvent.click(screen.getByRole("button", { name: "Unescape" }));
    type('{"a":1,}');
    expect(screen.getByRole("status").textContent).toBe("Line 1, column 1: Unescape needs a JSON string literal");
    expect(screen.queryByRole("list", { name: "Suggested fixes" })).toBeNull();
    type('{"a":1}');
    expect(screen.getByRole("status").textContent).toBe("Line 1, column 1: Unescape needs a JSON string literal");
  });

  it("escapes whitespace-only text and drops a BOM", () => {
    render(<JsonFormatter />);
    fireEvent.click(screen.getByRole("button", { name: "Escape" }));
    type("  ");
    expect(output()).toBe('"  "');
    type("\uFEFFa");
    expect(output()).toBe('"a"');
  });

  it("sorts keys of unescaped JSON too", () => {
    render(<JsonFormatter />);
    fireEvent.click(screen.getByRole("button", { name: "Unescape" }));
    fireEvent.click(screen.getByLabelText("Sort keys"));
    type('"{\\"b\\":1,\\"a\\":2}"');
    expect(output()).toBe('{\n  "a": 2,\n  "b": 1\n}');
  });

  it("says when the unescaped value is another JSON string", () => {
    render(<JsonFormatter />);
    fireEvent.click(screen.getByRole("button", { name: "Unescape" }));
    type('"\\"{\\\\\\"a\\\\\\":1}\\""');
    expect(screen.getByText("The value is itself a JSON string; unescape it again to go one level deeper.")).toBeTruthy();
  });

  it("says Valid JSON with stats when the unescaped text is JSON", () => {
    const { container } = render(<JsonFormatter />);
    fireEvent.click(screen.getByRole("button", { name: "Unescape" }));
    type('"{\\"a\\":[1]}"');
    const status = container.querySelector(".wk-ui-status")!;
    expect(status.className).toContain("wk-ui-status--valid");
    expect(status.textContent).toBe(
      "Valid JSON9 B · 1 key · depth 2 · 1 object · 1 array · 0 strings · 1 number · 0 booleans · 0 null values · longest array 1",
    );
    type('"hello"');
    expect(status.textContent).toBe("5 B");
  });

  it("announces the note politely", () => {
    render(<JsonFormatter />);
    fireEvent.click(screen.getByRole("button", { name: "Unescape" }));
    type('"x"');
    expect(screen.getByText("The string is not JSON; shown as plain text.").getAttribute("aria-live")).toBe("polite");
  });

  it("explains that the tree needs Format or Minify", () => {
    render(<JsonFormatter />);
    type('{"a":1}');
    fireEvent.click(screen.getByRole("button", { name: "Escape" }));
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.getByText("The tree is available in Format and Minify modes.")).toBeTruthy();
  });

  it("applies a suggested fix", () => {
    render(<JsonFormatter />);
    type("[1,2,]");
    fireEvent.click(screen.getByRole("button", { name: "Apply: Remove trailing comma" }));
    expect(inputArea().value).toBe("[1,2]");
    expect(output()).toBe("[\n  1,\n  2\n]");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("fixes everything at once when every step is verified", () => {
    render(<JsonFormatter />);
    type("{a: 1, b: [True,]}");
    fireEvent.click(screen.getByRole("button", { name: "Fix all (4 changes)" }));
    expect(inputArea().value).toBe('{"a": 1, "b": [true]}');
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("skips Fix all for large input so typing stays fast", () => {
    render(<JsonFormatter />);
    type("[" + "1,".repeat(12_000) + "True, None]");
    expect(screen.getByRole("button", { name: "Apply: Replace True with true" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Fix all/ })).toBeNull();
  });

  it("offers no fix it cannot verify", () => {
    render(<JsonFormatter />);
    type('{"a": @}');
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Suggested fixes" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Fix all/ })).toBeNull();
  });

  it("shows nothing for empty input", () => {
    render(<JsonFormatter />);
    type("   ");
    expect(screen.queryByRole("status")).toBeNull();
    expect(output()).toBe("");
  });

  it("minifies and switches indentation", () => {
    render(<JsonFormatter initialInput='{"a":1}' />);
    fireEvent.click(screen.getByRole("button", { name: "Indent" }));
    fireEvent.click(screen.getByRole("option", { name: "Tab" }));
    expect(output()).toBe('{\n\t"a": 1\n}');
    fireEvent.click(screen.getByRole("button", { name: "Minify" }));
    expect(output()).toBe('{"a":1}');
    expect((screen.getByRole("button", { name: "Indent" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("copies the output", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<JsonFormatter initialInput="[1]" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
    expect(writeText).toHaveBeenCalledWith("[\n  1\n]");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("reports a blocked clipboard instead of throwing", async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error("NotAllowedError")));
    render(<JsonFormatter initialInput="[1]" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeTruthy();
  });
});

function openFile(file: File) {
  return act(async () => {
    fireEvent.change(screen.getByLabelText("Open file"), { target: { files: [file] } });
  });
}

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

describe("JsonFormatter editor", () => {
  it("groups the modes and marks the current one", () => {
    render(<JsonFormatter />);
    const modes = screen.getByRole("group", { name: "Mode" });
    expect(within(modes).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Format",
      "Minify",
      "Escape",
      "Unescape",
    ]);
    fireEvent.click(within(modes).getByRole("button", { name: "Minify" }));
    expect(within(modes).getByRole("button", { name: "Minify" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(modes).getByRole("button", { name: "Format" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("Clear empties the input; Sample loads valid JSON", () => {
    render(<JsonFormatter initialInput='{"a":1}' />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(inputArea().value).toBe("");
    expect(screen.getByText("Paste JSON, open a file or load a sample.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sample" }));
    expect(() => JSON.parse(inputArea().value)).not.toThrow();
    expect(screen.getByText("Valid JSON")).toBeTruthy();
  });

  it("opens a file into the input and replaces an error with its text", async () => {
    render(<JsonFormatter initialInput='{"a": }' />);
    expect(screen.getByRole("status")).toBeTruthy();
    await openFile(new File(['{"b":2}'], "data.json", { type: "application/json" }));
    expect(inputArea().value).toBe('{"b":2}');
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("list", { name: "Suggested fixes" })).toBeNull();
  });

  it("refuses files over 10 MB and drops the message on the next edit", async () => {
    render(<JsonFormatter initialInput="{}" />);
    const big = new File(["x"], "big.json");
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    await openFile(big);
    expect(inputArea().value).toBe("{}");
    expect(screen.getByText("File is larger than 10 MB")).toBeTruthy();
    type("[]");
    expect(screen.queryByText("File is larger than 10 MB")).toBeNull();
  });

  it("shows a message alone on empty input, without the empty-input hint", async () => {
    const { container } = render(<JsonFormatter />);
    const big = new File(["x"], "big.json");
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    await openFile(big);
    expect(container.querySelector(".wk-ui-status")?.textContent).toBe("File is larger than 10 MB");
  });

  it("does not replace text typed while a file was being read", async () => {
    let finish: (text: string) => void = () => {};
    const file = new File(['{"file":1}'], "slow.json");
    vi.spyOn(file, "text").mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { container } = render(<JsonFormatter initialInput="{}" />);
    await openFile(file);
    type('{"typed":1}');
    await act(async () => finish('{"file":1}'));
    expect(inputArea().value).toBe('{"typed":1}');
    expect(container.querySelector(".wk-ui-status")?.textContent).toContain(
      "File not loaded: the input changed while reading",
    );
  });

  it("keeps the file opened last when an earlier, slower read finishes after it", async () => {
    let finishA: (text: string) => void = () => {};
    let finishB: (text: string) => void = () => {};
    const a = new File(['{"a":1}'], "a.json");
    const b = new File(['{"b":1}'], "b.json");
    vi.spyOn(a, "text").mockReturnValue(new Promise((resolve) => (finishA = resolve)));
    vi.spyOn(b, "text").mockReturnValue(new Promise((resolve) => (finishB = resolve)));
    render(<JsonFormatter initialInput="{}" />);
    await openFile(a);
    await openFile(b);
    await act(async () => finishB('{"b":1}'));
    expect(inputArea().value).toBe('{"b":1}');
    await act(async () => finishA('{"a":1}'));
    expect(inputArea().value).toBe('{"b":1}');
  });

  it("loads a slow file when the input did not change meanwhile", async () => {
    let finish: (text: string) => void = () => {};
    const file = new File(['{"file":1}'], "slow.json");
    vi.spyOn(file, "text").mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<JsonFormatter initialInput="{}" />);
    await openFile(file);
    await act(async () => finish('{"file":1}'));
    expect(inputArea().value).toBe('{"file":1}');
  });

  it("pastes from the clipboard", async () => {
    setClipboard({ readText: () => Promise.resolve('{"p":1}') });
    render(<JsonFormatter />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Paste" }));
    });
    expect(inputArea().value).toBe('{"p":1}');
  });

  it("reports a refused clipboard", async () => {
    setClipboard({ readText: () => Promise.reject(new Error("denied")) });
    render(<JsonFormatter />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Paste" }));
    });
    expect(screen.getByText("Clipboard access was denied")).toBeTruthy();
  });

  it("hides Paste without a clipboard reader", () => {
    setClipboard({ writeText: () => Promise.resolve() });
    render(<JsonFormatter />);
    expect(screen.queryByRole("button", { name: "Paste" })).toBeNull();
  });

  it("disables To input, Download and Copy without an output", () => {
    render(<JsonFormatter />);
    for (const name of ["Use output as input", "Download", "Copy"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("To input puts the output into the input", () => {
    render(<JsonFormatter initialInput='{"a":1}' />);
    fireEvent.click(screen.getByRole("button", { name: "Use output as input" }));
    expect(inputArea().value).toBe('{\n  "a": 1\n}');
  });

  it("names the downloaded file by mode and by what Unescape found", () => {
    const names: string[] = [];
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:test", configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    render(<JsonFormatter initialInput={String.raw`"a\nb"`} />);
    const download = () => fireEvent.click(screen.getByRole("button", { name: "Download" }));
    download();
    fireEvent.click(screen.getByRole("button", { name: "Minify" }));
    download();
    fireEvent.click(screen.getByRole("button", { name: "Escape" }));
    download();
    fireEvent.click(screen.getByRole("button", { name: "Unescape" }));
    download();
    type(String.raw`"{\"x\":1}"`);
    download();
    expect(names).toEqual(["formatted.json", "minified.json", "escaped.txt", "unescaped.txt", "unescaped.json"]);
  });

  it("shows an error in the output pane instead of the output, in Text and Tree", () => {
    render(<JsonFormatter initialInput='{"a": }' />);
    expect(screen.queryByLabelText("Output")).toBeNull();
    expect(screen.getByText("Not valid JSON")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.getByRole("status").textContent).toBe("Line 1, column 7: Unexpected character '}'");
  });

  it("replaces the error with the tree after Fix all", () => {
    render(<JsonFormatter initialInput="{a: 1, b: [True,]}" />);
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    fireEvent.click(screen.getByRole("button", { name: /^Fix all/ }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("tree", { name: "JSON tree" })).toBeTruthy();
  });

  it("status line: valid, error and empty, without a status role", () => {
    render(<JsonFormatter initialInput='{"a":1}' />);
    expect(screen.getByText("Valid JSON")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    type('{"a": }');
    expect(screen.getByText("Error at 1:7")).toBeTruthy();
    type("");
    expect(screen.getByText("Paste JSON, open a file or load a sample.")).toBeTruthy();
  });

  it("shows the input size in UTF-8 bytes", () => {
    const { container } = render(<JsonFormatter initialInput='"é"' />);
    expect(container.querySelector(".wk-json__size")?.textContent).toBe("4 B");
  });

  it("downloads through a connected link and revokes the URL only later", () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    let connected = false;
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:test", configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      connected = this.isConnected;
    });
    render(<JsonFormatter initialInput='{"a":1}' />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(connected).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith("blob:test");
    vi.useRealTimers();
  });
});

const tooltipOf = (element: HTMLElement) =>
  element
    .getAttribute("aria-describedby")
    ?.split(" ")
    .map((id) => document.getElementById(id)?.textContent)
    .join(" ");

describe("JsonFormatter tooltips", () => {
  it("every action says what it does", () => {
    setClipboard({ readText: () => Promise.resolve(""), writeText: () => Promise.resolve() });
    render(<JsonFormatter initialInput="[1]" />);
    const expected: [string, string][] = [
      ["Format", "Pretty-print with the chosen indent"],
      ["Minify", "Remove all whitespace"],
      ["Escape", "Turn any text into a JSON string literal"],
      ["Unescape", "Turn a JSON string literal back into its text"],
      ["Open file", "Open a .json or .txt file (up to 10 MB)"],
      ["Sample", "Replace the input with an example"],
      ["Clear", "Empty the input"],
      ["Paste", "Paste from the clipboard"],
      ["Text", "Show the output as highlighted text"],
      ["Tree", "Browse, search and query the output as a tree"],
      ["Use output as input", "Replace the input with the output"],
      ["Download", "Save the output as formatted.json"],
      ["Copy", "Copy the output to the clipboard"],
    ];
    for (const [name, tip] of expected) expect([name, tooltipOf(screen.getByRole("button", { name }))]).toEqual([name, tip]);
  });

  it("the error's actions say what they do", () => {
    render(<JsonFormatter initialInput="{a: 1, b: [True,]}" />);
    expect(tooltipOf(screen.getByRole("button", { name: "Show in input" }))).toBe("Select the error in the input");
    expect(tooltipOf(screen.getByRole("button", { name: "Fix all (4 changes)" }))).toBe(
      "Make all 4 changes; the result was checked to be valid JSON",
    );
    type("[1,]");
    expect(tooltipOf(screen.getByRole("button", { name: /^Apply: / }))).toBe("Replace the input with this fix; the result was checked");
  });

  it("names the download in the Download tooltip", () => {
    render(<JsonFormatter initialInput="[1]" />);
    fireEvent.click(screen.getByRole("button", { name: "Escape" }));
    expect(tooltipOf(screen.getByRole("button", { name: "Download" }))).toBe("Save the output as escaped.txt");
  });
});

describe("JsonFormatter test isolation", () => {
  // Runs last: earlier tests replaced these globals, and each must have been put back.
  it("leaves navigator.clipboard and the object URL functions as they were", () => {
    expect(Object.getOwnPropertyDescriptor(navigator, "clipboard")).toEqual(originalClipboard);
    expect(Object.getOwnPropertyDescriptor(URL, "createObjectURL")).toEqual(originalCreateObjectURL);
    expect(Object.getOwnPropertyDescriptor(URL, "revokeObjectURL")).toEqual(originalRevokeObjectURL);
  });
});
