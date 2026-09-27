import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIONS, ActionButton, actionTooltip, type ActionId } from "./actions";
import { CopyButton } from "./Button";
import { OpenFileButton, PasteButton } from "./FileActions";
import { ToolMenu } from "./ToolMenu";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ids = Object.keys(ACTIONS) as ActionId[];

describe("ACTIONS", () => {
  it("lists every shared action once, in one order: input, custom, output, then the toolbar", () => {
    expect(ids).toEqual(["open", "paste", "custom", "download", "copy", "sample", "clear", "more"]);
    expect(ids.map((id) => ACTIONS[id].order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("gives every action but the tool's own an icon, a label and a tooltip; only More is icon-only", () => {
    for (const id of ids.filter((id) => id !== "custom")) {
      expect([id, ACTIONS[id].icon === "", ACTIONS[id].label === "", ACTIONS[id].tooltip === ""]).toEqual([id, false, false, false]);
    }
    expect(ids.filter((id) => ACTIONS[id].iconOnly)).toEqual(["more"]);
  });

  it("puts Open file and Paste in input headers, Download and Copy in output headers, the rest in the toolbar", () => {
    expect(Object.fromEntries(ids.map((id) => [id, ACTIONS[id].places]))).toEqual({
      open: ["input"],
      paste: ["input"],
      custom: ["output", "toolbar"],
      download: ["output"],
      copy: ["output"],
      sample: ["toolbar"],
      clear: ["toolbar"],
      more: ["toolbar"],
    });
  });

  it("fills the tooltip templates with the tool's words and leaves out a missing word", () => {
    expect(actionTooltip("open", { types: ".json or .txt", into: " into Left", limit: "10 MB", target: "Left" })).toBe(
      "Open a .json or .txt file into Left (up to 10 MB), or drop it on Left",
    );
    expect(actionTooltip("paste")).toBe("Paste from the clipboard");
    expect(actionTooltip("clear", { target: "both sides" })).toBe("Empty both sides");
    expect(actionTooltip("download", { what: "the output", file: "formatted.json" })).toBe("Save the output as formatted.json");
  });

  it("is what every ui button of a shared action is built from: each one carries its data-action", () => {
    Object.defineProperty(navigator, "clipboard", { value: { readText: () => Promise.resolve("") }, configurable: true });
    render(
      <>
        <OpenFileButton accept=".json" maxBytes={1024} onText={() => {}} onError={() => {}} />
        <PasteButton onText={() => {}} onError={() => {}} />
        <ActionButton action="sample" words={{ target: "the input" }} />
        <ActionButton action="custom" icon="swap" tooltip="Swap Left and Right">
          Swap
        </ActionButton>
        <CopyButton text="x" tooltip="Copy the output" icon />
        <ToolMenu toolKey="t" state={{}} onRestore={() => {}} urlTargets={[]} shortcuts={[]} onNotice={() => {}} />
      </>,
    );
    const used = [...document.querySelectorAll("[data-action]")].map((element) => element.getAttribute("data-action"));
    expect(used).toEqual(["open", "paste", "sample", "custom", "copy", "more"]);
    for (const id of used) expect(ids).toContain(id);
  });
});

describe("ActionButton", () => {
  it("is a quiet button with the table's icon, label and tooltip", () => {
    render(<ActionButton action="clear" words={{ target: "data and schema" }} />);
    const button = screen.getByRole("button", { name: "Clear" });
    expect(button.className).toContain("wk-ui-button--quiet");
    expect(button.className).toContain("wk-ui-button--has-icon");
    expect(button.getAttribute("data-action")).toBe("clear");
    expect(button.querySelector(".wk-ui-button__label")?.textContent).toBe("Clear");
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe("Empty data and schema");
  });

  it("takes the tool's own label, icon, tooltip and name", () => {
    const onClick = vi.fn();
    render(
      <ActionButton action="custom" icon="to-input" tooltip="Replace the input with the output" aria-label="Use output as input" onClick={onClick}>
        To input
      </ActionButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use output as input" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows only the icon of More actions", () => {
    render(<ActionButton action="more" />);
    expect(screen.getByRole("button", { name: "More actions" }).className).toContain("wk-ui-button--icon-only");
  });
});

describe("the Copy action", () => {
  it("shows the copy icon, then a check after copying, without changing its accessible names", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.resolve() }, configurable: true });
    render(<CopyButton text="x" tooltip="Copy the output" variant="quiet" icon />);
    const button = screen.getByRole("button", { name: "Copy" });
    const path = () => button.querySelector("svg path")?.getAttribute("d");
    const before = path();
    expect(button.className).toContain("wk-ui-button--has-icon");
    await act(async () => fireEvent.click(button));
    expect(screen.getByRole("button", { name: "Copied" })).toBe(button);
    expect(path()).not.toBe(before);
    expect(button.querySelectorAll("svg")).toHaveLength(1);
  });
});
