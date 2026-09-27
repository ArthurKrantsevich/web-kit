import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canShare, compressText, decompressText, useShareHash, type ShareHash } from "./share";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("compressText and decompressText", () => {
  it("round-trips any text, emoji and lone surrogates' neighbours included, as base64url", async () => {
    for (const text of ['{"a":1}', "", "é ✓ 😀  ", "x".repeat(100_000)]) {
      const payload = await compressText(text);
      expect(payload).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(await decompressText(payload)).toEqual({ ok: true, value: text });
    }
  });

  it("compresses repetitive JSON well", async () => {
    const text = JSON.stringify(Array.from({ length: 200 }, (_, id) => ({ id, name: "user", active: true })));
    expect((await compressText(text)).length).toBeLessThan(text.length / 5);
  });

  it("refuses damaged data", async () => {
    const damaged = { ok: false, error: { message: "The shared link is damaged; nothing was loaded from it" } };
    expect(await decompressText("not base64!")).toEqual(damaged);
    expect(await decompressText("")).toEqual(damaged);
    expect(await decompressText("AAAA")).toEqual(damaged);
    const payload = await compressText('{"a":1}');
    expect(await decompressText(payload.slice(0, -3))).toEqual(damaged);
  });

  it("stops expanding past the limit, so a small link cannot fill the memory", async () => {
    const payload = await compressText("0".repeat(1024 * 1024));
    expect(payload.length).toBeLessThan(2000);
    expect(await decompressText(payload, 64 * 1024)).toEqual({
      ok: false,
      error: { message: "The shared data is larger than 64 KB; nothing was loaded" },
    });
  });

  it("knows whether the browser can compress", () => {
    expect(canShare()).toBe(true);
    vi.stubGlobal("CompressionStream", undefined);
    expect(canShare()).toBe(false);
  });
});

function Probe({ onState }: { onState: (state: ShareHash) => void }) {
  onState(useShareHash("json-formatter"));
  return null;
}

function renderProbe() {
  const states: ShareHash[] = [];
  render(<Probe onState={(state) => states.push(state)} />);
  return () => states.at(-1)!;
}

describe("useShareHash", () => {
  it("reads the text from #key=…, then removes the hash from the address", async () => {
    history.replaceState(null, "", `/tools/json-formatter/?x=1#json-formatter=${await compressText('{"shared":true}')}`);
    const latest = renderProbe();
    await waitFor(() => expect(latest().ready).toBe(true));
    expect(latest().initial).toBe('{"shared":true}');
    expect(latest().error).toBeNull();
    expect(location.hash).toBe("");
    expect(location.search).toBe("?x=1");
  });

  it("keeps the shared text under StrictMode, whose effects run twice", async () => {
    history.replaceState(null, "", `/tools/json-formatter/#json-formatter=${await compressText('{"strict":true}')}`);
    const states: ShareHash[] = [];
    render(
      <StrictMode>
        <Probe onState={(state) => states.push(state)} />
      </StrictMode>,
    );
    await waitFor(() => expect(states.at(-1)!.initial).toBe('{"strict":true}'));
    expect(states.at(-1)!.ready).toBe(true);
    expect(location.hash).toBe("");
  });

  it("keeps the damaged-link message under StrictMode", async () => {
    history.replaceState(null, "", "/#json-formatter=%%%");
    const states: ShareHash[] = [];
    render(
      <StrictMode>
        <Probe onState={(state) => states.push(state)} />
      </StrictMode>,
    );
    await waitFor(() => expect(states.at(-1)!.error).toBe("The shared link is damaged; nothing was loaded from it"));
  });

  it("ignores another tool's key and plain anchors", async () => {
    history.replaceState(null, "", `/#json-diff=${await compressText("[1]")}`);
    const latest = renderProbe();
    await waitFor(() => expect(latest().ready).toBe(true));
    expect(latest().initial).toBeNull();
    expect(location.hash).not.toBe("");
  });

  it("says when the link is damaged", async () => {
    history.replaceState(null, "", "/#json-formatter=%%%");
    const latest = renderProbe();
    await waitFor(() => expect(latest().ready).toBe(true));
    expect(latest().error).toBe("The shared link is damaged; nothing was loaded from it");
    expect(latest().initial).toBeNull();
  });

  it("builds a link to this page that opens the same text, without changing the address", async () => {
    history.replaceState(null, "", "/tools/json-formatter/");
    const latest = renderProbe();
    await waitFor(() => expect(latest().ready).toBe(true));
    let link = "";
    await act(async () => {
      link = await latest().share('{"a":[1,2]}');
    });
    expect(link.startsWith(`${location.origin}/tools/json-formatter/#json-formatter=`)).toBe(true);
    expect(location.hash).toBe("");
    const payload = new URLSearchParams(new URL(link).hash.slice(1)).get("json-formatter")!;
    expect(await decompressText(payload)).toEqual({ ok: true, value: '{"a":[1,2]}' });
  });

  it("is not available where the browser cannot compress", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const latest = renderProbe();
    await waitFor(() => expect(latest().ready).toBe(true));
    expect(latest().available).toBe(false);
  });
});
