import { compressText } from "@web-kit/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonFormatter } from "./JsonFormatter";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/json-formatter/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const inputArea = () => screen.getByLabelText("Input") as HTMLTextAreaElement;
const output = () => screen.getByLabelText("Output").textContent;
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const status = () => document.querySelector(".wk-ui-status")!.textContent;
const type = (value: string) => fireEvent.change(inputArea(), { target: { value } });

function choose(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  fireEvent.click(screen.getByRole(name === "Save input in this browser" ? "menuitemcheckbox" : "menuitem", { name }));
}

describe("JsonFormatter shortcuts", () => {
  it("Ctrl+Enter formats and Ctrl+Shift+M minifies, from inside the input", () => {
    render(<JsonFormatter initialInput='{"a":1}' />);
    fireEvent.keyDown(inputArea(), { key: "M", code: "KeyM", ctrlKey: true, shiftKey: true });
    expect(pressed("Minify")).toBe("true");
    expect(output()).toBe('{"a":1}');
    fireEvent.keyDown(inputArea(), { key: "Enter", ctrlKey: true });
    expect(pressed("Format")).toBe("true");
  });

  it("Ctrl+Shift+F makes the checked Fix all, or the only checked fix", () => {
    render(<JsonFormatter initialInput="{a: 1, b: [True,]}" />);
    fireEvent.keyDown(inputArea(), { key: "F", code: "KeyF", ctrlKey: true, shiftKey: true });
    expect(inputArea().value).toBe('{"a": 1, "b": [true]}');
    type("[1,]");
    fireEvent.keyDown(inputArea(), { key: "F", code: "KeyF", ctrlKey: true, shiftKey: true });
    expect(inputArea().value).toBe("[1]");
  });

  it("Ctrl+Shift+F says why it changed nothing", () => {
    render(<JsonFormatter initialInput="[1]" />);
    fireEvent.keyDown(inputArea(), { key: "F", code: "KeyF", ctrlKey: true, shiftKey: true });
    expect(status()).toContain("Nothing to fix");
    type('{"a": }');
    fireEvent.keyDown(inputArea(), { key: "F", code: "KeyF", ctrlKey: true, shiftKey: true });
    expect(inputArea().value).toBe('{"a": }');
    expect(status()).toContain("No checked fix for this error");
  });

  it("? lists the shortcuts", () => {
    render(<JsonFormatter initialInput="[1]" />);
    const more = screen.getByRole("button", { name: "More actions" });
    more.focus();
    fireEvent.keyDown(more, { key: "?" });
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect([...dialog.querySelectorAll("dd")].map((item) => item.textContent)).toEqual([
      "Format",
      "Minify",
      "Fix all (or the only checked fix)",
      "Show this list",
    ]);
  });
});

describe("JsonFormatter files, links and saving", () => {
  it("opens a file dropped on the input pane", async () => {
    render(<JsonFormatter initialInput="{}" />);
    const pane = inputArea().closest("section")!;
    await act(async () => {
      fireEvent.drop(pane, { dataTransfer: { types: ["Files"], files: [new File(['{"dropped":true}'], "d.json")] } });
    });
    expect(inputArea().value).toBe('{"dropped":true}');
  });

  it("does not let a dropped file replace text typed while it was read", async () => {
    let finish: (text: string) => void = () => {};
    const file = new File(["x"], "slow.json");
    vi.spyOn(file, "text").mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<JsonFormatter initialInput="{}" />);
    await act(async () => {
      fireEvent.drop(inputArea().closest("section")!, { dataTransfer: { types: ["Files"], files: [file] } });
    });
    type('{"typed":1}');
    await act(async () => finish('{"file":1}'));
    expect(inputArea().value).toBe('{"typed":1}');
    expect(status()).toContain("File not loaded: the input changed while reading");
  });

  it("opens a share link with the same input, mode, indent and Sort keys", async () => {
    const state = { input: '{"b":1,"a":2}', mode: "format", indent: 4, sortKeys: true };
    history.replaceState(null, "", `/tools/json-formatter/#json-formatter=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<JsonFormatter initialInput="[]" />);
    await waitFor(() => expect(output()).toBe('{\n    "a": 2,\n    "b": 1\n}'));
    expect(inputArea().value).toBe('{"b":1,"a":2}');
    expect((screen.getByRole("switch", { name: "Sort keys" }) as HTMLInputElement).checked).toBe(true);
  });

  it("makes a share link of the current state", async () => {
    render(<JsonFormatter initialInput='{"a":1}' />);
    fireEvent.click(screen.getByRole("button", { name: "Minify" }));
    choose("Share link…");
    const link = ((await screen.findByRole("textbox", { name: "Share link" })) as HTMLInputElement).value;
    cleanup();
    history.replaceState(null, "", new URL(link).pathname + new URL(link).hash);
    render(<JsonFormatter />);
    await waitFor(() => expect(inputArea().value).toBe('{"a":1}'));
    expect(pressed("Minify")).toBe("true");
  });

  it("ignores fields of a shared state it does not know or cannot use", async () => {
    const state = { input: 42, mode: "delete-everything", indent: 3, sortKeys: "yes" };
    history.replaceState(null, "", `/tools/json-formatter/#json-formatter=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<JsonFormatter initialInput="[1]" />);
    await waitFor(() => expect(location.hash).toBe(""));
    expect(inputArea().value).toBe("[1]");
    expect(pressed("Format")).toBe("true");
  });

  it("keeps the input in this browser only after it is turned on", async () => {
    const first = render(<JsonFormatter initialInput="[1]" />);
    type('{"kept":1}');
    expect(localStorage.length).toBe(0);
    choose("Save input in this browser");
    expect(status()).toContain("The input is saved in this browser");
    first.unmount();
    render(<JsonFormatter initialInput="[1]" />);
    await waitFor(() => expect(inputArea().value).toBe('{"kept":1}'));
  });

  it("loads the input from a URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"remote":true}')));
    render(<JsonFormatter initialInput="[1]" />);
    choose("Load from URL…");
    const dialog = screen.getByRole("dialog", { name: "Load from URL" });
    fireEvent.change(within(dialog).getByLabelText("URL"), { target: { value: "https://example.com/a.json" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Load" }));
    });
    expect(inputArea().value).toBe('{"remote":true}');
  });
});

describe("JsonFormatter and a file dropped beside the panes", () => {
  it("keeps the page and the input, and says where to drop it", async () => {
    render(<JsonFormatter initialInput="{}" />);
    const before = (screen.getByLabelText("Input") as HTMLTextAreaElement).value;
    const toolbar = document.querySelector(".wk-ui-editor__toolbar")!;
    const dataTransfer = { types: ["Files"], files: [new File(['{"dropped":true}'], "d.json")] };
    expect(fireEvent.dragOver(toolbar, { dataTransfer })).toBe(false);
    await act(async () => {
      expect(fireEvent.drop(toolbar, { dataTransfer })).toBe(false);
    });
    expect((screen.getByLabelText("Input") as HTMLTextAreaElement).value).toBe(before);
    expect(document.querySelector(".wk-ui-status")!.textContent).toContain("Drop the file on the input to open it");
  });
});
