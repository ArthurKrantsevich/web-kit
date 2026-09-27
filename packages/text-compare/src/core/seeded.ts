// Seeded random texts for the property tests (fast-check is not a dependency). The same seed gives the same texts
// everywhere, so a failure names the seed that reproduces it.

/** mulberry32: a small, fast 32-bit generator; returns numbers in [0, 1). */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One of `items`. */
export function pick<T>(next: () => number, items: readonly T[]): T {
  return items[Math.floor(next() * items.length)]!;
}

/** Short lines from a small vocabulary, so that texts share many lines and moves, repeats and blank lines occur. */
const WORDS = ["a", "b", "c", "{", "}", "", "  ", "x = 1", "X = 1", "x  =  1", "return", "Return"] as const;
const ENDINGS = ["\n", "\n", "\n", "\r\n", "\r"] as const;

/** A text of up to `size` lines with mixed line endings and, sometimes, no line break at the end or a BOM. */
export function randomText(next: () => number, size: number): string {
  const count = Math.floor(next() * (size + 1));
  let text = next() < 0.1 ? "\uFEFF" : "";
  for (let i = 0; i < count; i++) {
    text += pick(next, WORDS);
    if (i < count - 1 || next() < 0.7) text += pick(next, ENDINGS);
  }
  return text;
}

/** A copy of `text` with a few lines deleted, inserted, changed or moved: the usual shape of an edit. */
export function editText(next: () => number, text: string): string {
  const lines = text.replace(/^\uFEFF/, "").split(/(?<=\r\n|\n|\r(?!\n))/);
  const edits = 1 + Math.floor(next() * 4);
  for (let e = 0; e < edits; e++) {
    const at = Math.floor(next() * (lines.length + 1));
    const kind = next();
    if (kind < 0.3) lines.splice(at, 1);
    else if (kind < 0.6) lines.splice(at, 0, `${pick(next, WORDS)}${pick(next, ENDINGS)}`);
    else if (kind < 0.85) lines[at] = `${pick(next, WORDS)} ${pick(next, WORDS)}\n`;
    else lines.splice(Math.floor(next() * lines.length), 0, ...lines.splice(at, 2));
  }
  return lines.join("");
}
