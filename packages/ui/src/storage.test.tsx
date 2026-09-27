import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOT_SAVED, SAVE_DELAY, usePersistentState, type PersistentState } from "./storage";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function Probe({ onState }: { onState: (state: PersistentState) => void }) {
  onState(usePersistentState("json-formatter"));
  return null;
}

function renderProbe() {
  const states: PersistentState[] = [];
  const view = render(<Probe onState={(state) => states.push(state)} />);
  return { latest: () => states.at(-1)!, view };
}

describe("usePersistentState", () => {
  it("is off by default and stores nothing", () => {
    const { latest } = renderProbe();
    expect(latest()).toMatchObject({ available: true, enabled: false, saved: null, ready: true, hasSaved: false });
    act(() => latest().save("secret"));
    expect(localStorage.length).toBe(0);
  });

  it("turning it on saves at once; later changes are saved after a pause", () => {
    vi.useFakeTimers();
    const { latest } = renderProbe();
    act(() => latest().setEnabled(true, "first"));
    expect(localStorage.getItem("wk:json-formatter:autosave")).toBe("1");
    expect(localStorage.getItem("wk:json-formatter:input")).toBe("first");
    act(() => latest().save("second"));
    act(() => latest().save("third"));
    act(() => vi.advanceTimersByTime(SAVE_DELAY - 1));
    expect(localStorage.getItem("wk:json-formatter:input")).toBe("first");
    act(() => vi.advanceTimersByTime(1));
    expect(localStorage.getItem("wk:json-formatter:input")).toBe("third");
  });

  it("brings the saved text back on the next visit", () => {
    localStorage.setItem("wk:json-formatter:autosave", "1");
    localStorage.setItem("wk:json-formatter:input", "kept");
    const { latest } = renderProbe();
    expect(latest()).toMatchObject({ enabled: true, saved: "kept", hasSaved: true });
  });

  it("ignores a stored text without the flag", () => {
    localStorage.setItem("wk:json-formatter:input", "stale");
    const { latest } = renderProbe();
    expect(latest()).toMatchObject({ enabled: false, saved: null });
  });

  it("turning it off deletes the flag and the text, and drops a pending save", () => {
    vi.useFakeTimers();
    const { latest } = renderProbe();
    act(() => latest().setEnabled(true, "a"));
    act(() => latest().save("b"));
    act(() => latest().setEnabled(false, "b"));
    act(() => vi.advanceTimersByTime(SAVE_DELAY));
    expect(localStorage.length).toBe(0);
    expect(latest()).toMatchObject({ enabled: false, hasSaved: false });
  });

  it("Clear saved deletes the text but keeps saving on", () => {
    vi.useFakeTimers();
    const { latest } = renderProbe();
    act(() => latest().setEnabled(true, "a"));
    act(() => latest().clear());
    expect(localStorage.getItem("wk:json-formatter:input")).toBeNull();
    expect(latest()).toMatchObject({ enabled: true, hasSaved: false });
    act(() => latest().save("next"));
    act(() => vi.advanceTimersByTime(SAVE_DELAY));
    expect(localStorage.getItem("wk:json-formatter:input")).toBe("next");
  });

  it("saves a pending change when the page is hidden or the tool unmounts", () => {
    vi.useFakeTimers();
    const { latest, view } = renderProbe();
    act(() => latest().setEnabled(true, "a"));
    act(() => latest().save("before leaving"));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(localStorage.getItem("wk:json-formatter:input")).toBe("before leaving");
    act(() => latest().save("before unmount"));
    view.unmount();
    expect(localStorage.getItem("wk:json-formatter:input")).toBe("before unmount");
  });

  it("deletes the older copy and says so when the browser refuses to store the text", () => {
    const { latest } = renderProbe();
    act(() => latest().setEnabled(true, "small"));
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === "wk:json-formatter:input" && value.length > 10) throw new DOMException("full", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    act(() => latest().setEnabled(true, "x".repeat(11)));
    expect(localStorage.getItem("wk:json-formatter:input")).toBeNull();
    expect(latest()).toMatchObject({ error: NOT_SAVED, hasSaved: false });
  });

  it("is unavailable where storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const { latest } = renderProbe();
    expect(latest()).toMatchObject({ available: false, enabled: false, ready: true });
    act(() => latest().setEnabled(true, "a"));
    expect(latest().enabled).toBe(false);
  });
});
