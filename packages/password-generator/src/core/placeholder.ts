export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Passwords, passphrases, PINs and pronounceable passwords from a secure random source, with their exact entropy. Replace this placeholder logic. */
export function passwordGenerator(input: string): Result<string> {
  if (input.trim() === "") return { ok: false, error: "Input is empty" };
  return { ok: true, value: input.trim() };
}
