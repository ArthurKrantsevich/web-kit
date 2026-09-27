import type { LinePair } from "./types";

/** Lines longer than this are never compared character by character. */
export const MAX_PAIR_LENGTH = 10_000;

/** A changed line needs at least this share of matching characters (by LCS) to be paired. */
export const PAIR_THRESHOLD = 0.5;

/** Blocks with at most this many left × right lines are aligned in full; larger ones line by line. */
const FULL_ALIGNMENT = 2_500;

/** Character steps one comparison may spend on pairing; past it, lines stay unpaired (still correct, less detailed). */
const PAIR_BUDGET = 20_000_000;

/** Work left for pairing during one compareTexts call. */
export interface Budget {
  steps: number;
}

export function pairBudget(): Budget {
  return { steps: PAIR_BUDGET };
}

/**
 * The share of matching characters, 2·LCS / (|a| + |b|), when it reaches PAIR_THRESHOLD; otherwise 0. The LCS comes
 * from the number of edits (Myers), and the search stops once the share cannot reach the threshold.
 */
export function similarity(a: string, b: string, budget: Budget): number {
  if (a === b) return 1;
  const n = a.length;
  const m = b.length;
  if (n > MAX_PAIR_LENGTH || m > MAX_PAIR_LENGTH || n + m === 0) return 0;
  // 2·LCS ≤ 2·min(n, m): a much shorter line can never reach the threshold.
  if (2 * Math.min(n, m) < PAIR_THRESHOLD * (n + m)) return 0;
  budget.steps -= n + m;
  if (budget.steps < 0) return 0;
  const maxD = Math.floor((1 - PAIR_THRESHOLD) * (n + m));
  const offset = maxD + 1;
  const v = new Int32Array(2 * offset + 1);
  for (let d = 0; d <= maxD; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a.charCodeAt(x) === b.charCodeAt(y)) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return (n + m - d) / (n + m);
    }
    budget.steps -= d + 1;
    if (budget.steps < 0) return 0;
  }
  return 0;
}

/**
 * Aligns the lines of one change block: similar lines are paired, in order, the rest stay alone. Small blocks are
 * aligned for the largest total similarity; large ones pair the i-th left line with the i-th right line when similar.
 * `left` and `right` are the normalized lines of the block; the pairs use `leftStart`/`rightStart` + index.
 */
export function pairLines(left: string[], right: string[], leftStart: number, rightStart: number, budget: Budget): LinePair[] {
  const matches: [number, number][] = [];
  const L = left.length;
  const R = right.length;
  if (L > 0 && R > 0 && L * R <= FULL_ALIGNMENT) {
    // best[i][j]: the largest total similarity of the first i left and j right lines.
    const width = R + 1;
    const best = new Float64Array((L + 1) * width);
    const paired = new Uint8Array((L + 1) * width);
    for (let i = 1; i <= L; i++) {
      for (let j = 1; j <= R; j++) {
        const up = best[(i - 1) * width + j]!;
        const back = best[i * width + j - 1]!;
        let value = Math.max(up, back);
        const score = similarity(left[i - 1]!, right[j - 1]!, budget);
        if (score > 0 && best[(i - 1) * width + j - 1]! + score > value) {
          value = best[(i - 1) * width + j - 1]! + score;
          paired[i * width + j] = 1;
        }
        best[i * width + j] = value;
      }
    }
    let i = L;
    let j = R;
    while (i > 0 && j > 0) {
      if (paired[i * width + j]) {
        matches.push([i - 1, j - 1]);
        i--;
        j--;
      } else if (best[(i - 1) * width + j] === best[i * width + j]) i--;
      else j--;
    }
    matches.reverse();
  } else {
    for (let i = 0; i < Math.min(L, R); i++) if (similarity(left[i]!, right[i]!, budget) > 0) matches.push([i, i]);
  }

  const pairs: LinePair[] = [];
  let i = 0;
  let j = 0;
  for (const [li, rj] of [...matches, [L, R] as [number, number]]) {
    // Removed lines first, then added ones, as a unified diff shows them.
    for (; i < li; i++) pairs.push({ left: leftStart + i });
    for (; j < rj; j++) pairs.push({ right: rightStart + j });
    if (li < L) pairs.push({ left: leftStart + li, right: rightStart + rj });
    i = li + 1;
    j = rj + 1;
  }
  return pairs;
}
