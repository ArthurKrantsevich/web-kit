import { parseJson } from "@web-kit/json-core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonTree, type JsonTreeProps } from "./JsonTree";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SRC = '{"users": [{"name": "Ann"}, {"name": "Bob"}], "ok": true}';

function props(text: string = SRC, extra: Partial<JsonTreeProps> = {}): JsonTreeProps {
  const result = parseJson(text);
  if (!result.ok) throw new Error(result.error.message);
  return { root: result.value, source: text, ...extra };
}

const items = () => screen.getAllByRole("treeitem").map((item) => item.textContent);
const selected = () => screen.getByRole("treeitem", { selected: true }).textContent;
const key = (name: string) => fireEvent.keyDown(screen.getByRole("tree"), { key: name });

describe("JsonTree", () => {
  it("expands two levels at first", () => {
    render(<JsonTree {...props()} />);
    expect(items()).toEqual(["{2}", "users: [2]", "0: {1}", "1: {1}", "ok: true"]);
    expect(selected()).toBe("{2}");
  });

  it("works with the keyboard", () => {
    render(<JsonTree {...props()} />);
    key("ArrowDown");
    expect(selected()).toBe("users: [2]");
    key("ArrowLeft");
    expect(items()).toEqual(["{2}", "users: [2]", "ok: true"]);
    key("ArrowRight");
    expect(items()).toHaveLength(5);
    key("ArrowRight");
    expect(selected()).toBe("0: {1}");
    key("Enter");
    expect(items()).toContain('name: "Ann"');
    key("ArrowLeft");
    key("ArrowLeft");
    expect(selected()).toBe("users: [2]");
    key("End");
    expect(selected()).toBe("ok: true");
    key("Home");
    expect(selected()).toBe("{2}");
  });

  it("toggles a container by clicking its arrow", () => {
    const { container } = render(<JsonTree {...props()} />);
    fireEvent.click(container.querySelectorAll(".wk-tree__toggle")[1]!);
    expect(items()).toEqual(["{2}", "users: [2]", "ok: true"]);
  });

  it("shows and copies the path and the original value text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<JsonTree {...props(SRC, { initialDepth: Infinity })} />);
    fireEvent.click(screen.getByRole("treeitem", { name: 'name: "Bob"' }));
    expect(screen.getByLabelText("Selected path").textContent).toBe("$.users[1].name");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy path" })));
    expect(writeText).toHaveBeenLastCalledWith("$.users[1].name");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy value" })));
    expect(writeText).toHaveBeenLastCalledWith('"Bob"');
  });

  it("reports the node range for Show in input", () => {
    const onShowInInput = vi.fn();
    render(<JsonTree {...props(SRC, { onShowInInput })} />);
    fireEvent.click(screen.getByRole("treeitem", { name: "ok: true" }));
    fireEvent.click(screen.getByRole("button", { name: "Show in input" }));
    expect(onShowInInput).toHaveBeenCalledWith(SRC.indexOf("true"), SRC.indexOf("true") + 4);
  });

  it("pages very long arrays", () => {
    render(<JsonTree {...props(JSON.stringify(Array.from({ length: 1200 }, (_, i) => i)))} />);
    expect(items()).toHaveLength(502);
    fireEvent.click(screen.getByRole("treeitem", { name: "Show 500 more (700 left)" }));
    expect(items()).toHaveLength(1002);
    expect(screen.getByRole("treeitem", { name: "Show 200 more (200 left)" })).toBeTruthy();
  });

  it("stops Expand all at the row budget and says so", () => {
    render(<JsonTree {...props(JSON.stringify(Array.from({ length: 20 }, () => Array.from({ length: 500 }, (_, i) => i))))} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByRole("status").textContent).toBe(
      "Expanded as much as fits in 5,000 rows. Expand the rest one by one.",
    );
    expect(items().length).toBeLessThanOrEqual(5000);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(items()).toEqual(["[20]"]);
  });

  it("resets when the data changes", () => {
    const { rerender } = render(<JsonTree {...props()} />);
    key("End");
    rerender(<JsonTree {...props("[1, 2]")} />);
    expect(items()).toEqual(["[2]", "0: 1", "1: 2"]);
    expect(selected()).toBe("[2]");
  });
});
