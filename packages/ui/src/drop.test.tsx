import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptsFile, describeAccept, useFileDrop } from "./drop";
import { EditorPane } from "./Editor";
import { OpenFileButton } from "./FileActions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ACCEPT = ".json,application/json,.txt,text/plain";

describe("acceptsFile", () => {
  it("matches extensions without case, exact types and wildcard types", () => {
    expect(acceptsFile({ name: "DATA.JSON", type: "" }, ACCEPT)).toBe(true);
    expect(acceptsFile({ name: "export", type: "application/json" }, ACCEPT)).toBe(true);
    expect(acceptsFile({ name: "notes", type: "text/markdown" }, "text/*")).toBe(true);
    expect(acceptsFile({ name: "photo.png", type: "image/png" }, ACCEPT)).toBe(false);
    expect(acceptsFile({ name: "json", type: "" }, ACCEPT)).toBe(false);
    expect(acceptsFile({ name: "disk.iso", type: "" }, "*/*")).toBe(true);
  });

  it("describes the extensions for a message", () => {
    expect(describeAccept(ACCEPT)).toBe(".json or .txt");
    expect(describeAccept(".json,.csv,.txt,text/csv")).toBe(".json, .csv or .txt");
    expect(describeAccept(".csv")).toBe(".csv");
  });
});

/** A pane that files can be dropped on, and an Open file button that shares its reader. */
function Harness({ onReadStart = () => {} }: { onReadStart?: () => void }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const drop = useFileDrop({
    accept: ACCEPT,
    maxBytes: 16,
    label: "Open file into Left",
    onReadStart,
    onText: setText,
    onError: setMessage,
  });
  return (
    <>
      <OpenFileButton label="Open file into Left" tooltip="Open a file" drop={drop} />
      <EditorPane title="Left" drop={drop} dropLabel="Drop the file to open it in Left">
        <textarea aria-label="Left" value={text} readOnly />
      </EditorPane>
      <p data-testid="message">{message}</p>
    </>
  );
}

const pane = () => screen.getByLabelText("Left").closest("section")!;
const files = (...list: File[]) => ({ dataTransfer: { types: ["Files"], files: list, dropEffect: "none" } });

describe("useFileDrop", () => {
  it("shows the overlay while files are dragged over the pane, through nested elements", () => {
    render(<Harness />);
    expect(pane().getAttribute("data-dragging")).toBe("false");
    expect(pane().querySelector(".wk-ui-pane__drop")?.textContent).toBe("Drop the file to open it in Left");
    fireEvent.dragEnter(pane(), files());
    fireEvent.dragEnter(screen.getByLabelText("Left"), files());
    fireEvent.dragLeave(pane(), files());
    expect(pane().getAttribute("data-dragging")).toBe("true");
    fireEvent.dragLeave(screen.getByLabelText("Left"), files());
    expect(pane().getAttribute("data-dragging")).toBe("false");
  });

  it("keeps the browser from opening a dragged file, and leaves dragged text alone", () => {
    render(<Harness />);
    expect(fireEvent.dragOver(pane(), files())).toBe(false);
    expect(fireEvent.dragOver(pane(), { dataTransfer: { types: ["text/plain"], files: [] } })).toBe(true);
    fireEvent.dragEnter(pane(), { dataTransfer: { types: ["text/plain"], files: [] } });
    expect(pane().getAttribute("data-dragging")).toBe("false");
  });

  it("reads a dropped file without its BOM", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.drop(pane(), files(new File(["﻿[1]"], "a.json")));
    });
    expect((screen.getByLabelText("Left") as HTMLTextAreaElement).value).toBe("[1]");
    expect(pane().getAttribute("data-dragging")).toBe("false");
  });

  it("passes the file's name with its text", async () => {
    const onText = vi.fn();
    function Named() {
      const drop = useFileDrop({ accept: ACCEPT, maxBytes: 16, onText, onError: () => {} });
      return (
        <EditorPane title="Left" drop={drop}>
          <textarea aria-label="Left" readOnly />
        </EditorPane>
      );
    }
    render(<Named />);
    await act(async () => {
      fireEvent.drop(pane(), files(new File(["[1]"], "report.json")));
    });
    expect(onText).toHaveBeenCalledWith("[1]", { name: "report.json" });
  });

  it("passes the file itself with onFile, not read, and still refuses one over the limit", async () => {
    const onFile = vi.fn();
    const onText = vi.fn();
    const onError = vi.fn();
    function Raw() {
      const drop = useFileDrop({ accept: "*/*,.bin", maxBytes: 4, onFile, onText, onError });
      return (
        <EditorPane title="Left" drop={drop}>
          <textarea aria-label="Left" readOnly />
        </EditorPane>
      );
    }
    render(<Raw />);
    const small = new File(["abc"], "a.bin");
    await act(async () => {
      fireEvent.drop(pane(), files(small));
    });
    await act(async () => {
      fireEvent.drop(pane(), files(new File(["abcdef"], "b.bin")));
    });
    expect([onFile.mock.calls, onText.mock.calls, onError.mock.calls]).toEqual([[[small]], [], [["File is larger than 4 B"]]]);
  });

  it("refuses a file of another type and a file over the limit", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.drop(pane(), files(new File(["x"], "photo.png", { type: "image/png" })));
    });
    expect(screen.getByTestId("message").textContent).toBe('Cannot open "photo.png": choose a .json or .txt file');
    await act(async () => {
      fireEvent.drop(pane(), files(new File(["[1, 2, 3, 4, 5, 6, 7]"], "big.json")));
    });
    expect(screen.getByTestId("message").textContent).toBe("File is larger than 16 B");
    expect((screen.getByLabelText("Left") as HTMLTextAreaElement).value).toBe("");
  });

  it("opens only the first of several dropped files", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.drop(pane(), files(new File(["[1]"], "a.json"), new File(["[2]"], "b.json")));
    });
    expect((screen.getByLabelText("Left") as HTMLTextAreaElement).value).toBe("[1]");
  });

  it("shares one reader with Open file: a file picked earlier and read slower does not replace a dropped one", async () => {
    const onReadStart = vi.fn();
    render(<Harness onReadStart={onReadStart} />);
    let finish: (text: string) => void = () => {};
    const slow = new File(["x"], "slow.json");
    vi.spyOn(slow, "text").mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const picker = screen.getByLabelText("Open file into Left") as HTMLInputElement;
    const click = vi.spyOn(picker, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Open file into Left" }));
    expect(click).toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(picker, { target: { files: [slow] } });
    });
    await act(async () => {
      fireEvent.drop(pane(), files(new File(["[2]"], "b.json")));
    });
    await act(async () => finish("[1]"));
    expect((screen.getByLabelText("Left") as HTMLTextAreaElement).value).toBe("[2]");
    expect(onReadStart).toHaveBeenCalledTimes(2);
  });

  it("keeps the pane header first and the body last, so the body still fills the pane", () => {
    render(<Harness />);
    expect(pane().firstElementChild?.className).toBe("wk-ui-pane__head");
    expect(pane().lastElementChild).toBe(screen.getByLabelText("Left"));
  });
});
