export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** UUID v1, v3, v4, v5, v6 and v7, ULID and NanoID in bulk, and any of them taken apart. Replace this placeholder logic. */
export function uuidGenerator(input: string): Result<string> {
  if (input.trim() === "") return { ok: false, error: "Input is empty" };
  return { ok: true, value: input.trim() };
}
