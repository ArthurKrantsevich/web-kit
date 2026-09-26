import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
});
