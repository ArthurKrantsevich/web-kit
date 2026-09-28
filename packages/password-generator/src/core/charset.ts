import type { PasswordOptions, Result } from "./types";

export const LOWER = "abcdefghijklmnopqrstuvwxyz";
export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DIGITS = "0123456789";
/** Every printable ASCII character that is not a letter, a digit or a space: the 14 common ones first, 32 in all. */
export const SYMBOLS = "!#$%&*+-=?@^_~\"'(),./:;<>[\\]`{|}";
/** Characters that are easy to mistake for one another. */
export const AMBIGUOUS = "Il1O0o";

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 128;

const SETS = [
  { key: "lower", name: "lowercase letters", chars: LOWER },
  { key: "upper", name: "uppercase letters", chars: UPPER },
  { key: "digits", name: "digits", chars: DIGITS },
  { key: "symbols", name: "symbols", chars: SYMBOLS },
] as const;

/** The chosen sets without the excluded characters, and all of them together. */
export interface CharacterPool {
  sets: string[][];
  pool: string[];
}

/** The characters a password may use, or why there are none. */
export function characterPool(options: PasswordOptions): Result<CharacterPool> {
  const { length } = options;
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    return { ok: false, error: { message: `The length must be a whole number from ${MIN_LENGTH} to ${MAX_LENGTH}` } };
  }
  const excluded = new Set([...(options.exclude ?? ""), ...(options.excludeAmbiguous ? AMBIGUOUS : "")]);
  const chosen = SETS.filter((set) => options[set.key] ?? true);
  if (chosen.length === 0) return { ok: false, error: { message: "Choose at least one set of characters" } };
  const left = chosen.map((set) => ({ name: set.name, chars: [...set.chars].filter((char) => !excluded.has(char)) }));
  const sets = left.map((set) => set.chars).filter((chars) => chars.length > 0);
  const pool = sets.flat();
  if (pool.length === 0) return { ok: false, error: { message: "The exclusions leave no characters to choose from" } };
  const emptied = left.find((set) => set.chars.length === 0);
  if (emptied && (options.requireEach ?? true)) {
    return { ok: false, error: { message: `The exclusions leave no ${emptied.name}, and Require each needs one` } };
  }
  return { ok: true, value: { sets, pool } };
}
