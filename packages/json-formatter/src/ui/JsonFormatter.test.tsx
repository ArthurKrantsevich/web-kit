import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonFormatter } from "./JsonFormatter";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    expect(output()).toBe("");
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
    expect(screen.getByText("Fix the error to see the tree.")).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("Indent"), { target: { value: "tab" } });
    expect(output()).toBe('{\n\t"a": 1\n}');
    fireEvent.click(screen.getByRole("button", { name: "Minify" }));
    expect(output()).toBe('{"a":1}');
    expect((screen.getByLabelText("Indent") as HTMLSelectElement).disabled).toBe(true);
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
