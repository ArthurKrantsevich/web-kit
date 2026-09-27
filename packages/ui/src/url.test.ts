import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFromUrl, UNREACHABLE } from "./url";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A response whose body arrives in the given chunks; `pulled` counts the chunks the reader asked for. */
function streamed(chunks: (string | Uint8Array)[], init: ResponseInit & { headers?: Record<string, string> } = {}) {
  const state = { pulled: 0, cancelled: false };
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[state.pulled++];
      if (chunk === undefined) controller.close();
      else controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { response: new Response(body, init), state };
}

describe("loadFromUrl", () => {
  it("fetches without credentials or referrer and returns the text without a BOM", async () => {
    const calls: [string, RequestInit][] = [];
    const { response } = streamed(["﻿{\"a\":", "1}"]);
    const result = await loadFromUrl(" https://example.com/data.json ", {
      fetch: async (url, init) => {
        calls.push([url, init]);
        return response;
      },
    });
    expect(result).toEqual({ ok: true, value: '{"a":1}' });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("https://example.com/data.json");
    expect(calls[0]![1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("refuses anything but http: and https:, without a request", async () => {
    const fetch = vi.fn();
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:application/json,[1]", "ftp://example.com/a"]) {
      expect(await loadFromUrl(url, { fetch })).toEqual({
        ok: false,
        error: { message: "Only http: and https: addresses can be loaded" },
      });
    }
    expect(await loadFromUrl("example.com/data.json", { fetch })).toEqual({
      ok: false,
      error: { message: "Enter a full address that starts with https:// or http://" },
    });
    expect(await loadFromUrl("https://user:secret@example.com/a.json", { fetch })).toEqual({
      ok: false,
      error: { message: "Remove the user name and password from the address: they are never sent" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says when an https: page asks for an http: address, which the browser would block", async () => {
    vi.stubGlobal("location", { protocol: "https:" });
    const fetch = vi.fn();
    expect(await loadFromUrl("http://example.com/a.json", { fetch })).toEqual({
      ok: false,
      error: { message: "This page is served over https:, so the browser blocks http: addresses; use https:" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("explains a failed request with the CORS message", async () => {
    const result = await loadFromUrl("https://example.com/a.json", {
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    expect(result).toEqual({ ok: false, error: { message: UNREACHABLE } });
    expect(UNREACHABLE).toContain("the server does not allow reading from the browser");
  });

  it("reports the status of an unsuccessful answer", async () => {
    const result = await loadFromUrl("https://example.com/a.json", {
      fetch: async () => new Response("gone", { status: 404, statusText: "Not Found" }),
    });
    expect(result).toEqual({ ok: false, error: { message: "The server answered 404 Not Found" } });
  });

  it("refuses a declared Content-Length over the limit before reading the body", async () => {
    const { response, state } = streamed(["x".repeat(20)], { headers: { "content-length": "20" } });
    const result = await loadFromUrl("https://example.com/a.json", { maxBytes: 16, fetch: async () => response });
    expect(result).toEqual({ ok: false, error: { message: "File is larger than 16 B" } });
    expect(state.pulled).toBeLessThanOrEqual(1);
    expect(state.cancelled).toBe(true);
  });

  it("stops reading once the streamed body passes the limit, whatever the headers say", async () => {
    const { response, state } = streamed(["12345678", "12345678", "1", "never read"]);
    const progress: number[] = [];
    const result = await loadFromUrl("https://example.com/a.json", {
      maxBytes: 16,
      onProgress: (bytes) => progress.push(bytes),
      fetch: async () => response,
    });
    expect(result).toEqual({ ok: false, error: { message: "File is larger than 16 B" } });
    expect(progress).toEqual([8, 16]);
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThan(5);
  });

  it("refuses bytes that are not UTF-8", async () => {
    const { response } = streamed([new Uint8Array([0x7b, 0xff, 0x7d])]);
    expect(await loadFromUrl("https://example.com/a.json", { fetch: async () => response })).toEqual({
      ok: false,
      error: { message: "The response is not UTF-8 text" },
    });
  });

  it("says it was cancelled when the signal aborts", async () => {
    const controller = new AbortController();
    const pending = loadFromUrl("https://example.com/a.json", {
      signal: controller.signal,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    });
    controller.abort();
    expect(await pending).toEqual({ ok: false, error: { message: "Loading was cancelled" } });
  });
});
