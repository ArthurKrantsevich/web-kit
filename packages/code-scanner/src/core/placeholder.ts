export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Read QR codes from an image: file, drop or paste, decoded on your device. Replace this placeholder logic. */
export function codeScanner(input: string): Result<string> {
  if (input.trim() === "") return { ok: false, error: "Input is empty" };
  return { ok: true, value: input.trim() };
}
