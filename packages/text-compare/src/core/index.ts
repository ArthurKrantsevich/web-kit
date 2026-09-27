export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Compare two texts or files side by side, by line, word or character, and export a patch. Replace this placeholder logic. */
export function textCompare(input: string): Result<string> {
  if (input.trim() === "") return { ok: false, error: "Input is empty" };
  return { ok: true, value: input.trim() };
}

export type * from "./types";
export { splitLines, type SplitText } from "./lines";
export { compareTexts } from "./compare";
export { inlineDiff } from "./inline";
