import type { DiffBlock, LinePair, TextDiff } from "../core/types";
import type { Layout } from "./useTextCompare";

/** Unchanged runs longer than this are folded. */
export const FOLD_MIN = 8;
/** Unchanged lines kept on each side of a fold. */
export const FOLD_CONTEXT = 3;
/** Rows drawn at once; "Show more" adds as many again. */
export const PAGE_ROWS = 5000;

/**
 * One line of the result. `left` and `right` are line numbers from 0, or null where that side has no line. In the
 * inline layout a changed pair takes two rows, `show: "left"` above `show: "right"`; every other row shows "both"
 * (an unchanged line, or the one side of an added or removed line).
 */
export interface LineRow {
  type: "line";
  block: number;
  kind: "equal" | "removed" | "added" | "changed";
  left: number | null;
  right: number | null;
  show: "both" | "left" | "right";
}

/** Unchanged lines that are not drawn, with a button to show them. `key` names the run for "expanded". */
export interface FoldRow {
  type: "fold";
  block: number;
  key: number;
  count: number;
}

export type Row = LineRow | FoldRow;

export interface RowModel {
  rows: Row[];
  /** Index of the first row of each change block, by block index; -1 for equal blocks. */
  firstRow: Int32Array;
  /** The block index of each change, in order. */
  changes: number[];
  /** Lines of the longer side, for the width of the line number columns. */
  lines: number;
}

/** The key that names an unchanged run across edits below it: its first left line. */
export function foldKey(block: DiffBlock): number {
  return block.left.start;
}

function equalPairs(block: DiffBlock): LinePair[] {
  if (block.pairs) return block.pairs;
  const pairs: LinePair[] = [];
  for (let k = 0; k < block.left.end - block.left.start; k++) pairs.push({ left: block.left.start + k, right: block.right.start + k });
  return pairs;
}

/**
 * The rows of the result: unchanged runs longer than FOLD_MIN lines folded to FOLD_CONTEXT lines on each side (at the
 * start or end of the text only on the side next to a change), unless their key is in `expanded` or `showAll`.
 */
export function buildRows(diff: TextDiff, layout: Layout, expanded: ReadonlySet<number>, showAll: boolean): RowModel {
  const rows: Row[] = [];
  const firstRow = new Int32Array(diff.blocks.length).fill(-1);
  const changes: number[] = [];
  let lines = 0;
  diff.blocks.forEach((block, index) => {
    lines = Math.max(lines, block.left.end, block.right.end);
    if (block.kind === "equal") {
      const pairs = equalPairs(block);
      const line = (pair: LinePair): LineRow => ({
        type: "line",
        block: index,
        kind: "equal",
        left: pair.left ?? null,
        right: pair.right ?? null,
        show: "both",
      });
      const first = index === 0;
      const last = index === diff.blocks.length - 1;
      const head = first ? 0 : FOLD_CONTEXT;
      const tail = last ? 0 : FOLD_CONTEXT;
      if (showAll || expanded.has(foldKey(block)) || pairs.length <= FOLD_MIN || pairs.length <= head + tail) {
        for (const pair of pairs) rows.push(line(pair));
        return;
      }
      for (const pair of pairs.slice(0, head)) rows.push(line(pair));
      rows.push({ type: "fold", block: index, key: foldKey(block), count: pairs.length - head - tail });
      for (const pair of pairs.slice(pairs.length - tail)) rows.push(line(pair));
      return;
    }
    changes.push(index);
    firstRow[index] = rows.length;
    const pairs = block.pairs ?? [];
    const kind = (pair: LinePair): LineRow["kind"] =>
      pair.left !== undefined && pair.right !== undefined ? "changed" : pair.left !== undefined ? "removed" : "added";
    if (layout === "split") {
      for (const pair of pairs) {
        rows.push({ type: "line", block: index, kind: kind(pair), left: pair.left ?? null, right: pair.right ?? null, show: "both" });
      }
      return;
    }
    // Inline: every old line of the block above every new one, each with its partner for the highlight.
    for (const pair of pairs) {
      if (pair.left === undefined) continue;
      const changed = pair.right !== undefined;
      rows.push({ type: "line", block: index, kind: kind(pair), left: pair.left, right: pair.right ?? null, show: changed ? "left" : "both" });
    }
    for (const pair of pairs) {
      if (pair.right === undefined) continue;
      const changed = pair.left !== undefined;
      rows.push({ type: "line", block: index, kind: kind(pair), left: pair.left ?? null, right: pair.right, show: changed ? "right" : "both" });
    }
  });
  return { rows, firstRow, changes, lines };
}
