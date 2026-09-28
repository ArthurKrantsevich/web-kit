import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashAll } from "../core/hash";
import type { HashResults } from "../core/types";
import { ALL_ALGORITHMS } from "../extra/index";
import type { HashJob } from "../job";
import type { HashJobRunner } from "../worker-client";
import { HashGenerator } from "./HashGenerator";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/hash-generator/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const value = (name: string) => screen.getByText(name, { selector: ".wk-hash__algorithm" }).closest("li")!.querySelector(".wk-hash__value")!.textContent;
// The visible status; its live region (role="status") speaks at a slower pace (HashGenerator.a11y.test.tsx).
const status = () => document.querySelector(".wk-hash__summary")!.textContent;
const verdict = () => document.querySelector(".wk-hash__verdict")!.textContent;
const text = () => screen.getByRole("textbox", { name: "Text" });

/** A runner the test drives: it hashes on the page when told to, and reports the progress it is given. */
function fakeRunner() {
  const jobs: { job: HashJob; progress?: (share: number) => void; resolve: (results: HashResults) => void }[] = [];
  const runner: HashJobRunner = {
    run: (job, progress) => new Promise((resolve) => jobs.push({ job, progress, resolve })),
    cancel: () => {},
    dispose: () => {},
  };
  const finish = async () => {
    const { job, resolve } = jobs.at(-1)!;
    const result = await hashAll(job.blob, { algorithms: ALL_ALGORITHMS.filter((algorithm) => job.algorithms.includes(algorithm.id)), hmacKey: job.hmacKey ?? undefined });
    await act(async () => resolve(result.ok ? result.value : {}));
  };
  return { runner, jobs, finish };
}

// These tests hash for real on the page (MD5, Web Crypto and the extra entry) in jsdom; on a CI runner 2–3 times slower
// than a laptop, under a full parallel `pnpm verify`, that can take seconds, so the block gets its own timeout.
describe("HashGenerator", { timeout: 20_000 }, () => {
  it("hashes the text with the main algorithms and shows them in the chosen encoding", async () => {
    render(<HashGenerator initialSettings={{ text: "abc" }} />);
    await waitFor(() => expect(value("SHA-256")).toBe(SHA256_ABC));
    expect(value("MD5")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(status()).toBe("Hashed 3 bytes of text");
    fireEvent.click(screen.getByRole("button", { name: "Base64url" }));
    expect(value("SHA-256")).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  });

  it("opens More algorithms below the main ones, and verifies a pasted hash, offering the extra ones when their length fits", async () => {
    render(<HashGenerator initialSettings={{ text: "abc" }} />);
    await waitFor(() => expect(value("SHA-256")).toBe(SHA256_ABC));
    const verify = screen.getByRole("textbox", { name: "Verify" });
    fireEvent.change(verify, { target: { value: `sha256-${btoa(String.fromCharCode(...SHA256_ABC.match(/../g)!.map((pair) => parseInt(pair, 16))))}` } });
    expect(verdict()).toBe("Matches SHA-256");
    expect(screen.getByText("SHA-256", { selector: ".wk-hash__algorithm" }).closest("li")!.hasAttribute("data-match")).toBe(true);
    fireEvent.change(verify, { target: { value: "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532" } });
    expect(verdict()).toBe("No match yet; 4 more algorithms have this length");
    fireEvent.click(screen.getByRole("button", { name: "Check them" }));
    await waitFor(() => expect(verdict()).toBe("Matches SHA3-256"));
    expect(within(screen.getByRole("list", { name: "More hashes" })).getAllByRole("listitem")).toHaveLength(11);
    expect(screen.getByRole("button", { name: "Fewer algorithms" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("gives HMACs of the Web Crypto algorithms, says the others have none, and refuses a bad hex key", async () => {
    render(<HashGenerator initialSettings={{ text: "what do ya want for nothing?" }} />);
    fireEvent.click(screen.getByRole("switch", { name: "HMAC" }));
    fireEvent.change(screen.getByRole("textbox", { name: "HMAC key" }), { target: { value: "Jefe" } });
    // RFC 4231, test case 2.
    await waitFor(() => expect(value("HMAC-SHA-256")).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"));
    expect(value("MD5")).toBe("No HMAC for this algorithm");
    fireEvent.click(screen.getByRole("button", { name: "Hex" }));
    await waitFor(() => expect(status()).toBe('The key is not hex: "J" is not a hexadecimal digit'));
    expect(value("HMAC-SHA-256")).toBe("—");
  });

  it("hashes a dropped file in workers with progress, goes back to the text, and refuses a file over 512 MB", async () => {
    const { runner, jobs, finish } = fakeRunner();
    render(<HashGenerator initialSettings={{ text: "abc" }} createRunner={() => runner} />);
    const pane = document.querySelector(".wk-hash__pane--input")!;
    const drop = (file: File) => fireEvent.drop(pane, { dataTransfer: { types: ["Files"], files: [file] } });
    drop(new File(["abc"], "report.bin"));
    await waitFor(() => expect(jobs).toHaveLength(1));
    act(() => jobs[0]!.progress!(0.42));
    expect(status()).toBe("Hashing report.bin… 42%");
    await finish();
    expect(status()).toBe("Hashed report.bin (3 B)");
    expect(value("SHA-256")).toBe(SHA256_ABC);
    expect(screen.getByText("3 B · 3 bytes · unknown type")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to text" }));
    expect((text() as HTMLTextAreaElement).value).toBe("abc");
    const huge = new File(["x"], "disk.iso");
    Object.defineProperty(huge, "size", { value: 600 * 1024 * 1024 });
    drop(huge);
    await waitFor(() => expect(document.querySelector(".wk-ui-status")!.textContent).toContain("File is larger than 512 MB"));
  });

  it("leaves HMACs out of hashes.txt: they are not checksums a tool can check", async () => {
    render(<HashGenerator initialSettings={{ text: "abc" }} />);
    await waitFor(() => expect(value("SHA-256")).toBe(SHA256_ABC));
    expect(screen.getByRole("button", { name: "Download" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("switch", { name: "HMAC" }));
    fireEvent.change(screen.getByRole("textbox", { name: "HMAC key" }), { target: { value: "key" } });
    await waitFor(() => expect(value("HMAC-SHA-256")).toMatch(/^[0-9a-f]{64}$/));
    expect(screen.getByRole("button", { name: "Download" }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps the text and settings in the saved input, never the HMAC key or the file", async () => {
    render(<HashGenerator initialSettings={{ text: "secret text", hmac: true }} />);
    fireEvent.change(screen.getByRole("textbox", { name: "HMAC key" }), { target: { value: "k3y-that-stays-here" } });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await act(async () => fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Save input in this browser" })));
    const saved = localStorage.getItem("wk:hash-generator:input") ?? "";
    expect(saved).toContain('"text":"secret text"');
    expect([saved.includes("k3y-that-stays-here"), location.href.includes("k3y")]).toEqual([false, false]);
  });
});
