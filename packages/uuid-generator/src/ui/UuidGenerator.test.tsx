import { compressText } from "@web-kit/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UuidGenerator } from "./UuidGenerator";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/uuid-generator/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ids = () => (screen.getByRole("textbox", { name: "IDs" }) as HTMLTextAreaElement).value;
const regenerate = () => screen.getByRole("button", { name: "Regenerate" });
const status = () => document.querySelector(".wk-ui-status [role='status']")!.textContent;
async function choose(label: string, option: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(within(screen.getByRole("listbox", { name: label })).getByRole("option", { name: option }));
}

describe("UuidGenerator", () => {
  it("makes ten v4 UUIDs after it mounts, and new ones on Regenerate", async () => {
    render(<UuidGenerator />);
    await waitFor(() => expect(ids().split("\n")).toHaveLength(10));
    expect(ids().split("\n").every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
    expect(status()).toBe("10 UUIDs, version 4");
    const before = ids();
    fireEvent.click(regenerate());
    expect(ids()).not.toBe(before);
  });

  it("makes one v5 UUID per name, keeps Count's place unseen, and cannot regenerate the same names", async () => {
    render(<UuidGenerator initialSettings={{ names: "www.example.com" }} />);
    await choose("Kind", "UUID v5");
    expect(ids()).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
    expect(document.querySelector(".wk-uuid__count")!.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("spinbutton", { name: "Count" })).toBeNull();
    expect(regenerate().getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: "Names" }), { target: { value: "www.example.com\nexample.org" } });
    expect(ids()).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2\naad03681-8b63-5304-89e0-8ca8f49461b5");
    await choose("Namespace", "Custom");
    fireEvent.change(screen.getByRole("textbox", { name: "Namespace UUID" }), { target: { value: "not a uuid" } });
    expect([ids(), status()]).toEqual(["", 'The namespace "not a uuid" is not a UUID']);
  });

  it("writes the IDs in upper case, in braces, and as a JSON array", async () => {
    render(<UuidGenerator initialSettings={{ kind: "v5", names: "www.example.com", upper: true, wrap: "braces", output: "json" }} />);
    await waitFor(() => expect(ids()).toBe('[\n  "{2ED6657D-E927-568B-95E1-2665A8AEA6A2}"\n]'));
    fireEvent.click(screen.getByRole("button", { name: "Lines" }));
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "URN urn:uuid:…" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Hyphens" }));
    expect(ids()).toBe("urn:uuid:2ED6657DE927568B95E12665A8AEA6A2");
  });

  it("refuses a NanoID alphabet with a repeated character, and says why", async () => {
    render(<UuidGenerator initialSettings={{ kind: "nanoid", alphabet: "custom", customAlphabet: "abca" }} />);
    await waitFor(() => expect(status()).toBe('The alphabet has "a" more than once'));
    expect([ids(), regenerate().getAttribute("aria-disabled")]).toEqual(["", "true"]);
  });

  it("inspects a pasted ID, says why it cannot read one, and inspects the first generated ID on request", async () => {
    render(<UuidGenerator initialSettings={{ kind: "v7" }} />);
    await waitFor(() => expect(ids()).not.toBe(""));
    const field = screen.getByRole("textbox", { name: "Inspect" });
    fireEvent.change(field, { target: { value: "C232AB00-9414-11EC-B3C8-9F6BDECED846" } });
    const result = document.querySelector(".wk-uuid__result")!;
    expect(within(result as HTMLElement).getByText("2022-02-22T19:22:22.0000000Z")).toBeTruthy();
    expect(within(result as HTMLElement).getByText("9f:6b:de:ce:d8:46 (random: the multicast bit is set)")).toBeTruthy();
    fireEvent.change(field, { target: { value: "919108f7-52d1-9320-9bac-f847db4148a8" } });
    expect(result.textContent).toBe("Unknown UUID version 9: RFC 9562 defines versions 1 to 8");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect the first ID" }));
    expect((field as HTMLInputElement).value).toBe(ids().split("\n")[0]);
    expect(result.textContent).toContain("Version 7: Unix time in milliseconds, then random bits");
  });

  it("keeps settings in a share link and the saved input, never the IDs", async () => {
    const state = { kind: "ulid", count: 3, ulidLower: true, output: "sideways", count2: 1 };
    history.replaceState(null, "", `/tools/uuid-generator/#uuid-generator=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<UuidGenerator />);
    await waitFor(() => expect(ids().split("\n")).toHaveLength(3));
    expect(ids().split("\n").every((id) => /^[0-7][0-9a-hjkmnp-tv-z]{25}$/.test(id))).toBe(true);
    expect(screen.getByRole("button", { name: "Lines" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await act(async () => fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Save input in this browser" })));
    const saved = localStorage.getItem("wk:uuid-generator:input") ?? "";
    expect(saved).toContain('"kind":"ulid"');
    for (const id of ids().split("\n")) expect(saved.toLowerCase()).not.toContain(id.toLowerCase());
  });
});
