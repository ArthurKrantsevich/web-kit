import { compressText } from "@web-kit/ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

const status = () => document.querySelector(".wk-ui-status [role='status']")!.textContent;

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
