import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

afterEach(() => {
  cleanup();
  delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
  delete (HTMLDialogElement.prototype as { close?: unknown }).close;
});

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        title="Load from a URL"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        footer={<button type="button">Load</button>}
      >
        <input aria-label="URL" data-autofocus />
      </Dialog>
    </>
  );
}

function openDialog() {
  const opener = screen.getByRole("button", { name: "Open" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe("Dialog", () => {
  it("is a modal dialog named by its title, absent while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
    openDialog();
    const dialog = screen.getByRole("dialog", { name: "Load from a URL" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("focuses the data-autofocus field first", () => {
    render(<Harness />);
    openDialog();
    expect(document.activeElement).toBe(screen.getByLabelText("URL"));
  });

  it("keeps Tab and Shift+Tab inside", () => {
    render(<Harness />);
    openDialog();
    const close = screen.getByRole("button", { name: "Close" });
    const load = screen.getByRole("button", { name: "Load" });
    load.focus();
    fireEvent.keyDown(load, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(load);
  });

  it("closes on Escape and gives focus back to the element that opened it", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = openDialog();
    fireEvent.keyDown(screen.getByLabelText("URL"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes with its Close button and on a click on the backdrop, not inside", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();
    fireEvent.click(screen.getByLabelText("URL"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("uses showModal() where the browser has it, and the browser's cancel event closes it", () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { value: showModal, configurable: true });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { value: close, configurable: true });
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();
    expect(showModal).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
