import { compressText } from "@web-kit/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonDiff } from "./JsonDiff";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/json-diff/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const area = (name: "Left" | "Right") => screen.getByLabelText(name) as HTMLTextAreaElement;

describe("JsonDiff shortcuts, files and links", () => {
  it("Ctrl+Enter swaps Left and Right", () => {
    render(<JsonDiff initialLeft="[1]" initialRight="[2]" />);
    fireEvent.keyDown(area("Left"), { key: "Enter", ctrlKey: true });
    expect([area("Left").value, area("Right").value]).toEqual(["[2]", "[1]"]);
  });

  it("opens a file dropped on each side into that side", async () => {
    render(<JsonDiff />);
    await act(async () => {
      fireEvent.drop(area("Right").closest("section")!, {
        dataTransfer: { types: ["Files"], files: [new File(['{"r":1}'], "r.json")] },
      });
    });
    expect([area("Left").value, area("Right").value]).toEqual(["", '{"r":1}']);
    expect(area("Right").closest("section")!.querySelector(".wk-ui-pane__drop")?.textContent).toBe("Drop the file to open it in Right");
  });

  it("loads each side from a URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[3]")));
    render(<JsonDiff initialLeft="[1]" initialRight="[2]" />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Load Right from URL…" }));
    const dialog = screen.getByRole("dialog", { name: "Load Right from URL" });
    fireEvent.change(within(dialog).getByLabelText("URL"), { target: { value: "https://example.com/r.json" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Load" }));
    });
    expect([area("Left").value, area("Right").value]).toEqual(["[1]", "[3]"]);
  });

  it("opens a share link with both sides and the options", async () => {
    const state = { left: '[{"id":1,"v":1}]', right: '[{"id":1,"v":2}]', arrayMode: "key", arrayKey: "id", numbers: "raw" };
    history.replaceState(null, "", `/tools/json-diff/#json-diff=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<JsonDiff />);
    await waitFor(() => expect(area("Right").value).toBe('[{"id":1,"v":2}]'));
    expect(screen.getByRole("button", { name: "By key" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "As written" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(screen.getByRole("list", { name: "Changes" }).textContent).toContain("$[0].v"));
  });

  it("Show in Left says what it does", () => {
    render(<JsonDiff initialLeft="{" initialRight="{}" />);
    const show = screen.getByRole("button", { name: "Show in Left" });
    expect(document.getElementById(show.getAttribute("aria-describedby")!)?.textContent).toBe("Select the error in Left");
  });
});
