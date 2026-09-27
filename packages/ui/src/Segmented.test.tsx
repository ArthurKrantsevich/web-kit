import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Segmented } from "./Segmented";

afterEach(cleanup);

const OPTIONS = [
  { value: "format", label: "Format" },
  { value: "minify", label: "Minify", tooltip: "One line, no spaces" },
] as const;

describe("Segmented", () => {
  it("is a named group of toggle buttons", () => {
    const onChange = vi.fn();
    render(<Segmented label="Mode" value="format" options={[...OPTIONS]} onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Mode" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((button) => [button.textContent, button.getAttribute("aria-pressed")])).toEqual([
      ["Format", "true"],
      ["Minify", "false"],
    ]);
    fireEvent.click(buttons[1]!);
    expect(onChange).toHaveBeenCalledWith("minify");
  });

  it("reserves the width of each bold label", () => {
    render(<Segmented label="Mode" value="format" options={[...OPTIONS]} onChange={() => {}} />);
    for (const label of ["Format", "Minify"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button.querySelector(".wk-ui-segment__label")?.getAttribute("data-label")).toBe(label);
    }
  });

  it("adds a tooltip to a segment when asked", () => {
    render(<Segmented label="Mode" value="format" options={[...OPTIONS]} onChange={() => {}} />);
    const minify = screen.getByRole("button", { name: "Minify" });
    expect(document.getElementById(minify.getAttribute("aria-describedby")!)?.textContent).toBe("One line, no spaces");
    expect(screen.getByRole("button", { name: "Format" }).hasAttribute("aria-describedby")).toBe(false);
  });
});
