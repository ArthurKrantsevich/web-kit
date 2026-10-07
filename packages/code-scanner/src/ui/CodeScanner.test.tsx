import { compressText } from "@web-kit/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asImage, rasterize } from "../../bench/distort";
import { encodeSymbol, segmentsFor } from "../../test/encoders/qr";
import type { ScanImage } from "../core/types";
import { answerScanJob, type ScanJob } from "../job";
import type { ScanJobRunner, ScanOutcome } from "../worker-client";
import { CodeScanner } from "./CodeScanner";
import { ImageReadError, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, readImageFile } from "./image";
import { SAMPLE_QR } from "./samples";

/** jsdom has no object URLs: the test gives URL the two functions and takes them back. */
function objectUrls(create: (blob: Blob) => string): void {
  Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, configurable: true, writable: true });
}
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/code-scanner/");
  objectUrls(() => "blob:preview");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

const qrImage = (text: string): ScanImage => asImage(rasterize(encodeSymbol("qr", 2, "M", segmentsFor(text))!.matrix, { module: 5 }));
/** A runner that scans on the page through the real answerScanJob when told to. */
function fakeRunner() {
  const jobs: { job: ScanJob; resolve: (o: ScanOutcome) => void; reject: (e: Error) => void }[] = [];
  const runner: ScanJobRunner = { run: (job) => new Promise((resolve, reject) => jobs.push({ job, resolve, reject })), cancel: () => {}, dispose: () => {} };
  /** Answers a job (the newest by default) with a real scan; the page's 500 ms deadline is lifted, since a loaded test machine may be slower. */
  const finish = async (index = jobs.length - 1) => {
    const { job, resolve } = jobs[index]!;
    await act(async () => answerScanJob({ id: 1, job: { ...job, deadlineMs: 5000 } }, (r) => { if ("results" in r) resolve({ results: r.results, ms: r.ms }); }));
  };
  return { runner, jobs, finish };
}
/** Files map to images by their name; a name the map lacks is refused as not an image. */
const reader = (images: Record<string, ScanImage>) => async (file: File): Promise<ScanImage> => {
  const image = images[file.name];
  if (!image) throw new ImageReadError("type", `${file.name} is not an image`);
  return image;
};
const file = (name: string, bytes = 100, type = "image/png") => new File([new Uint8Array(bytes)], name, { type });
const drop = (f: File) => fireEvent.drop(document.querySelector(".wk-scanner__pane--image")!, { dataTransfer: { types: ["Files"], files: [f] } });
const status = () => document.querySelector(".wk-scanner__summary")!.textContent;
const entries = () => screen.queryAllByRole("listitem").filter((li) => li.classList.contains("wk-scanner__entry"));

describe("CodeScanner", () => {
  it("scans an opened image in the worker, lists the result with its symbology and text, and says what was read", async () => {
    const { runner, jobs, finish } = fakeRunner();
    render(<CodeScanner createRunner={() => runner} readImage={reader({ "a.png": qrImage("hello") })} />);
    expect(screen.getByText("Open an image with a code")).toBeTruthy();
    drop(file("a.png"));
    await waitFor(() => expect(jobs).toHaveLength(1));
    expect([jobs[0]!.job.symbologies, jobs[0]!.job.deadlineMs]).toEqual([["qr", "micro-qr", "rmqr"], 500]);
    expect(status()).toBe("Scanning…");
    await finish();
    expect(entries()).toHaveLength(1);
    expect(within(entries()[0]!).getByText("QR Code")).toBeTruthy();
    expect(within(entries()[0]!).getByText("hello")).toBeTruthy();
    expect(status()).toMatch(/^QR Code · 25×25 · corrected 0 of \d+ · \d+ ms$/);
    expect((screen.getByAltText("a.png") as HTMLImageElement).src).toContain("blob:preview");
  });

  it("scans the sample, rescans with Ctrl+Enter and Try harder, and deduplicates a repeated code with a counter", async () => {
    const { runner, jobs, finish } = fakeRunner();
    render(<CodeScanner createRunner={() => runner} readImage={reader({})} />);
    fireEvent.click(screen.getByRole("button", { name: "Sample" }));
    await waitFor(() => expect(jobs).toHaveLength(1));
    await finish();
    expect(within(entries()[0]!).getByText(SAMPLE_QR.text)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Try harder" }));
    await waitFor(() => expect(jobs).toHaveLength(2));
    expect(jobs[1]!.job.tryHarder).toBe(true);
    await finish();
    expect(entries()).toHaveLength(1);
    expect(within(entries()[0]!).getByText("×2")).toBeTruthy();
    expect(status()).toMatch(/Try harder on · \d+ ms$/);
    // the shortcut is scoped to the editor by ToolMenu
    fireEvent.keyDown(document.querySelector(".wk-ui-editor")!, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(jobs).toHaveLength(3));
  });

  it("says when nothing is found, keeps the earlier results, and Clear empties the list and the image", async () => {
    const { runner, jobs, finish } = fakeRunner();
    const blank: ScanImage = { width: 40, height: 40, data: new Uint8Array(1600).fill(255), format: "gray" };
    render(<CodeScanner createRunner={() => runner} readImage={reader({ "a.png": qrImage("first"), "blank.png": blank })} />);
    drop(file("a.png"));
    await waitFor(() => expect(jobs).toHaveLength(1));
    await finish();
    drop(file("blank.png"));
    await waitFor(() => expect(jobs).toHaveLength(2));
    await finish();
    expect(screen.getByText("No code found. Try “Try harder” or a sharper image.")).toBeTruthy();
    expect(entries()).toHaveLength(1);
    expect(status()).toMatch(/^No code found · \d+ ms$/);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(entries()).toHaveLength(0);
    expect(screen.getByText("Open an image with a code")).toBeTruthy();
    expect(screen.queryByAltText("blank.png")).toBeNull();
  });

  it("lets the newest image win: an older scan's answer adds nothing, and nothing arrives after Clear", async () => {
    const { runner, jobs, finish } = fakeRunner();
    render(<CodeScanner createRunner={() => runner} readImage={reader({ "a.png": qrImage("A"), "b.png": qrImage("B") })} />);
    drop(file("a.png"));
    await waitFor(() => expect(jobs).toHaveLength(1));
    drop(file("b.png"));
    await waitFor(() => expect(jobs).toHaveLength(2));
    await finish(0);
    expect(entries()).toHaveLength(0);
    expect(status()).toBe("Scanning…");
    await finish(1);
    expect(entries()).toHaveLength(1);
    expect(within(entries()[0]!).getByText("B")).toBeTruthy();
    drop(file("a.png"));
    await waitFor(() => expect(jobs).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await finish(2);
    expect(entries()).toHaveLength(0);
    expect(status()).toBe("Open an image, paste one or try the sample");
    expect(document.querySelector(".wk-scanner__stage")!.getAttribute("aria-busy")).toBe("false");
  });

  it("keeps scanning the image already read when a later file is refused, and lists its result", async () => {
    const { runner, jobs, finish } = fakeRunner();
    render(<CodeScanner createRunner={() => runner} readImage={reader({ "a.png": qrImage("A") })} />);
    drop(file("a.png"));
    await waitFor(() => expect(jobs).toHaveLength(1));
    drop(file("notes.png"));
    await waitFor(() => expect(status()).toBe("notes.png is not an image"));
    expect(document.querySelector(".wk-scanner__stage")!.getAttribute("aria-busy")).toBe("true");
    await finish();
    expect(entries()).toHaveLength(1);
    expect(within(entries()[0]!).getByText("A")).toBeTruthy();
    expect(document.querySelector(".wk-scanner__stage")!.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByAltText("a.png")).toBeTruthy();
  });

  it("refuses a file that is not an image, one over 25 MB and one over 50 Mpx, and says when the clipboard holds no image", async () => {
    // readImageFile refuses the type and the size before it needs a canvas
    await expect(readImageFile(file("notes.txt", 10, "text/plain"))).rejects.toThrow("notes.txt is not an image: open a PNG, JPEG, WebP, GIF, BMP or SVG");
    await expect(readImageFile(file("large.png", MAX_IMAGE_BYTES + 1))).rejects.toThrow("File is larger than 25 MB");
    const { runner, jobs } = fakeRunner();
    render(<CodeScanner createRunner={() => runner} readImage={async (f) => { throw new ImageReadError("pixels", `${f.name} has 56.0 Mpx; images up to ${MAX_IMAGE_PIXELS / 1e6} Mpx can be scanned`); }} />);
    // the drop target itself refuses a type outside its accept list, with a message and no scan
    drop(file("notes.txt", 10, "text/plain"));
    await waitFor(() => expect(status()).not.toBe("Open an image, paste one or try the sample"));
    drop(file("large.png", MAX_IMAGE_BYTES + 1));
    await waitFor(() => expect(status()).toBe("File is larger than 25 MB"));
    drop(file("huge.png"));
    await waitFor(() => expect(status()).toBe("huge.png has 56.0 Mpx; images up to 50 Mpx can be scanned"));
    expect(jobs).toHaveLength(0);
    expect(screen.queryByAltText("huge.png")).toBeNull();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { read: async () => [{ types: ["text/plain"], getType: async () => new Blob(["x"]) }], readText: async () => "x" } });
    cleanup();
    render(<CodeScanner createRunner={() => runner} readImage={reader({})} />);
    await waitFor(() => expect((screen.getByRole("button", { name: "Paste" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Paste" }));
    await waitFor(() => expect(status()).toBe("The clipboard holds no image"));
  });

  it("downloads scan-results.json and copies the texts; Download as CSV sits in More actions", async () => {
    const { runner, jobs, finish } = fakeRunner();
    render(<CodeScanner createRunner={() => runner} readImage={reader({ "a.png": qrImage("one") })} />);
    const download = screen.getByRole("button", { name: "Download" });
    expect((download as HTMLButtonElement).disabled).toBe(true);
    drop(file("a.png"));
    await waitFor(() => expect(jobs).toHaveLength(1));
    await finish();
    const saved: string[] = [];
    let downloaded = "";
    objectUrls((blob) => { void blob.text().then((text) => saved.push(text)); return "blob:x"; });
    // jsdom cannot follow the download link; the click records the file's name instead
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloaded = this.download; });
    fireEvent.click(download);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(downloaded).toBe("scan-results.json");
    const json = JSON.parse(saved[0]!) as { symbology: string; text: string; bytes: string; confidence: number }[];
    expect([json.length, json[0]!.symbology, json[0]!.text, json[0]!.bytes]).toEqual([1, "qr", "one", "6f6e65"]);
    expect((screen.getByRole("button", { name: "Copy" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Download as CSV" })).toBeTruthy();
  });

  it("restores Try harder and Multiple codes from a link, ignores other fields, and never puts results or images into the link, storage or the console", async () => {
    history.replaceState(null, "", `/tools/code-scanner/#code-scanner=${await compressText(JSON.stringify({ v: 1, state: { tryHarder: true, multiple: "yes", results: [{ text: "smuggled" }], image: "data:x" } }))}`);
    const { runner, jobs, finish } = fakeRunner();
    const methods = ["log", "info", "warn", "error", "debug", "trace", "dir", "table"] as const;
    const spies = methods.map((method) => vi.spyOn(console, method));
    render(<CodeScanner createRunner={() => runner} readImage={reader({ "a.png": qrImage("secret") })} />);
    await waitFor(() => expect((screen.getByRole("switch", { name: "Try harder" }) as HTMLInputElement).checked).toBe(true));
    expect((screen.getByRole("switch", { name: "Multiple codes" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText("smuggled")).toBeNull();
    drop(file("a.png"));
    await waitFor(() => expect(jobs).toHaveLength(1));
    await finish();
    expect(within(entries()[0]!).getByText("secret")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Save input in this browser" }));
    await waitFor(() => expect(Object.keys(localStorage).some((k) => k.startsWith("wk:code-scanner"))).toBe(true));
    const stored = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? "").join("\n");
    expect([stored.includes("secret"), stored.includes("blob:"), location.hash.includes("secret")]).toEqual([false, false, false]);
    expect(spies.map((spy) => spy.mock.calls)).toEqual(methods.map(() => []));
  });
});
