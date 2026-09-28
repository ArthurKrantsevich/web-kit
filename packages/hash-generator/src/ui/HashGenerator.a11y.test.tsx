import { compressText, SETTLE_DELAY } from "@web-kit/ui";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashAll } from "../core/hash";
import type { HashResults } from "../core/types";
import { ALL_ALGORITHMS, EXTRA_ALGORITHMS } from "../extra/index";
import type { HashJob } from "../job";
import type { HashJobRunner } from "../worker-client";
import { HashGenerator } from "./HashGenerator";
import { formatSize, MAX_FILE_BYTES } from "./useHashGenerator";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/hash-generator/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SHA3_256_ABC = "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532";
const value = (name: string) => screen.getByText(name, { selector: ".wk-hash__algorithm" }).closest("li")!.querySelector(".wk-hash__value")!.textContent;
/** What the status line's live region says (the visible line may say more, and sooner). */
const spoken = () => document.querySelector(".wk-ui-status [role='status']")!.textContent;
const verdict = () => document.querySelector(".wk-hash__verdict")!.textContent;
const loadExtra = () => Promise.resolve(EXTRA_ALGORITHMS);
const pause = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

// Real hashing on the page in jsdom, and waits of about a second for the live regions: seconds on a slow CI runner.
describe("HashGenerator for keyboard and screen reader users", { timeout: 20_000 }, () => {
  it("moves focus to Verify after Check them, and to the text after Back to text", async () => {
    const jobs: { job: HashJob; resolve: (results: HashResults) => void }[] = [];
    const runner: HashJobRunner = { run: (job) => new Promise((resolve) => jobs.push({ job, resolve })), cancel: () => {}, dispose: () => {} };
    render(<HashGenerator initialSettings={{ text: "abc" }} loadExtra={loadExtra} createRunner={() => runner} />);
    await waitFor(() => expect(value("CRC32")).toBe("352441c2"));
    fireEvent.change(screen.getByRole("textbox", { name: "Verify" }), { target: { value: SHA3_256_ABC } });
    const check = screen.getByRole("button", { name: "Check them" });
    check.focus();
    fireEvent.click(check);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Verify" }));
    fireEvent.drop(document.querySelector(".wk-hash__pane--input")!, { dataTransfer: { types: ["Files"], files: [new File(["abc"], "a.bin")] } });
    const back = await screen.findByRole("button", { name: "Back to text" });
    back.focus();
    fireEvent.click(back);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Text" }));
  });

  it("announces a file's progress at the start, at every 25 % and at the end, and a typed text's status only after a pause", async () => {
    const jobs: { job: HashJob; progress?: (share: number) => void; resolve: (results: HashResults) => void }[] = [];
    const runner: HashJobRunner = { run: (job, progress) => new Promise((resolve) => jobs.push({ job, progress, resolve })), cancel: () => {}, dispose: () => {} };
    render(<HashGenerator createRunner={() => runner} />);
    fireEvent.drop(document.querySelector(".wk-hash__pane--input")!, { dataTransfer: { types: ["Files"], files: [new File(["abc"], "report.bin")] } });
    await waitFor(() => expect(jobs).toHaveLength(1));
    const heard: string[] = [];
    const listen = () => {
      const now = spoken() ?? "";
      if (heard.at(-1) !== now) heard.push(now);
    };
    listen();
    for (const share of [0.1, 0.2, 0.3, 0.45, 0.55, 0.8, 0.95]) {
      act(() => jobs[0]!.progress!(share));
      listen();
    }
    const { job, resolve } = jobs[0]!;
    const result = await hashAll(job.blob, { algorithms: ALL_ALGORITHMS.filter((algorithm) => job.algorithms.includes(algorithm.id)) });
    await act(async () => resolve(result.ok ? result.value : {}));
    await waitFor(() => expect(spoken()).toBe("Hashed report.bin (3 B)"), { timeout: SETTLE_DELAY * 3 });
    listen();
    expect(heard).toEqual(["Hashing report.bin…", "Hashing report.bin… 25%", "Hashing report.bin… 50%", "Hashing report.bin… 75%", "Hashed report.bin (3 B)"]);
    // Typing: the visible line follows each key, the live region waits for a pause.
    fireEvent.click(screen.getByRole("button", { name: "Back to text" }));
    await pause(SETTLE_DELAY + 100);
    const before = spoken();
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "ab" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "abcd" } });
    expect(document.querySelector(".wk-hash__summary")!.textContent).toBe("Hashed 4 bytes of text");
    expect(spoken()).toBe(before);
    await waitFor(() => expect(spoken()).toBe("Hashed 4 bytes of text"), { timeout: SETTLE_DELAY * 3 });
  });

  it("labels Verify and the HMAC key, says briefly how many more algorithms have a pasted hash's length, and never offers them with HMAC", async () => {
    render(<HashGenerator initialSettings={{ text: "abc" }} loadExtra={loadExtra} />);
    await waitFor(() => expect(value("CRC32")).toBe("352441c2"));
    expect(document.querySelector(".wk-hash__verify .wk-ui-field")!.textContent).toBe("Verify");
    expect(document.querySelector(".wk-hash__hmac .wk-ui-field")!.textContent).toBe("Key");
    // Empty: the placeholder alone asks for a hash; the verdict adds nothing.
    expect([screen.getByRole("textbox", { name: "Verify" }).getAttribute("placeholder"), verdict()]).toEqual(["Paste a hash to verify", ""]);
    fireEvent.change(screen.getByRole("textbox", { name: "Verify" }), { target: { value: SHA3_256_ABC } });
    expect(verdict()).toBe("No match yet; 4 more algorithms have this length");
    const said = document.querySelector(".wk-hash__verdict")!;
    expect(document.getElementById(said.getAttribute("aria-describedby")!)!.textContent).toBe("SHA-512/256, SHA3-256, BLAKE2s-256 and BLAKE3-256 have this length");
    fireEvent.click(screen.getByRole("switch", { name: "HMAC" }));
    fireEvent.change(screen.getByRole("textbox", { name: "HMAC key" }), { target: { value: "key" } });
    await waitFor(() => expect(value("HMAC-SHA-256")).toMatch(/^[0-9a-f]{64}$/));
    // With a key the extra algorithms have no HMAC: nothing more to offer.
    expect(verdict()).toBe("No algorithm matches");
    expect(screen.queryByRole("button", { name: "Check them" })).toBeNull();
  });

  it("forgets the HMAC key on Clear, and opens a link with HMAC on as HMAC off, since the key never travels", async () => {
    render(<HashGenerator initialSettings={{ text: "abc", hmac: true }} />);
    const key = screen.getByRole("textbox", { name: "HMAC key" }) as HTMLInputElement;
    fireEvent.change(key, { target: { value: "k3y" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(key.value).toBe("");
    cleanup();
    history.replaceState(null, "", `/tools/hash-generator/#hash-generator=${await compressText(JSON.stringify({ v: 1, state: { text: "abc", hmac: true } }))}`);
    render(<HashGenerator />);
    await waitFor(() => expect(value("SHA-256")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
    expect((screen.getByRole("switch", { name: "HMAC" }) as HTMLInputElement).checked).toBe(false);
  });

  it("writes the file limit as 512 MB", () => {
    expect([formatSize(MAX_FILE_BYTES), formatSize(1024), formatSize(1536), formatSize(3)]).toEqual(["512 MB", "1 KB", "1.5 KB", "3 B"]);
  });
});
