import { isBlank, lineKeys, normalizeLine, splitLines, type SplitText } from "./lines";
import { defaultCost, diffKeys, indentOf } from "./myers";
import { pairBudget, pairLines } from "./pair";
import type { CompareOptions, DiffBlock, LinePair, TextDiff } from "./types";

/**
 * Compares two texts line by line. Equal lines (under `options`) form "equal" blocks, the rest "change" blocks whose
 * similar lines are paired. `maxCost` limits the search, as in git: past it the diff is still correct but may be
 * longer than needed, and `approximate` is true. Only which lines count as equal depends on `options`.
 */
export function compareTexts(left: string, right: string, options: CompareOptions = {}, maxCost?: number): TextDiff {
  const a = splitLines(left);
  const b = splitLines(right);
  const [keysA, keysB] = lineKeys(a, b, options);
  const blankA = blankMarks(a);
  const blankB = blankMarks(b);
  const cost = maxCost ?? defaultCost(keysA.length, keysB.length);
  const marks = diffKeys(keysA, keysB, cost, indents(a), indents(b));
  let blocks = toBlocks(marks.left, marks.right);
  if (options.ignoreBlankLines) blocks = withoutBlankChanges(blocks, blankA, blankB);

  const budget = pairBudget();
  const normalized = (split: SplitText, i: number): string => normalizeLine(split.lines[i]!, "", { ...options, ignoreLineEndings: true });
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const block of blocks) {
    if (block.kind === "equal") {
      if (block.left.end - block.left.start !== block.right.end - block.right.start) {
        block.pairs = alignBlank(block, blankA, blankB);
      }
      continue;
    }
    const leftLines: string[] = [];
    const rightLines: string[] = [];
    for (let i = block.left.start; i < block.left.end; i++) leftLines.push(normalized(a, i));
    for (let j = block.right.start; j < block.right.end; j++) rightLines.push(normalized(b, j));
    block.pairs = pairLines(leftLines, rightLines, block.left.start, block.right.start, budget);
    for (const pair of block.pairs) {
      if (pair.left !== undefined && pair.right !== undefined) counts.changed++;
      else if (pair.left !== undefined) counts.removed++;
      else counts.added++;
    }
  }

  return {
    blocks,
    counts,
    approximate: marks.approximate,
    lineEndings: { left: a.lineEndings, right: b.lineEndings },
    finalNewline: { left: a.finalNewline, right: b.finalNewline },
  };
}

function indents(split: SplitText): Int32Array {
  return Int32Array.from(split.lines, indentOf);
}

function blankMarks(split: SplitText): Uint8Array {
  const marks = new Uint8Array(split.lines.length);
  for (let i = 0; i < marks.length; i++) if (isBlank(split.lines[i]!)) marks[i] = 1;
  return marks;
}

/** Equal runs where both sides are unchanged, change blocks in between. */
function toBlocks(left: Uint8Array, right: Uint8Array): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    const i0 = i;
    const j0 = j;
    if (i < left.length && j < right.length && !left[i] && !right[j]) {
      while (i < left.length && j < right.length && !left[i] && !right[j]) {
        i++;
        j++;
      }
      blocks.push({ kind: "equal", left: { start: i0, end: i }, right: { start: j0, end: j } });
    } else {
      while (i < left.length && left[i]) i++;
      while (j < right.length && right[j]) j++;
      blocks.push({ kind: "change", left: { start: i0, end: i }, right: { start: j0, end: j } });
    }
  }
  return blocks;
}

/**
 * With ignoreBlankLines: blank lines at the edges of a change block move into the equal blocks around it, a block of
 * blank lines only becomes equal, and neighbouring equal blocks join. Equal blocks may then differ in length.
 */
function withoutBlankChanges(blocks: DiffBlock[], blankA: Uint8Array, blankB: Uint8Array): DiffBlock[] {
  const out: DiffBlock[] = [];
  const pushEqual = (left: { start: number; end: number }, right: { start: number; end: number }): void => {
    if (left.start === left.end && right.start === right.end) return;
    const last = out.at(-1);
    if (last?.kind === "equal") {
      last.left.end = left.end;
      last.right.end = right.end;
    } else out.push({ kind: "equal", left: { ...left }, right: { ...right } });
  };
  for (const block of blocks) {
    if (block.kind === "equal") {
      pushEqual(block.left, block.right);
      continue;
    }
    let { start: ls, end: le } = block.left;
    let { start: rs, end: re } = block.right;
    const headL = ls;
    const headR = rs;
    while (ls < le && blankA[ls]) ls++;
    while (rs < re && blankB[rs]) rs++;
    pushEqual({ start: headL, end: ls }, { start: headR, end: rs });
    const tailL = le;
    const tailR = re;
    while (le > ls && blankA[le - 1]) le--;
    while (re > rs && blankB[re - 1]) re--;
    if (ls < le || rs < re) out.push({ kind: "change", left: { start: ls, end: le }, right: { start: rs, end: re } });
    pushEqual({ start: le, end: tailL }, { start: re, end: tailR });
  }
  return out;
}

/** Pairs the lines of an equal block whose sides differ in length: equal lines together, extra blank lines alone. */
function alignBlank(block: DiffBlock, blankA: Uint8Array, blankB: Uint8Array): LinePair[] {
  const pairs: LinePair[] = [];
  let i = block.left.start;
  let j = block.right.start;
  while (i < block.left.end || j < block.right.end) {
    const leftBlank = i < block.left.end && blankA[i] === 1;
    const rightBlank = j < block.right.end && blankB[j] === 1;
    if (i < block.left.end && j < block.right.end && leftBlank === rightBlank) pairs.push({ left: i++, right: j++ });
    else if (j >= block.right.end || (leftBlank && !rightBlank)) pairs.push({ left: i++ });
    else pairs.push({ right: j++ });
  }
  return pairs;
}
