/** Which items of each sequence are not part of the common subsequence: 1 = changed. */
export interface KeyDiff {
  left: Uint8Array;
  right: Uint8Array;
  /** True when the search gave up on a minimal result somewhere; the marks are still a valid diff. */
  approximate: boolean;
}

/** The smallest search cost before giving up on a minimal diff, as in git's xdiff. */
export const MIN_COST = 256;

/** git's limit: the square root of the size, at least MIN_COST. */
export function defaultCost(n: number, m: number): number {
  return Math.max(MIN_COST, Math.ceil(Math.sqrt(n + m)));
}

/**
 * Compares two sequences of integer keys with Myers' O(ND) algorithm in linear space (split at the middle snake).
 * Common ends are cut off first, and items whose key does not occur on the other side are marked at once, as git does.
 * When a split needs more than `maxCost` steps, the furthest point reached is used instead: the result stays correct
 * but may not be minimal, and `approximate` is set. Afterwards each run of changes is slid to where git would show it
 * (see `compact`); `indentLeft`/`indentRight` (from `indentOf`) let it choose as git's indent heuristic does.
 */
export function diffKeys(
  a: Int32Array,
  b: Int32Array,
  maxCost: number = defaultCost(a.length, b.length),
  indentLeft?: Int32Array,
  indentRight?: Int32Array,
): KeyDiff {
  // One extra slot at the end: the compaction reads one past the last item.
  const left = new Uint8Array(a.length + 1);
  const right = new Uint8Array(b.length + 1);
  let start = 0;
  let endA = a.length;
  let endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  // Keys that the other side does not have can never match: mark them now and diff only the rest.
  const inB = new Set<number>();
  for (let j = start; j < endB; j++) inB.add(b[j]!);
  const inA = new Set<number>();
  for (let i = start; i < endA; i++) inA.add(a[i]!);
  const keepA: number[] = [];
  const keepB: number[] = [];
  for (let i = start; i < endA; i++) {
    if (inB.has(a[i]!)) keepA.push(i);
    else left[i] = 1;
  }
  for (let j = start; j < endB; j++) {
    if (inA.has(b[j]!)) keepB.push(j);
    else right[j] = 1;
  }
  const fa = Int32Array.from(keepA, (i) => a[i]!);
  const fb = Int32Array.from(keepB, (j) => b[j]!);
  const ca = new Uint8Array(fa.length);
  const cb = new Uint8Array(fb.length);
  const approximate = bisectAll(fa, fb, ca, cb, maxCost);
  for (let i = 0; i < fa.length; i++) if (ca[i]) left[keepA[i]!] = 1;
  for (let j = 0; j < fb.length; j++) if (cb[j]) right[keepB[j]!] = 1;

  compact(a, left, right, indentLeft);
  compact(b, right, left, indentRight);
  return { left: left.subarray(0, a.length), right: right.subarray(0, b.length), approximate };
}

/** Marks the changed items of a and b (both whole) in ca and cb. Returns true when a split was cut short. */
function bisectAll(a: Int32Array, b: Int32Array, ca: Uint8Array, cb: Uint8Array, maxCost: number): boolean {
  let approximate = false;
  // Boxes still to compare: [aStart, aEnd, bStart, bEnd].
  const stack: number[] = [0, a.length, 0, b.length];
  while (stack.length > 0) {
    let bEnd = stack.pop()!;
    let bStart = stack.pop()!;
    let aEnd = stack.pop()!;
    let aStart = stack.pop()!;
    while (aStart < aEnd && bStart < bEnd && a[aStart] === b[bStart]) {
      aStart++;
      bStart++;
    }
    while (aEnd > aStart && bEnd > bStart && a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--;
      bEnd--;
    }
    if (aStart === aEnd || bStart === bEnd) {
      for (let i = aStart; i < aEnd; i++) ca[i] = 1;
      for (let j = bStart; j < bEnd; j++) cb[j] = 1;
      continue;
    }
    const split = middle(a, aStart, aEnd, b, bStart, bEnd, maxCost);
    if (split === null) {
      // Nothing in common, or no progress within the cost: everything in the box is changed.
      for (let i = aStart; i < aEnd; i++) ca[i] = 1;
      for (let j = bStart; j < bEnd; j++) cb[j] = 1;
      continue;
    }
    if (split.approximate) approximate = true;
    stack.push(aStart, aStart + split.x, bStart, bStart + split.y);
    stack.push(aStart + split.x, aEnd, bStart + split.y, bEnd);
  }
  return approximate;
}

/**
 * A point (x, y) on a shortest edit path through the box, found by searching from both corners at once (as in
 * diff-match-patch's bisect). After `maxCost` rounds the forward point that got furthest is taken instead.
 */
function middle(
  a: Int32Array,
  aStart: number,
  aEnd: number,
  b: Int32Array,
  bStart: number,
  bEnd: number,
  maxCost: number,
): { x: number; y: number; approximate: boolean } | null {
  const n = aEnd - aStart;
  const m = bEnd - bStart;
  const maxD = Math.ceil((n + m) / 2);
  const limit = Math.min(maxD, maxCost + 1);
  const offset = limit + 1;
  const size = 2 * offset + 2;
  const v1 = new Int32Array(size).fill(-1);
  const v2 = new Int32Array(size).fill(-1);
  v1[offset + 1] = 0;
  v2[offset + 1] = 0;
  const delta = n - m;
  const front = (delta & 1) !== 0;
  let k1start = 0;
  let k1end = 0;
  let k2start = 0;
  let k2end = 0;
  for (let d = 0; d < limit; d++) {
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      const k1o = offset + k1;
      let x1 = k1 === -d || (k1 !== d && v1[k1o - 1]! < v1[k1o + 1]!) ? v1[k1o + 1]! : v1[k1o - 1]! + 1;
      let y1 = x1 - k1;
      while (x1 < n && y1 < m && a[aStart + x1] === b[bStart + y1]) {
        x1++;
        y1++;
      }
      v1[k1o] = x1;
      if (x1 > n) k1end += 2;
      else if (y1 > m) k1start += 2;
      else if (front) {
        const k2o = offset + delta - k1;
        if (k2o >= 0 && k2o < size && v2[k2o] !== -1 && x1 >= n - v2[k2o]!) return { x: x1, y: y1, approximate: false };
      }
    }
    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      const k2o = offset + k2;
      let x2 = k2 === -d || (k2 !== d && v2[k2o - 1]! < v2[k2o + 1]!) ? v2[k2o + 1]! : v2[k2o - 1]! + 1;
      let y2 = x2 - k2;
      while (x2 < n && y2 < m && a[aEnd - x2 - 1] === b[bEnd - y2 - 1]) {
        x2++;
        y2++;
      }
      v2[k2o] = x2;
      if (x2 > n) k2end += 2;
      else if (y2 > m) k2start += 2;
      else if (!front) {
        const k1o = offset + delta - k2;
        if (k1o >= 0 && k1o < size && v1[k1o] !== -1) {
          const x1 = v1[k1o]!;
          const y1 = offset + x1 - k1o;
          if (x1 >= n - x2) return { x: x1, y: y1, approximate: false };
        }
      }
    }
  }
  if (limit === maxD) return null;
  // Out of budget: split where the forward search got furthest. Any point strictly inside the box gives a valid diff.
  let best = -1;
  let bx = 0;
  let by = 0;
  for (let k = -limit + 1; k <= limit - 1; k++) {
    const x = v1[offset + k]!;
    if (x < 0) continue;
    const y = x - k;
    if (x > n || y > m || y < 0) continue;
    if (x + y > best) {
      best = x + y;
      bx = x;
      by = y;
    }
  }
  if (best <= 0 || (bx === n && by === m)) return null;
  return { x: bx, y: by, approximate: true };
}

const MAX_INDENT = 200;
const MAX_BLANKS = 20;

/** The indentation of a line as git counts it (a tab moves to the next multiple of 8), or -1 for a blank line. */
export function indentOf(line: string): number {
  let indent = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === 32) indent += 1;
    else if (c === 9) indent += 8 - (indent % 8);
    else if (c !== 10 && c !== 11 && c !== 12 && c !== 13) return indent;
    if (indent >= MAX_INDENT) return MAX_INDENT;
  }
  return -1;
}

interface Score {
  effectiveIndent: number;
  penalty: number;
}

/** git's score of cutting the text before line `split` (xdiff's measure_split and score_add_split). */
function scoreSplit(indent: Int32Array, split: number, score: Score): void {
  const n = indent.length;
  const endOfFile = split >= n;
  const own = endOfFile ? -1 : indent[split]!;
  let preBlank = 0;
  let preIndent = -1;
  for (let i = split - 1; i >= 0; i--) {
    preIndent = indent[i]!;
    if (preIndent !== -1) break;
    preBlank++;
    if (preBlank === MAX_BLANKS) {
      preIndent = 0;
      break;
    }
  }
  let postBlank = 0;
  let postIndent = -1;
  for (let i = split + 1; i < n; i++) {
    postIndent = indent[i]!;
    if (postIndent !== -1) break;
    postBlank++;
    if (postBlank === MAX_BLANKS) {
      postIndent = 0;
      break;
    }
  }
  if (preIndent === -1 && preBlank === 0) score.penalty += 1;
  if (endOfFile) score.penalty += 21;
  const blankAfter = own === -1 ? 1 + postBlank : 0;
  const totalBlank = preBlank + blankAfter;
  score.penalty += -30 * totalBlank + 6 * blankAfter;
  const value = own !== -1 ? own : postIndent;
  const anyBlanks = totalBlank !== 0;
  score.effectiveIndent += value;
  if (value === -1 || preIndent === -1 || value === preIndent) return;
  if (value > preIndent) score.penalty += anyBlanks ? 10 : -4;
  else if (postIndent !== -1 && postIndent > value) score.penalty += anyBlanks ? 17 : 24;
  else score.penalty += anyBlanks ? 17 : 23;
}

/** Negative when `a` is the better place to cut. */
function compareScores(a: Score, b: Score): number {
  return 60 * Math.sign(a.effectiveIndent - b.effectiveIndent) + (a.penalty - b.penalty);
}

/**
 * Slides each run of changed items in `marks` (with its partner run in `other`) as git's xdl_change_compact does: up
 * as far as possible, then down as far as possible, merging with neighbouring runs on the way. A run that can move is
 * left where it lines up with a run on the other side; otherwise, when `indent` is given, where git's indent heuristic
 * scores best, else at the lowest place. Both arrays have one slot past the end.
 */
function compact(keys: Int32Array, marks: Uint8Array, other: Uint8Array, indent: Int32Array | undefined): void {
  const n = keys.length;
  const no = other.length - 1;
  // A group: [start, end) of changed items in marks; its partner in other.
  let start = 0;
  let end = 0;
  while (end < n && marks[end]) end++;
  let ostart = 0;
  let oend = 0;
  while (oend < no && other[oend]) oend++;

  const slideDown = (): boolean => {
    if (end >= n || keys[start] !== keys[end]) return false;
    marks[start++] = 0;
    marks[end++] = 1;
    while (end < n && marks[end]) end++;
    return true;
  };
  const slideUp = (): boolean => {
    if (start === 0 || keys[start - 1] !== keys[end - 1]) return false;
    marks[--start] = 1;
    marks[--end] = 0;
    while (start > 0 && marks[start - 1]) start--;
    return true;
  };
  const otherNext = (): void => {
    ostart = oend + 1;
    oend = ostart;
    while (oend < no && other[oend]) oend++;
  };
  const otherPrevious = (): void => {
    oend = ostart - 1;
    ostart = oend;
    while (ostart > 0 && other[ostart - 1]) ostart--;
  };

  for (;;) {
    if (end !== start) {
      let size: number;
      let earliestEnd: number;
      let matchingOther: number;
      do {
        size = end - start;
        matchingOther = -1;
        while (slideUp()) otherPrevious();
        earliestEnd = end;
        if (oend > ostart) matchingOther = end;
        while (slideDown()) {
          otherNext();
          if (oend > ostart) matchingOther = end;
        }
      } while (size !== end - start);

      if (end !== earliestEnd) {
        if (matchingOther !== -1) {
          while (oend === ostart) {
            slideUp();
            otherPrevious();
          }
        } else if (indent) {
          let shift = Math.max(earliestEnd, end - size - 1, end - 100);
          let best = -1;
          let bestScore: Score = { effectiveIndent: 0, penalty: 0 };
          for (; shift <= end; shift++) {
            const score: Score = { effectiveIndent: 0, penalty: 0 };
            scoreSplit(indent, shift, score);
            scoreSplit(indent, shift - size, score);
            if (best === -1 || compareScores(score, bestScore) <= 0) {
              bestScore = score;
              best = shift;
            }
          }
          while (end > best) {
            slideUp();
            otherPrevious();
          }
        }
      }
    }
    if (end >= n) break;
    start = end + 1;
    end = start;
    while (end < n && marks[end]) end++;
    otherNext();
  }
}
