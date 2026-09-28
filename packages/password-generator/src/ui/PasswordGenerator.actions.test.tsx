import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordGenerator } from "./PasswordGenerator";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/password-generator/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const items = () => document.querySelectorAll(".wk-password__item");
/** The status line's live region: what a screen reader hears. */
const heard = () => document.querySelector(".wk-ui-status [role='status']")!.textContent;
const describedBy = (element: Element) => document.getElementById(element.getAttribute("aria-describedby")!)!.textContent;

describe("PasswordGenerator's actions", () => {
  it("keeps Clear on after clearing, as in every tool, and does not claim the clipboard is empty", async () => {
    render(<PasswordGenerator />);
    await waitFor(() => expect(items()).toHaveLength(5));
    const clear = screen.getByRole("button", { name: "Clear" });
    clear.focus();
    fireEvent.click(clear);
    expect(items()).toHaveLength(0);
    expect([clear.hasAttribute("disabled"), clear.getAttribute("aria-disabled"), document.activeElement === clear]).toEqual([false, null, true]);
    expect(document.querySelector(".wk-password__empty")!.textContent).toBe(
      "Cleared.Regenerate to make new ones. Anything you copied stays on your clipboard until you copy something else.",
    );
  });

  it("says each regeneration, even with the same settings, and shows a refresh icon, not a spinner", async () => {
    render(<PasswordGenerator />);
    await waitFor(() => expect(items()).toHaveLength(5));
    const regenerate = screen.getByRole("button", { name: "Regenerate" });
    expect(regenerate.querySelector("path")!.getAttribute("d")).toMatch(/^M20 12a8 8/);
    fireEvent.click(regenerate);
    const first = heard();
    fireEvent.click(regenerate);
    const second = heard();
    expect([first?.trim(), second?.trim(), first === second]).toEqual(["Regenerated 5 passwords", "Regenerated 5 passwords", false]);
  });

  it("says the strength in a short line, with the whole sentence in its tooltip", async () => {
    render(<PasswordGenerator />);
    await waitFor(() => expect(items()).toHaveLength(5));
    const bits = document.querySelector(".wk-password__bits")!;
    expect(bits.textContent).toMatch(/^130\.\d bits · Very strong · centuries to crack$/);
    expect(describedBy(bits)).toMatch(/^130\.\d bits: very strong\. Cracking takes centuries at 10¹⁰ guesses per second \(a fast hash, offline\)\.$/);
  });
});
