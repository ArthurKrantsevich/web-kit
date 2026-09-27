import { formatLimit, type Result } from "./files";

export interface LoadFromUrlOptions {
  /** Default 10 MB. A larger response is not read to the end. */
  maxBytes?: number;
  signal?: AbortSignal;
  /** Called with the number of bytes read so far. */
  onProgress?: (bytes: number) => void;
  /** Default: the browser's fetch. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

/** Said when the browser only reports a failed request: blocked by CORS, or the server cannot be reached. */
export const UNREACHABLE =
  "Could not load: the server does not allow reading from the browser, or it cannot be reached";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

const fail = (message: string): Result<string> => ({ ok: false, error: { message } });

/**
 * Loads text from an http: or https: address, straight from the browser (no proxy): no cookies or other credentials,
 * no referrer. The size limit is checked against Content-Length and again while the body streams in, so a larger
 * response is never read to the end. The text is decoded as UTF-8 without a BOM.
 */
export async function loadFromUrl(url: string, options: LoadFromUrlOptions = {}): Promise<Result<string>> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let address: URL;
  try {
    address = new URL(url.trim());
  } catch {
    return fail("Enter a full address that starts with https:// or http://");
  }
  if (address.protocol !== "https:" && address.protocol !== "http:") {
    return fail("Only http: and https: addresses can be loaded");
  }
  if (address.username !== "" || address.password !== "") {
    return fail("Remove the user name and password from the address: they are never sent");
  }
  if (address.protocol === "http:" && typeof location !== "undefined" && location.protocol === "https:") {
    return fail("This page is served over https:, so the browser blocks http: addresses; use https:");
  }

  const request = options.fetch ?? ((input: string, init: RequestInit) => fetch(input, init));
  let response: Response;
  try {
    response = await request(address.href, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "follow",
      signal: options.signal,
    });
  } catch (error) {
    return fail(isAbort(error) ? "Loading was cancelled" : UNREACHABLE);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return fail(`The server answered ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
  }
  const tooLarge = `File is larger than ${formatLimit(maxBytes)}`;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    return fail(tooLarge);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          return fail(tooLarge);
        }
        chunks.push(value);
        options.onProgress?.(total);
      }
    } else {
      const whole = new Uint8Array(await response.arrayBuffer());
      if (whole.byteLength > maxBytes) return fail(tooLarge);
      chunks.push(whole);
      total = whole.byteLength;
    }
  } catch (error) {
    return fail(isAbort(error) ? "Loading was cancelled" : UNREACHABLE);
  }

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  try {
    // fatal: bytes that are not UTF-8 are an error, not replacement characters; the BOM is dropped.
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return fail("The response is not UTF-8 text");
  }
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}
