import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select, type SelectOption } from "./Select";

afterEach(cleanup);

type Indent = "2" | "4" | "tab";
const OPTIONS: SelectOption<Indent>[] = [
  { value: "2", label: "2 spaces" },
  { value: "4", label: "4 spaces", description: "Wider" },
  { value: "tab", label: "Tab" },
];

function Harness({ onChange = () => {} }: { onChange?: (value: Indent) => void }) {
  const [value, setValue] = useState<Indent>("2");
  return (
    <>
      <Select
        label="Indent"
        value={value}
        options={OPTIONS}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
      <button type="button">Outside</button>
    </>
  );
}

const trigger = () => screen.getByRole("button", { name: "Indent" });
const active = () => document.getElementById(screen.getByRole("listbox").getAttribute("aria-activedescendant")!)!;

describe("Select", () => {
  it("is a button named by its label, with the value as its description", () => {
    render(<Harness />);
    expect(trigger().getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    const description = document.getElementById(trigger().getAttribute("aria-describedby")!);
    expect(description?.textContent).toBe("2 spaces");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens with ArrowDown on the selected option and marks it selected", () => {
    render(<Harness />);
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(active().textContent).toBe("2 spaces");
    expect(document.activeElement).toBe(screen.getByRole("listbox"));
  });

  it("names options by their label and describes them by their second line", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const wide = screen.getByRole("option", { name: "4 spaces" });
    expect(document.getElementById(wide.getAttribute("aria-describedby")!)?.textContent).toBe("Wider");
  });

  it("moves with the arrows, Home and End, and picks with Enter", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(active().textContent).toBe("4 spacesWider");
    fireEvent.keyDown(list, { key: "End" });
    expect(active().textContent).toBe("Tab");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(active().textContent).toBe("Tab");
    fireEvent.keyDown(list, { key: "Home" });
    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(active().textContent).toBe("2 spaces");
    fireEvent.keyDown(list, { key: "End" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("tab");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().textContent).toBe("Tab");
  });

  it("picks with Space and with a click", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: " " });
    expect(onChange).toHaveBeenLastCalledWith("4");
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: "Tab" }));
    expect(onChange).toHaveBeenLastCalledWith("tab");
  });

  it("does not call onChange when the current option is picked again", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: "2 spaces" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes with Escape, returns focus and keeps the value", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("jumps to the next option that starts with a typed letter", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "t" });
    expect(active().textContent).toBe("Tab");
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "4" });
    expect(active().textContent).toBe("4 spacesWider");
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "x" });
    expect(active().textContent).toBe("4 spacesWider");
  });

  it("closes on Tab, on a press outside, on scroll and on resize", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Tab" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(trigger());
    fireEvent.scroll(window);
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(trigger());
    fireEvent(window, new Event("resize"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("toggles with a click on the button", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.pointerDown(trigger());
    fireEvent.click(trigger());
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on a click on its button although the press moved focus from the list to the button", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const list = screen.getByRole("listbox");
    // What a browser does on a press on the button: pointerdown, mousedown, focus moves to the button, click.
    fireEvent.pointerDown(trigger());
    fireEvent.mouseDown(trigger());
    fireEvent.blur(list, { relatedTarget: trigger() });
    fireEvent.click(trigger());
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps focus in the open list on a press on its button, so Safari and Chrome behave the same", () => {
    render(<Harness />);
    // Closed: the press is left alone, so the button takes focus as usual.
    expect(fireEvent.mouseDown(trigger())).toBe(true);
    fireEvent.click(trigger());
    // Open: the default is prevented; fireEvent returns false when it was.
    expect(fireEvent.mouseDown(trigger())).toBe(false);
  });

  it("stays closed while disabled", () => {
    render(<Select label="Indent" value="2" options={OPTIONS} onChange={() => {}} disabled />);
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
  });

  it("uses the top layer when the browser has the Popover API", () => {
    const show = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "showPopover", { value: show, configurable: true });
    try {
      render(<Harness />);
      fireEvent.click(trigger());
      expect(show).toHaveBeenCalledTimes(1);
      // jsdom hides [popover] elements that are not open; the real browser shows them in the top layer.
      expect(screen.getByRole("listbox", { hidden: true }).getAttribute("popover")).toBe("manual");
    } finally {
      delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
    }
  });
});
