import { useCallback, useEffect, useState } from "react";
import { formatLimit, type Result } from "./files";

/** Longer links may be cut by messengers and email. */
export const SHARE_WARNING_LENGTH = 8000;
/** Chromium opens URLs up to 2 MB; a longer link would not open at all. */
export const SHARE_MAX_LENGTH = 2_000_000;
/** A link never expands to more than this, however it was made (a "zip bomb" link cannot fill the memory). */
export const SHARE_MAX_BYTES: number = 32 * 1024 * 1024;

/** True where the browser can compress and decompress text (CompressionStream with "deflate-raw"). */
export function canShare(): boolean {
  if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") return false;
  try {
    new CompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
}

async function collect(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

function streamOf(bytes: Uint8Array<ArrayBuffer>): ReadableStream<BufferSource> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  let binary: string;
  try {
    binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Text → deflate-raw → base64url, for the part of a link after `#key=`. */
export async function compressText(text: string): Promise<string> {
  const compressed = await collect(
    streamOf(new TextEncoder().encode(text)).pipeThrough(new CompressionStream("deflate-raw")),
    Number.POSITIVE_INFINITY,
  );
  return toBase64Url(compressed!);
}

const DAMAGED = "The shared link is damaged; nothing was loaded from it";

/** The reverse of compressText. Refuses damaged data and data that would expand past `maxBytes`. */
export async function decompressText(payload: string, maxBytes: number = SHARE_MAX_BYTES): Promise<Result<string>> {
  const bytes = fromBase64Url(payload);
  if (bytes === null || bytes.length === 0) return { ok: false, error: { message: DAMAGED } };
  try {
    const expanded = await collect(streamOf(bytes).pipeThrough(new DecompressionStream("deflate-raw")), maxBytes);
    if (expanded === null) {
      return { ok: false, error: { message: `The shared data is larger than ${formatLimit(maxBytes)}; nothing was loaded` } };
    }
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(expanded) };
  } catch {
    return { ok: false, error: { message: DAMAGED } };
  }
}

export interface ShareHash {
  /**
   * A link to this page with `text` compressed into its hash (`#key=…`). The hash never reaches a server, and the
   * page's own address is not changed.
   */
  share: (text: string) => Promise<string>;
  /** The text of the link the page was opened with, or null. Known after hydration, once `ready` is true. */
  initial: string | null;
  /** True once the hash has been read (or there was none). */
  ready: boolean;
  /** Why the link could not be read, or null. */
  error: string | null;
  /** False where the browser cannot compress text; `share` then rejects. */
  available: boolean;
}

/**
 * Sharing by link. On the first render in the browser it reads `#key=…` from the address, decompresses it into
 * `initial`, and removes the hash from the address bar (so a reload does not bring the shared data back over later
 * edits). `share(text)` builds a new link and leaves the address bar alone.
 */
export function useShareHash(key: string): ShareHash {
  const [state, setState] = useState<{ initial: string | null; ready: boolean; error: string | null; available: boolean }>({
    initial: null,
    ready: false,
    error: null,
    available: false,
  });

  useEffect(() => {
    let live = true;
    const available = canShare();
    const payload = new URLSearchParams(location.hash.slice(1)).get(key);
    if (payload === null) {
      setState({ initial: null, ready: true, error: null, available });
      return;
    }
    // The hash stays until a live run has read it: under StrictMode the first run is cancelled before its
    // decompression ends, and removing the hash there would leave nothing for the second run.
    if (!available) {
      setState({ initial: null, ready: true, error: "This browser cannot open shared links", available });
      return;
    }
    void decompressText(payload).then((result) => {
      if (!live) return;
      history.replaceState(history.state, "", location.pathname + location.search);
      setState(
        result.ok
          ? { initial: result.value, ready: true, error: null, available }
          : { initial: null, ready: true, error: result.error.message, available },
      );
    });
    return () => {
      live = false;
    };
  }, [key]);

  const share = useCallback(
    async (text: string): Promise<string> => `${location.origin}${location.pathname}${location.search}#${key}=${await compressText(text)}`,
    [key],
  );

  return { share, ...state };
}
