import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressText, decompressText } from "./share";
import { SAVE_DELAY } from "./storage";
import { ToolMenu, type ToolMenuProps } from "./ToolMenu";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/json-formatter/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface HarnessProps {
  onRestore?: ToolMenuProps["onRestore"];
  onNotice?: (message: string) => void;
  format?: () => void;
}

/** A tool with one text field whose state is { input }. */
function Harness({ onRestore, onNotice = () => {}, format = () => {} }: HarnessProps) {
  const [input, setInput] = useState("[1]");
  const state = useMemo(() => ({ input }), [input]);
  return (
    <div className="wk-ui-editor">
      <ToolMenu
        toolKey="json-formatter"
        state={state}
        onRestore={(value) => {
          onRestore?.(value);
          if (typeof value.input === "string") setInput(value.input);
        }}
        urlTargets={[{ label: "Load Left from URL…", onText: setInput }]}
        shortcuts={[{ keys: "Mod+Enter", label: "Format", run: format }]}
        onNotice={onNotice}
      />
      <textarea aria-label="Input" value={input} onChange={(event) => setInput(event.target.value)} />
    </div>
  );
}

const menuButton = () => screen.getByRole("button", { name: "More actions" });
const input = () => screen.getByLabelText("Input") as HTMLTextAreaElement;

function choose(name: string) {
  fireEvent.click(menuButton());
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

function chooseCheckbox(name: string) {
  fireEvent.click(menuButton());
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name }));
}

describe("ToolMenu", () => {
  it("offers loading from a URL, a share link, saving, clearing and the shortcuts", async () => {
    render(<Harness />);
    fireEvent.click(menuButton());
    const menu = screen.getByRole("menu", { name: "More actions" });
    expect([...menu.querySelectorAll(".wk-ui-option__label")].map((label) => label.textContent)).toEqual([
      "Load Left from URL…",
      "Share link…",
      "Save input in this browser",
      "Clear saved input",
      "Keyboard shortcuts",
    ]);
    expect(screen.getByRole("menuitemcheckbox", { name: "Save input in this browser" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("menuitem", { name: "Clear saved input" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("makes a share link that opens the same state, with the privacy warning", async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: '{"shared":1}' } });
    choose("Share link…");
    const dialog = screen.getByRole("dialog", { name: "Share link" });
    const field = (await within(dialog).findByLabelText("Share link")) as HTMLInputElement;
    expect(dialog.textContent).toContain("Anyone with the link can see the data.");
    expect(dialog.textContent).not.toContain("Messengers");
    const payload = new URLSearchParams(new URL(field.value).hash.slice(1)).get("json-formatter")!;
    expect(await decompressText(payload)).toEqual({ ok: true, value: '{"v":1,"state":{"input":"{\\"shared\\":1}"}}' });
    expect(location.hash).toBe("");
  });

  it("warns that messengers cut links over 8,000 characters", async () => {
    render(<Harness />);
    let seed = 1;
    const noise = Array.from({ length: 12_000 }, () => String.fromCharCode(33 + ((seed = (seed * 48271) % 2147483647) % 90))).join("");
    fireEvent.change(input(), { target: { value: noise } });
    choose("Share link…");
    const dialog = screen.getByRole("dialog", { name: "Share link" });
    await within(dialog).findByLabelText("Share link");
    expect(dialog.querySelector(".wk-ui-warning")?.textContent).toMatch(
      /^This link is [\d,]+ characters long\. Messengers and email may cut links longer than 8,000 characters\.$/,
    );
  });

  it("restores the state of a share link once after hydration and removes the hash", async () => {
    history.replaceState(null, "", `/tools/json-formatter/#json-formatter=${await compressText('{"v":1,"state":{"input":"[42]"}}')}`);
    localStorage.setItem("wk:json-formatter:autosave", "1");
    localStorage.setItem("wk:json-formatter:input", '{"v":1,"state":{"input":"[7]"}}');
    const onRestore = vi.fn();
    render(<Harness onRestore={onRestore} />);
    await waitFor(() => expect(input().value).toBe("[42]"));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe("");
  });

  it("says when a share link is damaged and keeps the tool as it was", async () => {
    history.replaceState(null, "", "/tools/json-formatter/#json-formatter=AAAA");
    const onNotice = vi.fn();
    render(<Harness onNotice={onNotice} />);
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("The shared link is damaged; nothing was loaded from it"));
    expect(input().value).toBe("[1]");
  });

  it("saves the state while saving is on and restores it on the next visit", async () => {
    const onNotice = vi.fn();
    const first = render(<Harness onNotice={onNotice} />);
    chooseCheckbox("Save input in this browser");
    expect(onNotice).toHaveBeenCalledWith("The input is saved in this browser");
    expect(JSON.parse(localStorage.getItem("wk:json-formatter:input")!)).toEqual({ v: 1, state: { input: "[1]" } });
    fireEvent.change(input(), { target: { value: "[2]" } });
    await waitFor(() => expect(localStorage.getItem("wk:json-formatter:input")).toContain("[2]"), { timeout: SAVE_DELAY * 4 });
    first.unmount();

    render(<Harness />);
    await waitFor(() => expect(input().value).toBe("[2]"));
    fireEvent.click(menuButton());
    expect(screen.getByRole("menuitemcheckbox", { name: "Save input in this browser" }).getAttribute("aria-checked")).toBe("true");
  });

  it("turning saving off deletes the saved input; Clear saved input deletes it and keeps saving on", async () => {
    const onNotice = vi.fn();
    render(<Harness onNotice={onNotice} />);
    chooseCheckbox("Save input in this browser");
    choose("Clear saved input");
    expect(onNotice).toHaveBeenLastCalledWith("Saved input cleared");
    expect(localStorage.getItem("wk:json-formatter:input")).toBeNull();
    expect(localStorage.getItem("wk:json-formatter:autosave")).toBe("1");
    chooseCheckbox("Save input in this browser");
    expect(onNotice).toHaveBeenLastCalledWith("Saving is off; the saved input was deleted");
    expect(localStorage.length).toBe(0);
  });

  it("deletes saved data it cannot read and says so", async () => {
    localStorage.setItem("wk:json-formatter:autosave", "1");
    localStorage.setItem("wk:json-formatter:input", "not json");
    const onNotice = vi.fn();
    render(<Harness onNotice={onNotice} />);
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("The saved input could not be read and was deleted"));
    expect(localStorage.getItem("wk:json-formatter:input")).toBeNull();
    expect(input().value).toBe("[1]");
  });

  it("loads a field from a URL and gives focus back to the menu button", async () => {
    const fetch = vi.fn(async () => new Response('{"from":"url"}'));
    vi.stubGlobal("fetch", fetch);
    render(<Harness />);
    choose("Load Left from URL…");
    const dialog = screen.getByRole("dialog", { name: "Load Left from URL" });
    expect(dialog.textContent).toContain("no cookies are sent and nothing passes through web-kit");
    const field = within(dialog).getByLabelText("URL");
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "https://example.com/data.json" } });
    await act(async () => {
      fireEvent.submit(field.closest("form")!);
    });
    expect(input().value).toBe('{"from":"url"}');
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(menuButton());
    expect(fetch).toHaveBeenCalledWith("https://example.com/data.json", expect.objectContaining({ credentials: "omit" }));
  });

  it("shows why a URL cannot be loaded, and keeps the field", async () => {
    render(<Harness />);
    choose("Load Left from URL…");
    const field = screen.getByLabelText("URL");
    fireEvent.change(field, { target: { value: "file:///etc/passwd" } });
    await act(async () => {
      fireEvent.submit(field.closest("form")!);
    });
    expect(screen.getByRole("status").textContent).toBe("Only http: and https: addresses can be loaded");
    expect(input().value).toBe("[1]");
  });

  it("lets its own message explain an address without a scheme, instead of the browser's bubble", async () => {
    render(<Harness />);
    choose("Load Left from URL…");
    const field = screen.getByLabelText("URL") as HTMLInputElement;
    expect(field.form?.noValidate).toBe(true);
    fireEvent.change(field, { target: { value: "example.com/data.json" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load" }));
    });
    expect(screen.getByRole("status").textContent).toBe("Enter a full address that starts with https:// or http://");
  });

  it("keeps Copy link disabled until the link exists, then puts focus on the link", async () => {
    render(<Harness />);
    choose("Share link…");
    const dialog = screen.getByRole("dialog", { name: "Share link" });
    expect((within(dialog).getByRole("button", { name: "Copy link" }) as HTMLButtonElement).disabled).toBe(true);
    const field = await within(dialog).findByLabelText("Share link");
    expect((within(dialog).getByRole("button", { name: "Copy link" }) as HTMLButtonElement).disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it("does not overwrite the saved input with a shared link until the input is edited", async () => {
    history.replaceState(null, "", `/tools/json-formatter/#json-formatter=${await compressText('{"v":1,"state":{"input":"[42]"}}')}`);
    localStorage.setItem("wk:json-formatter:autosave", "1");
    localStorage.setItem("wk:json-formatter:input", '{"v":1,"state":{"input":"[7]"}}');
    const view = render(<Harness />);
    await waitFor(() => expect(input().value).toBe("[42]"));
    await new Promise((resolve) => setTimeout(resolve, SAVE_DELAY * 2));
    expect(localStorage.getItem("wk:json-formatter:input")).toContain("[7]");
    fireEvent.change(input(), { target: { value: "[43]" } });
    await waitFor(() => expect(localStorage.getItem("wk:json-formatter:input")).toContain("[43]"), { timeout: SAVE_DELAY * 4 });
    view.unmount();
  });

  it("does not save a shared link on leaving the page when nothing was edited", async () => {
    history.replaceState(null, "", `/tools/json-formatter/#json-formatter=${await compressText('{"v":1,"state":{"input":"[42]"}}')}`);
    localStorage.setItem("wk:json-formatter:autosave", "1");
    localStorage.setItem("wk:json-formatter:input", '{"v":1,"state":{"input":"[7]"}}');
    const view = render(<Harness />);
    await waitFor(() => expect(input().value).toBe("[42]"));
    view.unmount();
    expect(localStorage.getItem("wk:json-formatter:input")).toContain("[7]");
  });

  it("runs shortcuts inside the tool and lists them on ?", () => {
    const format = vi.fn();
    render(<Harness format={format} />);
    fireEvent.keyDown(input(), { key: "Enter", ctrlKey: true });
    expect(format).toHaveBeenCalledTimes(1);
    const button = menuButton();
    button.focus();
    fireEvent.keyDown(button, { key: "?" });
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect([...dialog.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["CtrlEnter", "?"]);
    expect([...dialog.querySelectorAll("dd")].map((text) => text.textContent)).toEqual(["Format", "Show this list"]);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
