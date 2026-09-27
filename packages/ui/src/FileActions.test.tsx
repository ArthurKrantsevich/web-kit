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

  it("reports a file over the limit", async () => {
    const onError = vi.fn();
    render(<OpenFileButton tooltip="t" accept=".json" maxBytes={3} onText={() => {}} onError={onError} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Open file"), { target: { files: [new File(["1234"], "a.json")] } });
    });
    expect(onError).toHaveBeenCalledWith("File is larger than 3 B");
  });
});

describe("PasteButton", () => {
  it("is hidden without a clipboard reader", () => {
    setClipboard({ writeText: () => Promise.resolve() });
    render(<PasteButton tooltip="t" onText={() => {}} onError={() => {}} />);
    expect(screen.queryByRole("button", { name: "Paste" })).toBeNull();
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
