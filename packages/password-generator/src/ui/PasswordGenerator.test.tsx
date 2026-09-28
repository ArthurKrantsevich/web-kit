import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const list = () => screen.queryByRole("list");
const passwords = () => within(list()!).getAllByRole("listitem").map((item) => item.querySelector("code")!.textContent!);
// The visible status; its live region speaks at a slower pace (PasswordGenerator.actions.test.tsx).
const status = () => document.querySelector(".wk-password__summary")!.textContent;
const WORDS = async () => ["apple", "brick", "cloud", "delta"];

describe("PasswordGenerator", () => {
  it("makes five 20-character passwords after it mounts, with their entropy, strength and time to crack", async () => {
    render(<PasswordGenerator />);
    await waitFor(() => expect(list()).not.toBeNull());
    expect(passwords().map((password) => password.length)).toEqual([20, 20, 20, 20, 20]);
    expect(status()).toBe("5 passwords · 20 characters from 94");
    expect(document.querySelector(".wk-password__bits")!.textContent).toMatch(/^130\.\d bits · Very strong · centuries to crack$/);
    expect(screen.getByRole("button", { name: "Copy password 1" })).toBeTruthy();
    const before = passwords();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(passwords()).not.toEqual(before);
  });

  it("says why nothing can be made, and turns Regenerate off", async () => {
    render(<PasswordGenerator initialSettings={{ lower: false, upper: false, digits: false, symbols: false }} />);
    await waitFor(() => expect(status()).toBe("Choose at least one set of characters"));
    expect(list()).toBeNull();
    const regenerate = screen.getByRole("button", { name: "Regenerate" });
    expect(regenerate.getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelector(".wk-password__bits")!.textContent).toBe("No entropy to measure");
  });

  it("switches modes in one options box, and makes passphrases from the word list, PINs and memorable passwords", async () => {
    render(<PasswordGenerator loadWordlist={WORDS} initialSettings={{ count: 3 }} />);
    await waitFor(() => expect(list()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Words" }));
    await waitFor(() => expect(passwords()[0]!.split("-")).toHaveLength(6));
    expect(passwords().every((passphrase) => passphrase.split("-").every((word) => ["apple", "brick", "cloud", "delta"].includes(word)))).toBe(true);
    expect(screen.getByRole("group", { name: "Options for Words" }).querySelector('[data-active="true"]')!.getAttribute("data-panel")).toBe("words");
    fireEvent.click(screen.getByRole("button", { name: "PIN" }));
    expect(passwords().every((pin) => /^\d{6}$/.test(pin))).toBe(true);
    // 110: counted with Python over all 10⁶ PINs.
    expect(status()).toBe("3 PINs · 6 digits, 110 obvious PINs left out");
    fireEvent.click(screen.getByRole("button", { name: "Memorable" }));
    expect(passwords().every((password) => /^([A-Z][a-z]+\d?-){2}[A-Z][a-z]+\d?$/.test(password))).toBe(true);
    expect(screen.getByRole("spinbutton", { name: "Count" })).toBeTruthy();
    expect(screen.queryByRole("spinbutton", { name: "PIN length" })).toBeNull();
  });

  it("never puts a password into storage, a link or the console, and forgets them on Clear", async () => {
    const logs = ["log", "info", "warn", "error", "debug"].map((name) => vi.spyOn(console, name as "log"));
    render(<PasswordGenerator />);
    await waitFor(() => expect(list()).not.toBeNull());
    const made = passwords();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await act(async () => fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Save input in this browser" })));
    const saved = Object.keys(localStorage).map((key) => localStorage.getItem(key)).join("\n");
    expect(saved).toContain('"mode":"characters"');
    for (const password of made) expect([saved.includes(password), location.href.includes(password)]).toEqual([false, false]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(list()).toBeNull();
    expect(document.body.textContent).not.toContain(made[0]);
    expect(status()).toBe("Cleared.");
    expect(logs.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });
});
