import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextCompare } from "./TextCompare";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const area = (side: "Left" | "Right") => screen.getByRole("textbox", { name: new RegExp(`^${side}`) }) as HTMLTextAreaElement;
const type = (side: "Left" | "Right", value: string) => fireEvent.change(area(side), { target: { value } });
const body = () => document.querySelector(".wk-compare__body") as HTMLElement;
const status = () => document.querySelector(".wk-ui-status")!.textContent;
const groups = () => within(body()).queryAllByRole("group");
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const tooltipOf = (element: HTMLElement) =>
  element
    .getAttribute("aria-describedby")
    ?.split(" ")
    .map((id) => document.getElementById(id)?.textContent)
    .join(" ");

function mockClipboard() {
  const writeText = vi.fn((_text: string) => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText, readText: () => Promise.resolve("pasted\n") }, configurable: true });
  return writeText;
}

function openIgnore() {
  fireEvent.click(screen.getByRole("button", { name: /^Ignore/ }));
  return screen.getByRole("menu", { name: "Ignore" });
}

const numbered = (count: number, change: Record<number, string> = {}) =>
  Array.from({ length: count }, (_, i) => change[i + 1] ?? `line ${i + 1}`).join("\n") + "\n";

describe("TextCompare", () => {
  it("compares the two texts side by side and counts the lines in the header", () => {
    render(<TextCompare initialLeft={"same\nold words here\nxyz\n"} initialRight={"same\nnew words here\nadded\nmore\n"} />);
    expect(groups()).toHaveLength(1);
    expect(document.querySelector(".wk-compare__counts")!.textContent).toBe("+2−1~1");
    expect(status()).toBe("1 change: +2 −1 ~1 lines");
    expect([...body().querySelectorAll(".wk-compare__hl")].map((mark) => mark.textContent)).toEqual(["old", "new"]);
    expect(screen.getByRole("status").textContent).toBe("1 change");
  });

  it("switches to one column and to characters", () => {
    render(<TextCompare initialLeft={"colour\n"} initialRight={"color\n"} />);
    fireEvent.click(screen.getByRole("button", { name: "Inline" }));
    expect(pressed("Inline")).toBe("true");
    expect(body().querySelector(".wk-compare__rows--inline")).not.toBeNull();
    expect([...body().querySelectorAll(".wk-compare__hl")].map((mark) => mark.textContent)).toEqual(["colour", "color"]);
    fireEvent.click(screen.getByRole("button", { name: "Characters" }));
    expect([...body().querySelectorAll(".wk-compare__hl")].map((mark) => mark.textContent)).toEqual(["u"]);
  });

  it("asks for two texts while both are empty, and compares a text with an empty side", () => {
    render(<TextCompare />);
    expect(body().textContent).toBe("Paste or drop two texts to compare.");
    expect(status()).toBe("Nothing to compare yet.");
    type("Right", "only here\n");
    expect(document.querySelector(".wk-compare__counts")!.textContent).toBe("+1−0~0");
  });

  it("says when the texts are identical, and names what is ignored when only that differs", () => {
    render(<TextCompare initialLeft={"a\nb\n"} initialRight={"a\nb\n"} />);
    expect(body().textContent).toBe("Texts are identical.");
    expect(status()).toBe("Texts are identical");
    cleanup();
    // A text field turns every line break into LF, so the CRLF text comes from the start (as from a file).
    render(<TextCompare initialLeft={"a\r\nb\r\n"} initialRight={"a\nb\n"} />);
    expect(body().textContent).toBe("Identical when ignoring line endings.");
    fireEvent.click(within(openIgnore()).getByRole("menuitemcheckbox", { name: "Case" }));
    type("Right", "A\nB\n");
    expect(body().textContent).toBe("Identical when ignoring case and line endings.");
    expect(screen.getByRole("status").textContent).toBe("Identical when ignoring case and line endings");
  });

  it("ignores what the Ignore menu ticks, counts the ticks, and keeps the menu open", () => {
    render(<TextCompare initialLeft={"a  b\nsame\n"} initialRight={"a b\nsame\n"} />);
    const button = screen.getByRole("button", { name: /^Ignore/ });
    expect(button.textContent).toBe("Ignore (1)");
    expect(groups()).toHaveLength(1);
    const menu = openIgnore();
    const whitespace = within(menu).getByRole("menuitemcheckbox", { name: "Whitespace" });
    expect(whitespace.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(whitespace);
    expect(screen.getByRole("menu", { name: "Ignore" })).toBe(menu);
    expect(whitespace.getAttribute("aria-checked")).toBe("true");
    expect(button.textContent).toBe("Ignore (2)");
    expect(body().textContent).toBe("Identical when ignoring whitespace and line endings.");
    // The widest label keeps the button's width: it is there, unseen, from the start.
    expect(button.querySelector(".wk-compare__ignore-label")!.getAttribute("data-widest")).toBe("Ignore (4)");
  });

  it("folds long unchanged runs, shows one on click and all of them from More actions", () => {
    render(<TextCompare initialLeft={numbered(40)} initialRight={numbered(40, { 20: "line 20 changed" })} />);
    expect(within(body()).getAllByRole("button", { name: /unchanged lines$/ }).map((b) => b.textContent)).toEqual([
      "Show 16 unchanged lines",
      "Show 17 unchanged lines",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Show 16 unchanged lines" }));
    expect(within(body()).getAllByRole("button", { name: /unchanged lines$/ })).toHaveLength(1);
    // The fold's button is gone: focus goes to the first line it showed.
    expect((document.activeElement as HTMLElement).textContent).toBe("1line 11line 1");
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Show all unchanged lines" }));
    expect(within(body()).queryAllByRole("button", { name: /unchanged lines$/ })).toEqual([]);
    expect(body().querySelectorAll(".wk-compare__row")).toHaveLength(40);
  });

  it("draws the first 5,000 rows and the rest on Show more", { timeout: 30_000 }, () => {
    const left = Array.from({ length: 5200 }, (_, i) => `left line ${i}`).join("\n");
    const right = Array.from({ length: 5200 }, (_, i) => `right line ${i}`).join("\n");
    render(<TextCompare initialLeft={left} initialRight={right} />);
    expect(body().querySelectorAll(".wk-compare__row")).toHaveLength(5000);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(body().querySelectorAll(".wk-compare__row")).toHaveLength(5200);
  });

  it("goes back to one page of rows when the comparison changes", { timeout: 30_000 }, () => {
    const left = Array.from({ length: 5200 }, (_, i) => `left line ${i}`).join("\n");
    const right = Array.from({ length: 5200 }, (_, i) => `right line ${i}`).join("\n");
    render(<TextCompare initialLeft={left} initialRight={right} />);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(body().querySelector(".wk-compare__more")).toBeNull();
    type("Right", `${right}\nmore`);
    expect(body().querySelector(".wk-compare__more")!.textContent).toBe("Showing 5,000 of 5,201 rows.Show more");
  });

  it("notes different line endings and a missing line break at the end", () => {
    render(<TextCompare initialLeft={"a\r\nb\r\nc\r\n"} initialRight={"a\nB\nc"} />);
    // Short on the line, so it stays one line on a phone; the whole note in its tooltip and for screen readers.
    const notes = [...document.querySelectorAll<HTMLElement>(".wk-compare__note")];
    expect(notes.map((note) => [note.textContent, tooltipOf(note)])).toEqual([
      ["Line endings differ", "Left ends lines with CRLF, Right with LF"],
      ["No final newline (Right)", "Right has no newline at the end"],
    ]);
    expect(notes.every((note) => note.tabIndex === 0)).toBe(true);
    expect(document.querySelector(".wk-ui-status .wk-ui-sr-only")!.textContent).toBe("Left ends lines with CRLF, Right with LF. Right has no newline at the end.");
  });

  it("puts Open file and Paste in each input header, Swap, Sample, Clear and More in the toolbar, and Previous, Next, Download and Copy over the result", () => {
    const { container } = render(<TextCompare />);
    const actions = (row: Element | null) => [...(row?.querySelectorAll("[data-action]") ?? [])].map((button) => button.getAttribute("data-action"));
    expect([...container.querySelectorAll('[data-pane="input"] > .wk-ui-pane__head')].map(actions)).toEqual([
      ["open", "paste"],
      ["open", "paste"],
    ]);
    expect(actions(screen.getByRole("group", { name: "Options" }))).toEqual(["custom", "sample", "clear", "more"]);
    expect(actions(container.querySelector('[data-pane="output"] > .wk-ui-pane__head'))).toEqual(["custom", "custom", "download", "copy"]);
  });

  it("every action says what it does", () => {
    mockClipboard();
    render(<TextCompare initialLeft={"a\n"} initialRight={"b\n"} />);
    const expected: [string, string][] = [
      ["Side by side", "Left and right in two columns that scroll together"],
      ["Inline", "One column: removed lines above added ones"],
      ["Words", "Highlight changed words in changed lines"],
      ["Characters", "Highlight changed characters in changed lines"],
      ["Ignore (1)", "Choose what does not count as a difference"],
      ["Swap", "Swap Left and Right"],
      ["Sample", "Replace both sides with an example"],
      ["Clear", "Empty both sides"],
      ["Open file into Left", "Open a text file into Left (up to 10 MB), or drop it on Left"],
      ["Paste into Left", "Paste from the clipboard into Left"],
      ["Open file into Right", "Open a text file into Right (up to 10 MB), or drop it on Right"],
      ["Paste into Right", "Paste from the clipboard into Right"],
      ["Previous change", "Previous change (Alt+↑ or Shift+F7). 1 change"],
      ["Next change", "Next change (Alt+↓ or F7). 1 change"],
      ["Download", "Save the unified diff as compare.patch"],
      ["Copy patch", "Copy the unified diff to the clipboard"],
      ["More actions", "Load from a URL, share, save, keyboard shortcuts"],
      ["Use left", "Replace these lines on the right with the left ones"],
      ["Use right", "Replace these lines on the left with the right ones"],
    ];
    for (const [name, tip] of expected) expect([name, tooltipOf(screen.getByRole("button", { name }))]).toEqual([name, tip]);
  });

  it("renders its text fields read-only in the server HTML, with Paste's place kept", () => {
    const page = document.createElement("div");
    page.innerHTML = renderToString(<TextCompare initialLeft={"a\n"} initialRight={"b\n"} />);
    const areas = [...page.querySelectorAll("textarea")];
    expect(areas.map((element) => element.hasAttribute("readonly"))).toEqual([true, true]);
    for (const head of page.querySelectorAll('[data-pane="input"] > .wk-ui-pane__head')) {
      expect(head.querySelector('[data-action="paste"]')!.className).toContain("wk-ui-button--pending");
    }
    expect(page.querySelectorAll(".wk-compare__row")).toHaveLength(2);
  });
});

describe("TextCompare navigation", () => {
  const LEFT = numbered(40, {});
  const RIGHT = numbered(40, { 2: "line 2 x", 20: "line 20 y", 38: "line 38 z" });

  it("goes to the next and previous change, marks it and says which it is; the edges are disabled", () => {
    render(<TextCompare initialLeft={LEFT} initialRight={RIGHT} />);
    const previous = screen.getByRole("button", { name: "Previous change" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next change" }) as HTMLButtonElement;
    const current = () => groups().findIndex((group) => group.hasAttribute("data-current"));
    // aria-disabled, not disabled: a button that goes inert while focused keeps the focus.
    const off = (button: HTMLButtonElement) => (button.disabled ? "disabled" : button.getAttribute("aria-disabled") === "true");
    expect([off(previous), off(next), current()]).toEqual([true, false, -1]);
    fireEvent.click(previous);
    expect(current()).toBe(-1);
    fireEvent.click(next);
    expect([current(), screen.getByRole("status").textContent]).toEqual([0, "Change 1 of 3"]);
    expect(tooltipOf(next)).toBe("Next change (Alt+↓ or F7). Change 1 of 3");
    fireEvent.click(next);
    next.focus();
    fireEvent.click(next);
    expect([current(), off(next), off(previous), document.activeElement]).toEqual([2, true, false, next]);
    fireEvent.click(next);
    expect(current()).toBe(2);
    fireEvent.click(previous);
    expect(current()).toBe(1);
  });

  it("moves with Alt+↓ and Alt+↑ outside the text fields, and with F7 and Shift+F7 anywhere", () => {
    render(<TextCompare initialLeft={LEFT} initialRight={RIGHT} />);
    const current = () => groups().findIndex((group) => group.hasAttribute("data-current"));
    const next = screen.getByRole("button", { name: "Next change" });
    // In a text field Alt with an arrow moves the caret, as the system does.
    fireEvent.keyDown(area("Left"), { key: "ArrowDown", altKey: true });
    expect(current()).toBe(-1);
    fireEvent.keyDown(next, { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(area("Left"), { key: "F7" });
    expect(current()).toBe(1);
    fireEvent.keyDown(next, { key: "ArrowUp", altKey: true });
    expect(current()).toBe(0);
    fireEvent.keyDown(area("Right"), { key: "F7" });
    fireEvent.keyDown(area("Right"), { key: "F7", shiftKey: true });
    expect(current()).toBe(0);
  });

  it("scrolls the result so that the current change is in the middle", () => {
    render(<TextCompare initialLeft={LEFT} initialRight={RIGHT} />);
    const target = groups()[2]!;
    Object.defineProperty(body(), "clientHeight", { value: 300, configurable: true });
    Object.defineProperty(target, "offsetTop", { value: 900, configurable: true });
    Object.defineProperty(target, "offsetHeight", { value: 40, configurable: true });
    fireEvent.keyDown(area("Left"), { key: "F7" });
    fireEvent.keyDown(area("Left"), { key: "F7" });
    fireEvent.keyDown(area("Left"), { key: "F7" });
    expect(body().scrollTop).toBe(900 - (300 - 40) / 2);
  });
});

describe("TextCompare starts over on new texts", () => {
  const current = () => groups().findIndex((group) => group.hasAttribute("data-current"));
  const folds = () => within(body()).queryAllByRole("button", { name: /unchanged lines$/ }).length;
  const setUp = () => {
    render(<TextCompare initialLeft={numbered(40)} initialRight={numbered(40, { 20: "line 20 changed" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    fireEvent.click(screen.getByRole("button", { name: "Show 16 unchanged lines" }));
    expect([current(), folds()]).toEqual([0, 1]);
  };

  it("forgets the current change and the opened folds when a text is typed", () => {
    setUp();
    type("Left", numbered(41));
    expect([current(), folds()]).toEqual([-1, 2]);
  });

  for (const action of ["Swap", "Sample"]) {
    it(`forgets them on ${action}`, () => {
      setUp();
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(current()).toBe(-1);
      expect(folds()).toBeGreaterThanOrEqual(action === "Swap" ? 2 : 1);
    });
  }

  it("keeps them after a merge", () => {
    render(<TextCompare initialLeft={numbered(40)} initialRight={numbered(40, { 20: "line 20 changed", 35: "line 35 changed" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    fireEvent.click(within(groups()[0]!).getByRole("button", { name: "Use right" }));
    expect(current()).toBe(0);
  });
});

describe("TextCompare keeps the current change in view", () => {
  const LEFT = numbered(40, {});
  const RIGHT = numbered(40, { 2: "line 2 x", 20: "line 20 y", 38: "line 38 z" });
  // jsdom has no layout: the current change sits 900 px down, 40 px tall, in a result 300 px tall.
  const place = (element: HTMLElement) => (element.dataset.current ? 900 : 0);
  let restore: () => void = () => {};
  function fakeLayout() {
    const top = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop")!;
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
    Object.defineProperty(HTMLElement.prototype, "offsetTop", { configurable: true, get(this: HTMLElement) { return place(this); } });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return 40; } });
    restore = () => {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", top);
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
    };
  }
  afterEach(() => restore());

  it("centres it again after the layout changes", () => {
    render(<TextCompare initialLeft={LEFT} initialRight={RIGHT} />);
    fakeLayout();
    Object.defineProperty(body(), "clientHeight", { value: 300, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    body().scrollTop = 0;
    fireEvent.click(screen.getByRole("button", { name: "Inline" }));
    expect(body().scrollTop).toBe(900 - (300 - 40) / 2);
  });

  it("centres it again after Show all unchanged lines", () => {
    render(<TextCompare initialLeft={LEFT} initialRight={RIGHT} />);
    fakeLayout();
    Object.defineProperty(body(), "clientHeight", { value: 300, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    body().scrollTop = 0;
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Show all unchanged lines" }));
    expect(body().scrollTop).toBe(900 - (300 - 40) / 2);
  });
});

describe("TextCompare merges", () => {
  it("Use right copies a change to the left side, Use left to the right one", () => {
    render(<TextCompare initialLeft={"a\nold\nc\nx\n"} initialRight={"a\nnew\nc\ny\n"} />);
    fireEvent.click(within(groups()[0]!).getByRole("button", { name: "Use right" }));
    expect(area("Left").value).toBe("a\nnew\nc\nx\n");
    expect(groups()).toHaveLength(1);
    fireEvent.click(within(groups()[0]!).getByRole("button", { name: "Use left" }));
    expect(area("Right").value).toBe("a\nnew\nc\nx\n");
    expect(body().textContent).toBe("Texts are identical.");
  });

  it("keeps the scroll of the result and gives focus to the same button of the next change", () => {
    render(<TextCompare initialLeft={numbered(40)} initialRight={numbered(40, { 5: "line 5 x", 20: "line 20 y", 30: "line 30 z" })} />);
    body().scrollTop = 120;
    fireEvent.click(within(groups()[1]!).getByRole("button", { name: "Use right" }));
    expect(groups()).toHaveLength(2);
    expect([body().scrollTop, document.activeElement]).toEqual([120, within(groups()[1]!).getByRole("button", { name: "Use right" })]);
  });

  it("gives focus to Next when no change is left after the merged one", () => {
    render(<TextCompare initialLeft={numbered(40)} initialRight={numbered(40, { 5: "line 5 x", 30: "line 30 y" })} />);
    fireEvent.click(within(groups()[1]!).getByRole("button", { name: "Use left" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next change" }));
    fireEvent.click(within(groups()[0]!).getByRole("button", { name: "Use left" }));
    expect([body().textContent, document.activeElement]).toEqual(["Texts are identical.", screen.getByRole("button", { name: "Next change" })]);
  });

  it("keeps the current change in range after a merge", () => {
    render(<TextCompare initialLeft={"a1\nb\nc1\n"} initialRight={"a2\nb\nc2\n"} />);
    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    fireEvent.click(within(groups()[1]!).getByRole("button", { name: "Use right" }));
    expect(groups().map((group) => group.hasAttribute("data-current"))).toEqual([true]);
  });
});

describe("TextCompare files and export", () => {
  function openInto(name: string, file: File) {
    return act(async () => {
      fireEvent.change(screen.getByLabelText(name, { selector: 'input[type="file"]' }), { target: { files: [file] } });
    });
  }

  it("names a side after its file, with the whole name in the tooltip; Clear forgets it", async () => {
    render(<TextCompare />);
    await openInto("Open file into Left", new File(["one\n"], "a-very-long-file-name-for-the-report.txt"));
    expect(area("Left").value).toBe("one\n");
    expect(screen.getByRole("textbox", { name: "Left: a-very-long-file-name-for-the-report.txt" })).toBe(area("Left"));
    const title = area("Left").closest("section")!.querySelector(".wk-compare__name") as HTMLElement;
    expect([title.textContent, tooltipOf(title)]).toEqual(["a-very-long-file-name-for-the-report.txt", "a-very-long-file-name-for-the-report.txt"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("textbox", { name: "Left" })).toBe(area("Left"));
  });

  it("copies the unified diff, with the file names in its headers", async () => {
    const writeText = mockClipboard();
    render(<TextCompare />);
    await openInto("Open file into Left", new File(["a\nb\n"], "old.txt"));
    await openInto("Open file into Right", new File(["a\nc\n"], "new.txt"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy patch" }));
    });
    expect(writeText).toHaveBeenCalledWith("--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n");
  });

  it("downloads the unified diff as compare.patch", async () => {
    let blob: Blob | undefined;
    const saved: string[] = [];
    Object.defineProperty(URL, "createObjectURL", {
      value: (value: Blob) => {
        blob = value;
        return "blob:test";
      },
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    render(<TextCompare initialLeft={"a\n"} initialRight={"b\n"} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(saved).toEqual(["compare.patch"]);
    expect([await blob!.text(), blob!.type]).toEqual(["--- left\n+++ right\n@@ -1 +1 @@\n-a\n+b\n", "text/x-diff"]);
  });

  it("disables Download and Copy when there is nothing to export", () => {
    render(<TextCompare initialLeft={"a\n"} initialRight={"a\n"} />);
    for (const name of ["Download", "Copy patch"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("swaps the sides with their names, and loads a sample", async () => {
    render(<TextCompare />);
    await openInto("Open file into Left", new File(["l\n"], "l.txt"));
    type("Right", "r\n");
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect([area("Left").value, area("Right").value]).toEqual(["r\n", "l\n"]);
    expect(screen.getByRole("textbox", { name: "Right: l.txt" })).toBe(area("Right"));
    fireEvent.keyDown(area("Left"), { key: "Enter", ctrlKey: true });
    expect(area("Left").value).toBe("l\n");
    fireEvent.click(screen.getByRole("button", { name: "Sample" }));
    expect(groups().length).toBeGreaterThan(1);
    expect(screen.getByRole("textbox", { name: "Left" })).toBe(area("Left"));
  });

  it("pastes into one side", async () => {
    mockClipboard();
    render(<TextCompare initialLeft={"a\n"} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Paste into Right" }));
    });
    expect(area("Right").value).toBe("pasted\n");
  });
});
