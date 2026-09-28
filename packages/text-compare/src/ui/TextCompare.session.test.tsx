import { compressText, SAVE_DELAY } from "@web-kit/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextCompare } from "./TextCompare";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/text-compare/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const area = (side: "Left" | "Right") => screen.getByRole("textbox", { name: new RegExp(`^${side}`) }) as HTMLTextAreaElement;
// Decompressing a link and restoring it takes a few frames; a busy machine running every package's tests needs more.
const SLOW = { timeout: 5000 };
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

// SLOW lets a waitFor take up to 5 s, which is the default test timeout; on a CI runner 2–3 times slower these tests
// take seconds, so the block gets its own timeout, above SLOW.
describe("TextCompare links, saved input, URLs and drops", { timeout: 20_000 }, () => {
  it("opens a share link with both sides, their names, the view and the options", async () => {
    const state = {
      left: "a\nb\n",
      right: "a\nB\n",
      leftName: "old.txt",
      rightName: "new.txt",
      layout: "inline",
      granularity: "char",
      options: { ignoreWhitespace: false, ignoreCase: true, ignoreBlankLines: false, ignoreLineEndings: false, extra: "x" },
    };
    history.replaceState(null, "", `/tools/text-compare/#text-compare=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<TextCompare />);
    await waitFor(() => expect(area("Right").value).toBe("a\nB\n"), SLOW);
    expect(screen.getByRole("textbox", { name: "Left: old.txt" })).toBe(area("Left"));
    expect([pressed("Inline"), pressed("Characters")]).toEqual(["true", "true"]);
    expect(screen.getByRole("button", { name: /^Ignore/ }).textContent).toBe("Ignore (1)");
    await waitFor(() => expect(document.querySelector(".wk-compare__body")!.textContent).toBe("Identical when ignoring case."), SLOW);
  });

  it("ignores fields of a link that are not what they should be", async () => {
    const state = { left: 5, right: "x\n", layout: "sideways", options: "all", leftName: 1 };
    history.replaceState(null, "", `/tools/text-compare/#text-compare=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<TextCompare initialLeft={"kept\n"} />);
    await waitFor(() => expect(area("Right").value).toBe("x\n"), SLOW);
    expect([area("Left").value, pressed("Side by side")]).toEqual(["kept\n", "true"]);
    expect(screen.getByRole("button", { name: /^Ignore/ }).textContent).toBe("Ignore (1)");
  });

  it("drops line breaks and other control characters from names in a link", async () => {
    const state = { left: "a\n", right: "b\n", leftName: "old\r\n+++ x\u0000.txt", rightName: "new.txt" };
    history.replaceState(null, "", `/tools/text-compare/#text-compare=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<TextCompare />);
    await waitFor(() => expect(area("Right").value).toBe("b\n"), SLOW);
    expect(area("Left").getAttribute("aria-label")).toBe("Left: old+++ x.txt");
  });

  it("saves both sides while saving is on, and brings them back", async () => {
    const { unmount } = render(<TextCompare />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Save input in this browser" }));
    fireEvent.change(area("Left"), { target: { value: "left side\n" } });
    fireEvent.change(area("Right"), { target: { value: "right side\n" } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SAVE_DELAY + 50));
    });
    unmount();
    render(<TextCompare />);
    await waitFor(() => expect([area("Left").value, area("Right").value]).toEqual(["left side\n", "right side\n"]), SLOW);
  });

  it("loads each side from a URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("from the web\n")));
    render(<TextCompare initialLeft={"l\n"} initialRight={"r\n"} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Load Right from URL…" }));
    const dialog = screen.getByRole("dialog", { name: "Load Right from URL" });
    fireEvent.change(within(dialog).getByLabelText("URL"), { target: { value: "https://example.com/r.txt" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Load" }));
    });
    expect([area("Left").value, area("Right").value]).toEqual(["l\n", "from the web\n"]);
  });

  it("opens a file dropped on a side, refuses an image, and says where to drop a file dropped beside", async () => {
    render(<TextCompare />);
    await act(async () => {
      fireEvent.drop(area("Right").closest("section")!, {
        dataTransfer: { types: ["Files"], files: [new File(["dropped\n"], "notes.md")] },
      });
    });
    expect(screen.getByRole("textbox", { name: "Right: notes.md" }).textContent).toBe("dropped\n");
    await act(async () => {
      fireEvent.drop(area("Left").closest("section")!, {
        dataTransfer: { types: ["Files"], files: [new File(["x"], "photo.png", { type: "image/png" })] },
      });
    });
    expect(document.querySelector(".wk-ui-status")!.textContent).toContain('Cannot open "photo.png"');
    const toolbar = document.querySelector(".wk-ui-editor__toolbar")!;
    const dataTransfer = { types: ["Files"], files: [new File(["x"], "d.txt")] };
    await act(async () => {
      expect(fireEvent.drop(toolbar, { dataTransfer })).toBe(false);
    });
    expect(document.querySelector(".wk-ui-status")!.textContent).toContain("Drop the file on Left or Right to open it");
  });

  it("lists its keyboard shortcuts on ?", () => {
    render(<TextCompare />);
    const more = screen.getByRole("button", { name: "More actions" });
    more.focus();
    fireEvent.keyDown(more, { key: "?" });
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect([...dialog.querySelectorAll("dd")].map((item) => item.textContent)).toEqual([
      "Swap Left and Right (Ctrl+Z does not undo it)",
      "Next change (outside the text fields)",
      "Previous change (outside the text fields)",
      "Next change",
      "Previous change",
      "Show this list",
    ]);
    expect([...dialog.querySelectorAll("dt")].map((keys) => keys.textContent)).toEqual(["CtrlEnter", "Alt↓", "Alt↑", "F7", "ShiftF7", "?"]);
  });
});
