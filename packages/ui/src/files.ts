/** The outcome of reading a file: its text, or a message to show. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: { message: string } };

/**
 * Saves `text` as a file. The link is attached to the document while it is clicked (some Firefox and Safari
 * versions ignore detached links), and the URL is released after 40 s (released earlier, a slow download fails).
 */
export function downloadText(text: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

/** "10 MB", "1.5 MB", "512 KB", "100 B". */
export function formatLimit(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${Number.isInteger(kb) ? kb : kb.toFixed(1)} KB`;
}

/** Reads a file as UTF-8 text without a leading BOM. Files larger than `maxBytes` are not read. */
export async function readTextFile(file: File, maxBytes: number): Promise<Result<string>> {
  if (file.size > maxBytes) return { ok: false, error: { message: `File is larger than ${formatLimit(maxBytes)}` } };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: { message: "Could not read the file" } };
  }
  return { ok: true, value: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text };
}
