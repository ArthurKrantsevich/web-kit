import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const button = () => screen.getByRole("button", { name: "Sample" });
const tip = () => screen.getByRole("tooltip");
const shown = () => tip().getAttribute("data-state") === "open";

function renderButton() {
  render(
    <Button icon="sample" tooltip="Load an example">
      Sample
    </Button>,
  );
}

describe("Tooltip", () => {
  it("describes the button without changing its name", () => {
    renderButton();
    expect(button().getAttribute("aria-describedby")).toBe(tip().id);
    expect(tip().textContent).toBe("Load an example");
    // Without the Popover API (jsdom, old browsers) the tip is a plain fixed element shown by its data-state.
    expect(tip().hasAttribute("popover")).toBe(false);
  });

  it("keeps a description the element already had", () => {
    render(
      <>
        <span id="extra">More</span>
        <Tooltip content="Tip">
          <button type="button" aria-describedby="extra">
            Go
          </button>
        </Tooltip>
      </>,
    );
    expect(screen.getByRole("button", { name: "Go" }).getAttribute("aria-describedby")).toBe(`extra ${tip().id}`);
  });

  it("appears after 400 ms of mouse hover and hides when the pointer leaves", () => {
    renderButton();
    fireEvent.pointerEnter(button(), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(399));
    expect(shown()).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(shown()).toBe(true);
    fireEvent.pointerLeave(button(), { pointerType: "mouse" });
    expect(shown()).toBe(false);
  });

  it("does not appear when the pointer leaves before the delay", () => {
    renderButton();
    fireEvent.pointerEnter(button(), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerLeave(button(), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(1000));
    expect(shown()).toBe(false);
  });

  it("appears at once on keyboard focus and hides on blur", () => {
    renderButton();
    fireEvent.focus(button());
    expect(shown()).toBe(true);
    fireEvent.blur(button());
    expect(shown()).toBe(false);
  });

  it("does not appear on focus that follows a pointer press", () => {
    renderButton();
    fireEvent.pointerDown(button(), { pointerType: "mouse" });
    fireEvent.focus(button());
    fireEvent.pointerUp(button(), { pointerType: "mouse" });
    expect(shown()).toBe(false);
  });

  it("appears on keyboard focus after a press that was released elsewhere", () => {
    renderButton();
    fireEvent.pointerDown(button(), { pointerType: "mouse" });
    // The pointer is dragged off the button and released over the page.
    fireEvent.pointerUp(document.body, { pointerType: "mouse" });
    fireEvent.blur(button());
    fireEvent.focus(button());
    expect(shown()).toBe(true);
  });

  it("appears on keyboard focus after a cancelled press", () => {
    renderButton();
    fireEvent.pointerDown(button(), { pointerType: "mouse" });
    fireEvent.pointerCancel(document.body, { pointerType: "mouse" });
    fireEvent.focus(button());
    expect(shown()).toBe(true);
  });

  it("never appears for touch", () => {
    renderButton();
    fireEvent.pointerEnter(button(), { pointerType: "touch" });
    fireEvent.pointerDown(button(), { pointerType: "touch" });
    fireEvent.focus(button());
    act(() => vi.advanceTimersByTime(1000));
    expect(shown()).toBe(false);
  });

  it("hides on Escape and on click", () => {
    renderButton();
    fireEvent.focus(button());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(shown()).toBe(false);
    fireEvent.pointerEnter(button(), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.click(button());
    expect(shown()).toBe(false);
  });

  it("shows one tooltip at a time", () => {
    render(
      <>
        <Button tooltip="First tip">One</Button>
        <Button tooltip="Second tip">Two</Button>
      </>,
    );
    const open = () =>
      screen
        .getAllByRole("tooltip")
        .filter((element) => element.getAttribute("data-state") === "open")
        .map((element) => element.textContent);
    fireEvent.pointerEnter(screen.getByRole("button", { name: "One" }), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(400));
    expect(open()).toEqual(["First tip"]);
    fireEvent.focus(screen.getByRole("button", { name: "Two" }));
    expect(open()).toEqual(["Second tip"]);
  });

  it("hides when the window is resized or scrolled", () => {
    renderButton();
    fireEvent.focus(button());
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(shown()).toBe(false);
    fireEvent.blur(button());
    fireEvent.focus(button());
    expect(shown()).toBe(true);
    fireEvent.scroll(window);
    expect(shown()).toBe(false);
  });

  it("uses the top layer when the browser has the Popover API", () => {
    const show = vi.fn();
    const hide = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "showPopover", { value: show, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "hidePopover", { value: hide, configurable: true });
    try {
      renderButton();
      expect(screen.getByRole("tooltip", { hidden: true }).getAttribute("popover")).toBe("manual");
      fireEvent.focus(button());
      expect(show).toHaveBeenCalledTimes(1);
      fireEvent.blur(button());
      expect(hide).toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
      delete (HTMLElement.prototype as { hidePopover?: unknown }).hidePopover;
    }
  });
});
