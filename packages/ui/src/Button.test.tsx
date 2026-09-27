import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, CopyButton } from "./Button";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

const live = () => document.querySelector('[aria-live="polite"]')!;

describe("Button", () => {
  it("defaults to a quiet button of type button", () => {
    render(<Button>Clear</Button>);
    const button = screen.getByRole("button", { name: "Clear" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("wk-ui-button--quiet");
  });

  it("keeps the label as the accessible name when only the icon is visible", () => {
    render(
      <Button icon="paste" iconOnly variant="outline">
        Paste into Left
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Paste into Left" });
    expect(button.className).toContain("wk-ui-button--icon-only");
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("passes other props to the button", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled aria-label="Undo generate" onClick={onClick}>
        Undo
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Undo generate" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("wk-ui-button--primary");
  });
});

describe("Button refs", () => {
  it("passes a ref to the button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} tooltip="Clear the input">
        Clear
      </Button>,
    );
    expect(ref.current).toBe(screen.getByRole("button", { name: "Clear" }));
  });

  it("is a forwardRef component, so React 18 (which drops `ref` from function props) passes the ref too", () => {
    expect((Button as unknown as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for("react.forward_ref"));
  });
});

describe("CopyButton", () => {
  it("has all three labels in its markup and shows one", () => {
    render(<CopyButton text="x" tooltip="Copy the output" />);
    const button = screen.getByRole("button", { name: "Copy" });
    const labels = [...button.querySelectorAll(".wk-ui-copy__label")];
    expect(labels.map((label) => [label.textContent, label.getAttribute("data-shown")])).toEqual([
      ["Copy", "true"],
      ["Copied", "false"],
      ["Copy failed", "false"],
    ]);
    expect(live().textContent).toBe("");
  });

  it("says Copied for 1.5 s and announces it", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn((_text: string) => Promise.resolve());
    mockClipboard(writeText);
    render(<CopyButton text="[1]" label="Copy JSON Patch" tooltip="Copy the patch" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy JSON Patch" })));
    expect(writeText).toHaveBeenCalledWith("[1]");
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(live().textContent).toBe("Copied");
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "Copy JSON Patch" })).toBeTruthy();
    expect(live().textContent).toBe("");
  });

  it("says Copy failed when the clipboard refuses", async () => {
    mockClipboard(() => Promise.reject(new Error("NotAllowedError")));
    render(<CopyButton text="x" tooltip="Copy the output" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
    expect(screen.getByRole("button", { name: "Copy failed" })).toBeTruthy();
    expect(live().textContent).toBe("Copy failed");
  });

  it("builds the text only when clicked, and can be disabled", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    mockClipboard(writeText);
    const build = vi.fn(() => "[1,2]");
    const { rerender } = render(<CopyButton text={build} label="Copy results" tooltip="Copy the matches" variant="quiet" />);
    expect(build).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy results" })));
    expect(writeText).toHaveBeenCalledWith("[1,2]");
    rerender(<CopyButton text={build} label="Copy results" tooltip="Copy the matches" disabled />);
    expect((screen.getByRole("button", { name: "Copied" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is disabled while there is nothing to copy", () => {
    render(<CopyButton text="" tooltip="Copy the output" />);
    expect((screen.getByRole("button", { name: "Copy" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
