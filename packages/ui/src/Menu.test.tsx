import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu, type MenuItem } from "./Menu";

afterEach(cleanup);

function renderMenu(items: Partial<MenuItem>[] = []) {
  const chosen: string[] = [];
  const all: MenuItem[] = [
    { label: "Load from URL…", onSelect: () => chosen.push("url") },
    { label: "Save input in this browser", checked: false, description: "Off: nothing is stored", onSelect: () => chosen.push("save") },
    { label: "Clear saved input", disabled: true, onSelect: () => chosen.push("clear") },
    { label: "Keyboard shortcuts", shortcut: "?", onSelect: () => chosen.push("keys") },
  ].map((item, index) => ({ ...item, ...items[index] }));
  render(
    <>
      <Menu label="More actions" tooltip="Share, save, load and keys" items={all} />
      <button type="button">Outside</button>
    </>,
  );
  return chosen;
}

const trigger = () => screen.getByRole("button", { name: "More actions" });
const active = () => document.getElementById(screen.getByRole("menu").getAttribute("aria-activedescendant")!)!;

describe("Menu", () => {
  it("is an icon button with a hidden label that opens a menu", () => {
    renderMenu();
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().querySelector(".wk-ui-sr-only")?.textContent).toBe("More actions");
    fireEvent.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu", { name: "More actions" })).toBe(document.activeElement);
  });

  it("has plain items, checkbox items, disabled items and shortcuts", () => {
    renderMenu();
    fireEvent.click(trigger());
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Load from URL…",
      "Clear saved input",
      "Keyboard shortcuts?",
    ]);
    const save = screen.getByRole("menuitemcheckbox", { name: "Save input in this browser" });
    expect(save.getAttribute("aria-checked")).toBe("false");
    expect(document.getElementById(save.getAttribute("aria-describedby")!)?.textContent).toBe("Off: nothing is stored");
    expect(screen.getByRole("menuitem", { name: "Clear saved input" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("moves with the arrows, wraps, and chooses with Enter; focus returns to the button", () => {
    const chosen = renderMenu();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(active().textContent).toBe("Load from URL…");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(active().textContent).toBe("Keyboard shortcuts?");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Home" });
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Enter" });
    expect(chosen).toEqual(["save"]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("opens on the last item with ArrowUp", () => {
    renderMenu();
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    expect(active().textContent).toBe("Keyboard shortcuts?");
  });

  it("does nothing for a disabled item and stays open", () => {
    const chosen = renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear saved input" }));
    expect(chosen).toEqual([]);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("closes with Escape (focus back on the button), Tab, and a click outside", () => {
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes when the page scrolls", () => {
    renderMenu();
    fireEvent.click(trigger());
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("chooses an item with a click", () => {
    const onSelect = vi.fn();
    renderMenu([{ onSelect }]);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Load from URL…" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
