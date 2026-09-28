import { compressText, SETTLE_DELAY } from "@web-kit/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UuidGenerator } from "./UuidGenerator";

// Lets a test make generateIds throw, as an unforeseen bug in the core would.
const control = vi.hoisted(() => ({ fail: false }));
vi.mock("../core/generate", async (original) => {
  const real = await original<typeof import("../core/generate")>();
  return {
    ...real,
    generateIds: (...args: Parameters<typeof real.generateIds>) => {
      if (control.fail) throw new TypeError("something inside broke");
      return real.generateIds(...args);
    },
  };
});

beforeEach(() => {
  control.fail = false;
  localStorage.clear();
  history.replaceState(null, "", "/tools/uuid-generator/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The visible status; its live region (role="status") speaks at a slower pace.
const status = () => document.querySelector(".wk-uuid__summary")!.textContent;

const ids = () => (screen.getByRole("textbox", { name: "IDs" }) as HTMLTextAreaElement).value;
/** The status line's live region: what a screen reader hears. */
const heard = () => document.querySelector(".wk-ui-status [role='status']")!.textContent;

// Waits of about a second for the live regions: seconds on a slow CI runner.
describe("UuidGenerator's names, options and announcements", { timeout: 20_000 }, () => {
  it("pairs each name with its UUID on the same line, skips empty lines, and labels the Names column", async () => {
    render(<UuidGenerator initialSettings={{ kind: "v5", names: "www.example.com\n\nexample.org\n" }} />);
    // The empty line and the trailing newline make no UUID, and keep their lines so the rows stay paired.
    await waitFor(() => expect(ids()).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2\n\naad03681-8b63-5304-89e0-8ca8f49461b5\n"));
    expect(document.querySelector(".wk-ui-status .wk-uuid__summary")!.textContent).toMatch(/^2 UUIDs, version 5 · /);
    expect(screen.getByText("Names", { selector: "label" }).getAttribute("for")).toBe(screen.getByRole("textbox", { name: "Names" }).id);
    const [names, column] = [screen.getByRole("textbox", { name: "Names" }), screen.getByRole("textbox", { name: "IDs" })];
    expect([names.closest(".wk-ui-pane"), names.getAttribute("wrap"), column.getAttribute("wrap")]).toEqual([column.closest(".wk-ui-pane"), "off", "off"]);
    // As JSON too: valid, and each UUID on its name's line.
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(ids()).toBe('["2ed6657d-e927-568b-95e1-2665a8aea6a2",\n\n "aad03681-8b63-5304-89e0-8ca8f49461b5"]\n');
    expect(JSON.parse(ids())).toEqual(["2ed6657d-e927-568b-95e1-2665a8aea6a2", "aad03681-8b63-5304-89e0-8ca8f49461b5"]);
  });

  it("keeps only fields in the options zone: a line of facts for the plain kinds, with what the kind is in its tooltip", async () => {
    render(<UuidGenerator initialSettings={{ kind: "v4" }} />);
    await waitFor(() => expect(ids().split("\n")).toHaveLength(10));
    const zone = () => document.querySelector(".wk-uuid__options [data-active='true']")!;
    const facts = zone().querySelector(".wk-uuid__facts")!;
    expect(facts.textContent).toBe("122 random bits · a 50% chance of one repeat only after about 2.7 × 10¹⁸ IDs");
    expect(zone().querySelectorAll("input, textarea, button, p")).toHaveLength(0);
    expect(document.getElementById(facts.getAttribute("aria-describedby")!)!.textContent).toBe("122 random bits: the usual choice for an ID nobody can guess.");
    fireEvent.click(screen.getByRole("button", { name: "Kind" }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "Kind" })).getByRole("option", { name: "UUID v5" }));
    expect(zone().querySelector("textarea, p")).toBeNull();
    expect(within(zone() as HTMLElement).getByRole("button", { name: "Namespace" })).toBeTruthy();
  });

  it("focuses Inspect after Inspect the first ID, says a short summary after a pause, and says each regeneration", async () => {
    render(<UuidGenerator initialSettings={{ kind: "v7" }} />);
    await waitFor(() => expect(ids()).not.toBe(""));
    const regenerate = screen.getByRole("button", { name: "Regenerate" });
    expect(regenerate.querySelector("path")!.getAttribute("d")).toMatch(/^M20 12a8 8/);
    fireEvent.click(regenerate);
    const first = heard();
    fireEvent.click(regenerate);
    expect([first?.trim(), heard()?.trim(), first === heard()]).toEqual(["Regenerated 10 IDs", "Regenerated 10 IDs", false]);
    fireEvent.click(screen.getByRole("button", { name: "Inspect the first ID" }));
    const field = screen.getByRole("textbox", { name: "Inspect" });
    expect(document.activeElement).toBe(field);
    // The fields are shown at once but are not a live region; a one-line summary is said once the text settles.
    const result = document.querySelector(".wk-uuid__result")!;
    expect([result.getAttribute("role"), result.getAttribute("aria-live"), result.closest("[aria-live]")]).toEqual([null, null, null]);
    const live = () => document.querySelector(".wk-uuid__inspect [role='status']")!.textContent;
    expect(live()).toBe("");
    await act(() => new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY + 100)));
    expect(live()).toBe("Version 7: Unix time in milliseconds, then random bits");
  });
});

describe("UuidGenerator with input it cannot use", () => {
  it("opens a share link whose custom namespace is named like an object property, and says it is not a UUID", async () => {
    const state = { kind: "v5", namespace: "custom", customNamespace: "constructor", names: "a" };
    history.replaceState(null, "", `/tools/uuid-generator/#uuid-generator=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<UuidGenerator />);
    await waitFor(() => expect(status()).toBe('The namespace "constructor" is not a UUID'));
    expect(screen.getByRole("button", { name: "Regenerate" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("writes a NanoID as it was made, even when it looks like a UUID or a ULID", async () => {
    const ids = () => (screen.getByRole("textbox", { name: "IDs" }) as HTMLTextAreaElement).value.split("\n");
    // 32 hex digits: what formatUuid would take for a UUID and give hyphens, braces and upper case.
    const { unmount } = render(
      <UuidGenerator initialSettings={{ kind: "nanoid", size: 32, alphabet: "custom", customAlphabet: "0123456789abcdef", upper: true, wrap: "braces" }} />,
    );
    await waitFor(() => expect(ids()).toHaveLength(10));
    expect(ids().every((id) => /^[0-9a-f]{32}$/.test(id))).toBe(true);
    unmount();
    // 26 characters of Crockford's Base32 in lower case: what formatUuid would take for a ULID and write in upper case.
    render(<UuidGenerator initialSettings={{ kind: "nanoid", size: 26, alphabet: "custom", customAlphabet: "0123456789abcdefghjkmnpqrstvwxyz" }} />);
    await waitFor(() => expect(ids()).toHaveLength(10));
    expect(ids().every((id) => /^[0-9a-hjkmnp-tv-z]{26}$/.test(id))).toBe(true);
  });

  it("shows a generator that throws as a message, and keeps working", async () => {
    control.fail = true;
    render(<UuidGenerator />);
    await waitFor(() => expect(status()).toBe("Could not make the IDs: something inside broke"));
    expect(screen.getByRole("button", { name: "Kind" })).toBeTruthy();
  });
});
