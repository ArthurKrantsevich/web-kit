import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadText, formatLimit, readTextFile } from "./files";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("downloadText", () => {
  it("clicks a connected link with the name and type, then revokes the URL after 40 s", () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: (blob: Blob) => {
        blobs.push(blob);
        return "blob:test";
      },
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true });
    const clicks: { name: string; connected: boolean; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ name: this.download, connected: this.isConnected, href: this.href });
    });
    downloadText("a,b\r\n", "converted.csv", "text/csv");
    expect(clicks).toEqual([{ name: "converted.csv", connected: true, href: "blob:test" }]);
    expect(blobs[0]?.type).toBe("text/csv");
    expect(document.querySelector("a")).toBeNull();
    vi.advanceTimersByTime(39_999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
});

describe("readTextFile", () => {
  it("reads UTF-8 text and drops a BOM", async () => {
    const file = new File([new Uint8Array([0xef, 0xbb, 0xbf]), '{"a":"é"}'], "a.json");
    expect(await readTextFile(file, 1024)).toEqual({ ok: true, value: '{"a":"é"}' });
  });

  it("refuses files over the limit without reading them", async () => {
    const file = new File(["x"], "big.json");
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
    const text = vi.spyOn(file, "text");
    expect(await readTextFile(file, 10 * 1024 * 1024)).toEqual({
      ok: false,
      error: { message: "File is larger than 10 MB" },
    });
    expect(text).not.toHaveBeenCalled();
  });

  it("reads a file of exactly the limit", async () => {
    expect(await readTextFile(new File(["abcd"], "a.txt"), 4)).toEqual({ ok: true, value: "abcd" });
  });

  it("says when a file cannot be read", async () => {
    const file = new File(["x"], "a.json");
    vi.spyOn(file, "text").mockRejectedValue(new Error("NotReadableError"));
    expect(await readTextFile(file, 1024)).toEqual({ ok: false, error: { message: "Could not read the file" } });
  });
});

describe("formatLimit", () => {
  it("writes whole and fractional sizes", () => {
    expect([formatLimit(10 * 1024 * 1024), formatLimit(1.5 * 1024 * 1024), formatLimit(512 * 1024)]).toEqual([
      "10 MB",
      "1.5 MB",
      "512 KB",
    ]);
  });
});
