import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenFileButton, PasteButton } from "./FileActions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

describe("OpenFileButton", () => {
  it("opens the picker and passes the text on", async () => {
    const onText = vi.fn();
    render(
      <OpenFileButton label="Open file into Left" tooltip="t" accept=".json" maxBytes={1024} onText={onText} onError={() => {}} />,
    );
    const input = screen.getByLabelText("Open file into Left") as HTMLInputElement;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Open file into Left" }));
    expect(click).toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["﻿[1]"], "a.json")] } });
    });
    expect(onText).toHaveBeenCalledWith("[1]");
    expect(input.value).toBe("");
  });

  it("says when a chosen file starts being read, before its text arrives", async () => {
    const events: string[] = [];
    let finish: (text: string) => void = () => {};
    const file = new File(["[1]"], "a.json");
    vi.spyOn(file, "text").mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(
      <OpenFileButton
        tooltip="t"
        accept=".json"
        maxBytes={1024}
        onReadStart={() => events.push("start")}
        onText={(text) => events.push(`text ${text}`)}
        onError={() => {}}
      />,
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Open file"), { target: { files: [file] } });
    });
    expect(events).toEqual(["start"]);
    await act(async () => finish("[1]"));
    expect(events).toEqual(["start", "text [1]"]);
  });

  it("drops the text of an earlier file that finishes reading after a later one was chosen", async () => {
    const texts: string[] = [];
    const finish: Record<string, (text: string) => void> = {};
    const file = (name: string) => {
      const value = new File(["x"], name);
      vi.spyOn(value, "text").mockReturnValue(new Promise((resolve) => (finish[name] = resolve)));
      return value;
    };
    render(<OpenFileButton tooltip="t" accept=".json" maxBytes={1024} onText={(text) => texts.push(text)} onError={() => {}} />);
    const input = screen.getByLabelText("Open file");
    await act(async () => {
      fireEvent.change(input, { target: { files: [file("a.json")] } });
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file("b.json")] } });
    });
    await act(async () => finish["b.json"]!("B"));
    await act(async () => finish["a.json"]!("A"));
    expect(texts).toEqual(["B"]);
  });

  it("reports a file over the limit", async () => {
    const onError = vi.fn();
    render(<OpenFileButton tooltip="t" accept=".json" maxBytes={3} onText={() => {}} onError={onError} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Open file"), { target: { files: [new File(["1234"], "a.json")] } });
    });
    expect(onError).toHaveBeenCalledWith("File is larger than 3 B");
  });
});

describe("OpenFileButton labels", () => {
  it("shows Open file, may have a longer name, and builds its tooltip from the file types and the limit", () => {
    render(
      <OpenFileButton
        aria-label="Open file into Left"
        words={{ into: " into Left", target: "Left" }}
        accept=".json,application/json,.txt,text/plain"
        maxBytes={10 * 1024 * 1024}
        onText={() => {}}
        onError={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Open file into Left" });
    expect(button.querySelector(".wk-ui-button__label")?.textContent).toBe("Open file");
    expect(button.getAttribute("data-action")).toBe("open");
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Open a .json or .txt file into Left (up to 10 MB), or drop it on Left",
    );
    // The hidden file input is named like the button.
    expect(document.querySelector('input[type="file"]')?.getAttribute("aria-label")).toBe("Open file into Left");
  });
});

describe("PasteButton", () => {
  it("keeps its place hidden without a clipboard reader: in the layout, but not a button to anyone", () => {
    setClipboard({ writeText: () => Promise.resolve() });
    const { container } = render(<PasteButton onText={() => {}} onError={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
    const kept = container.querySelector("button")!;
    expect(kept.className).toContain("wk-ui-button--pending");
    expect(kept.getAttribute("aria-hidden")).toBe("true");
    expect(kept.tabIndex).toBe(-1);
    expect((kept as HTMLButtonElement).disabled).toBe(true);
    expect(kept.textContent).toBe("Paste");
  });

  it("shows Paste with a longer name and the template tooltip once the clipboard can be read", () => {
    setClipboard({ readText: () => Promise.resolve("") });
    render(<PasteButton aria-label="Paste into Right" words={{ into: " into Right" }} onText={() => {}} onError={() => {}} />);
    const button = screen.getByRole("button", { name: "Paste into Right" });
    expect(button.querySelector(".wk-ui-button__label")?.textContent).toBe("Paste");
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Paste from the clipboard into Right",
    );
  });

  it("pastes, or reports a refusal", async () => {
    const onText = vi.fn();
    const onError = vi.fn();
    setClipboard({ readText: () => Promise.resolve("[2]") });
    render(<PasteButton label="Paste into Data" tooltip="t" onText={onText} onError={onError} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Paste into Data" })));
    expect(onText).toHaveBeenCalledWith("[2]");
    setClipboard({ readText: () => Promise.reject(new Error("denied")) });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Paste into Data" })));
    expect(onError).toHaveBeenCalledWith("Clipboard access was denied");
  });
});
