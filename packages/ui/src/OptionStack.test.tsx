import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberField } from "./NumberField";
import { OptionStack } from "./OptionStack";

afterEach(cleanup);

describe("OptionStack", () => {
  it("renders every panel, shows one, and hides the others from focus and from assistive technology", () => {
    const { rerender } = render(
      <OptionStack
        label="Options for Words"
        active="words"
        panels={{ characters: <button type="button">Length</button>, words: <button type="button">Separator</button> }}
      />,
    );
    const panels = [...document.querySelectorAll(".wk-ui-stack__panel")];
    expect(panels.map((panel) => [panel.getAttribute("data-panel"), panel.getAttribute("data-active"), panel.hasAttribute("inert"), panel.getAttribute("aria-hidden")])).toEqual([
      ["characters", "false", true, "true"],
      ["words", "true", false, null],
    ]);
    expect(screen.getByRole("group", { name: "Options for Words" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Length" })).toBeNull();
    rerender(
      <OptionStack
        label="Options for Characters"
        active="characters"
        panels={{ characters: <button type="button">Length</button>, words: <button type="button">Separator</button> }}
      />,
    );
    expect(screen.getByRole("button", { name: "Length" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Separator" })).toBeNull();
  });
});

describe("NumberField", () => {
  function Harness({ onChange }: { onChange: (value: number) => void }) {
    const [value, setValue] = useState(10);
    return (
      <NumberField
        label="Count"
        value={value}
        min={1}
        max={1000}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    );
  }

  it("passes on whole numbers in range, keeps what is typed, and puts the last good value back on leaving", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const field = screen.getByRole("spinbutton", { name: "Count" }) as HTMLInputElement;
    expect([field.min, field.max, field.value]).toEqual(["1", "1000", "10"]);
    for (const typed of ["", "0", "1001", "2.5", "25"]) fireEvent.change(field, { target: { value: typed } });
    expect(onChange.mock.calls).toEqual([[25]]);
    fireEvent.change(field, { target: { value: "" } });
    expect(field.value).toBe("");
    fireEvent.blur(field);
    expect(field.value).toBe("25");
  });
});
