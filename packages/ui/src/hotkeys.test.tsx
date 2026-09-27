import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatHotkey, matchHotkey, useHotkeys, type HotkeyMap } from "./hotkeys";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const press = (init: Partial<KeyboardEventInit & { code: string }>) => ({
  key: "",
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...init,
});

describe("matchHotkey", () => {
  it("reads Mod as Ctrl, or as ⌘ on Apple systems", () => {
    expect(matchHotkey("Mod+Enter", press({ key: "Enter", ctrlKey: true }), false)).toBe(true);
    expect(matchHotkey("Mod+Enter", press({ key: "Enter", metaKey: true }), false)).toBe(false);
    expect(matchHotkey("Mod+Enter", press({ key: "Enter", metaKey: true }), true)).toBe(true);
    expect(matchHotkey("Mod+Enter", press({ key: "Enter", ctrlKey: true }), true)).toBe(false);
  });

  it("needs exactly the listed modifiers, so browser shortcuts pass through", () => {
    const combo = "Mod+Shift+M";
    expect(matchHotkey(combo, press({ key: "M", code: "KeyM", ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(matchHotkey(combo, press({ key: "m", code: "KeyM", ctrlKey: true }), false)).toBe(false);
    expect(matchHotkey(combo, press({ key: "M", code: "KeyM", ctrlKey: true, shiftKey: true, altKey: true }), false)).toBe(false);
    expect(matchHotkey("Mod+Enter", press({ key: "Enter", ctrlKey: true, shiftKey: true }), false)).toBe(false);
  });

  it("matches letters by the physical key, whatever the layout", () => {
    expect(matchHotkey("Mod+Shift+F", press({ key: "А", code: "KeyF", ctrlKey: true, shiftKey: true }), false)).toBe(true);
  });

  it("matches a Latin letter by the character it types, so the key labelled M works on AZERTY", () => {
    // AZERTY: the key labelled M sits where QWERTY has ";" (code Semicolon); the key at KeyM types ",".
    expect(matchHotkey("Mod+Shift+M", press({ key: "M", code: "Semicolon", ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(matchHotkey("Mod+Shift+M", press({ key: "?", code: "KeyM", ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(matchHotkey("Mod+Shift+M", press({ key: "m", code: "KeyM", metaKey: true, shiftKey: true }), true)).toBe(true);
  });

  it("matches ? by the character, with Shift or without, but not with Ctrl, ⌘ or Alt", () => {
    expect(matchHotkey("?", press({ key: "?", shiftKey: true }), false)).toBe(true);
    expect(matchHotkey("?", press({ key: "?", ctrlKey: true }), false)).toBe(false);
  });

  it("matches Alt with arrows, and function keys by name", () => {
    expect(matchHotkey("Alt+ArrowDown", press({ key: "ArrowDown", altKey: true }), false)).toBe(true);
    expect(matchHotkey("Alt+ArrowDown", press({ key: "ArrowDown" }), false)).toBe(false);
    expect(matchHotkey("Alt+ArrowDown", press({ key: "ArrowDown", altKey: true, ctrlKey: true }), false)).toBe(false);
    expect(matchHotkey("Alt+ArrowDown", press({ key: "ArrowDown", altKey: true }), true)).toBe(true);
    expect(matchHotkey("F7", press({ key: "F7" }), false)).toBe(true);
    expect(matchHotkey("F7", press({ key: "F7", shiftKey: true }), false)).toBe(false);
    expect(matchHotkey("Shift+F7", press({ key: "F7", shiftKey: true }), false)).toBe(true);
    // Without Alt in the combination, Alt still keeps it from matching.
    expect(matchHotkey("Mod+Enter", press({ key: "Enter", ctrlKey: true, altKey: true }), false)).toBe(false);
  });

  it("formats combinations for each system", () => {
    expect(formatHotkey("Mod+Shift+M", false)).toEqual(["Ctrl", "Shift", "M"]);
    expect(formatHotkey("Mod+Shift+M", true)).toEqual(["⌘", "⇧", "M"]);
    expect(formatHotkey("Alt+ArrowDown", false)).toEqual(["Alt", "↓"]);
    expect(formatHotkey("Alt+ArrowUp", true)).toEqual(["⌥", "↑"]);
    expect(formatHotkey("Shift+F7", false)).toEqual(["Shift", "F7"]);
  });
});

function Tool({ name, map }: { name: string; map: HotkeyMap }) {
  const root = useRef<HTMLDivElement>(null);
  useHotkeys(map, root);
  return (
    <div ref={root}>
      <textarea aria-label={`${name} input`} />
      <button type="button">{`${name} button`}</button>
      <dialog open aria-label={`${name} dialog`}>
        <input aria-label={`${name} field`} />
      </dialog>
    </div>
  );
}

describe("useHotkeys", () => {
  it("runs a combination pressed inside the tool, even in a text field, and prevents the default", () => {
    const format = vi.fn();
    render(<Tool name="A" map={{ "Mod+Enter": format }} />);
    const handled = !fireEvent.keyDown(screen.getByLabelText("A input"), { key: "Enter", ctrlKey: true });
    expect(format).toHaveBeenCalledTimes(1);
    expect(handled).toBe(true);
  });

  it("ignores a held key's repeats, so a combination runs once", () => {
    const run = vi.fn();
    render(<Tool name="A" map={{ "Mod+Enter": run }} />);
    const field = screen.getByLabelText("A input");
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true, repeat: true });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true, repeat: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("leaves other combinations alone", () => {
    const format = vi.fn();
    render(<Tool name="A" map={{ "Mod+Enter": format }} />);
    expect(fireEvent.keyDown(screen.getByLabelText("A input"), { key: "s", code: "KeyS", ctrlKey: true })).toBe(true);
    expect(format).not.toHaveBeenCalled();
  });

  it("shows ? only outside text fields", () => {
    const help = vi.fn();
    render(<Tool name="A" map={{ "?": help }} />);
    fireEvent.keyDown(screen.getByLabelText("A input"), { key: "?", shiftKey: true });
    expect(help).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button", { name: "A button" }), { key: "?", shiftKey: true });
    expect(help).toHaveBeenCalledTimes(1);
  });

  it("leaves Alt with an arrow to text fields, where it moves the caret, and runs it elsewhere", () => {
    const run = vi.fn();
    render(<Tool name="A" map={{ "Alt+ArrowDown": run }} />);
    expect(fireEvent.keyDown(screen.getByLabelText("A input"), { key: "ArrowDown", altKey: true })).toBe(true);
    expect(run).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button", { name: "A button" }), { key: "ArrowDown", altKey: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("leaves keys inside a dialog, during composition, or already handled alone", () => {
    const format = vi.fn();
    render(<Tool name="A" map={{ "Mod+Enter": format }} />);
    fireEvent.keyDown(screen.getByLabelText("A field"), { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(screen.getByLabelText("A input"), { key: "Enter", ctrlKey: true, isComposing: true });
    const input = screen.getByLabelText("A input");
    input.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(format).not.toHaveBeenCalled();
  });

  it("with two tools, keys go to the tool that has focus, or to the first one when nothing has focus", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <Tool name="A" map={{ "?": first }} />
        <Tool name="B" map={{ "?": second }} />
      </>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "B button" }), { key: "?" });
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([0, 1]);
    fireEvent.keyDown(document.body, { key: "?" });
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([1, 1]);
  });

  it("uses ⌘ on Apple systems", () => {
    vi.stubGlobal("navigator", { ...navigator, platform: "MacIntel" });
    const format = vi.fn();
    render(<Tool name="A" map={{ "Mod+Enter": format }} />);
    fireEvent.keyDown(screen.getByLabelText("A input"), { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(screen.getByLabelText("A input"), { key: "Enter", metaKey: true });
    expect(format).toHaveBeenCalledTimes(1);
  });
});
