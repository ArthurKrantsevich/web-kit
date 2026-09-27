import { diffKeys } from "./myers";
import { MAX_PAIR_LENGTH } from "./pair";
import type { CompareOptions, Granularity, Segment } from "./types";

type Segmenter = { segment(text: string): Iterable<{ segment: string }> };
let graphemes: Segmenter | null | undefined;

/** User-perceived characters: an emoji with its modifiers stays whole. Code points where Intl.Segmenter is missing. */
export function splitGraphemes(text: string): string[] {
  if (graphemes === undefined) {
    const Segmenter = (Intl as { Segmenter?: new (locale?: string, options?: { granularity: string }) => Segmenter }).Segmenter;
    graphemes = Segmenter ? new Segmenter(undefined, { granularity: "grapheme" }) : null;
  }
  return graphemes ? Array.from(graphemes.segment(text), (part) => part.segment) : Array.from(text);
}

const WORD = /^[\p{L}\p{M}\p{N}]/u;
const SPACE = /^\s/u;

/** Words (runs of letters and digits), runs of whitespace, and every other character on its own. */
export function splitWords(text: string): string[] {
  const tokens: string[] = [];
  let run = "";
  let kind = "";
  for (const char of splitGraphemes(text)) {
    const next = WORD.test(char) ? "word" : SPACE.test(char) ? "space" : "other";
    if (next === kind && next !== "other") run += char;
    else {
      if (run !== "") tokens.push(run);
      run = char;
      kind = next;
    }
  }
  if (run !== "") tokens.push(run);
  return tokens;
}

/**
 * Which words (or characters) of two lines differ. What `options` ignores is never highlighted: with ignoreWhitespace
 * whitespace takes no part, with ignoreCase "A" matches "a". Whitespace between two changed pieces is highlighted with
 * them. Lines longer than 10,000 characters are not compared piece by piece: a differing one is changed as a whole.
 */
export function inlineDiff(
  left: string,
  right: string,
  granularity: Granularity,
  options: CompareOptions = {},
): { left: Segment[]; right: Segment[] } {
  if (left === right) return { left: whole(left, false), right: whole(right, false) };
  if (left.length > MAX_PAIR_LENGTH || right.length > MAX_PAIR_LENGTH) return { left: whole(left, true), right: whole(right, true) };
  const split = granularity === "word" ? splitWords : splitGraphemes;
  const a = split(left);
  const b = split(right);
  const ids = new Map<string, number>();
  const counted = (tokens: string[]): { keys: number[]; at: number[] } => {
    const keys: number[] = [];
    const at: number[] = [];
    tokens.forEach((token, index) => {
      if (options.ignoreWhitespace && SPACE.test(token)) return;
      const text = options.ignoreCase ? token.toLowerCase() : token;
      let id = ids.get(text);
      if (id === undefined) {
        id = ids.size;
        ids.set(text, id);
      }
      keys.push(id);
      at.push(index);
    });
    return { keys, at };
  };
  const ka = counted(a);
  const kb = counted(b);
  const marks = diffKeys(Int32Array.from(ka.keys), Int32Array.from(kb.keys));
  const changedA = new Uint8Array(a.length);
  const changedB = new Uint8Array(b.length);
  ka.at.forEach((index, k) => (changedA[index] = marks.left[k]!));
  kb.at.forEach((index, k) => (changedB[index] = marks.right[k]!));
  return { left: segments(a, changedA, options), right: segments(b, changedB, options) };
}

function whole(text: string, changed: boolean): Segment[] {
  return text === "" ? [] : [{ text, changed }];
}

function segments(tokens: string[], changed: Uint8Array, options: CompareOptions): Segment[] {
  if (!options.ignoreWhitespace) {
    for (let i = 1; i < tokens.length - 1; i++) {
      if (!changed[i] && changed[i - 1] && changed[i + 1] && SPACE.test(tokens[i]!)) changed[i] = 1;
    }
  }
  const out: Segment[] = [];
  tokens.forEach((text, i) => {
    const flag = changed[i] === 1;
    const last = out.at(-1);
    if (last && last.changed === flag) last.text += text;
    else out.push({ text, changed: flag });
  });
  return out;
}
