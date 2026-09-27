import { splitLines, type SplitText } from "./lines";
import type { TextDiff, UnifiedDiffOptions } from "./types";

/** One line of the patch: " " context (from the left side, so the patch applies to the left file), "-" left, "+" right. */
interface Op {
  sign: " " | "-" | "+";
  left: number;
  right: number;
  /** Part of a change block; context lines are not. */
  change: boolean;
}

/**
 * The diff as a unified diff, as `git diff --no-index -U<context>` prints it without its `diff --git` and `index`
 * lines: `--- left`, `+++ right`, hunks `@@ -a,b +c,d @@`, and `\ No newline at end of file` after a last line
 * without a line break. Context lines come from the left text, so the patch applies to it; with ignore options on, it
 * gives the right text apart from the ignored differences. Lines keep a CRLF ending; other endings are written as LF.
 * Empty when nothing changed.
 */
export function toUnifiedDiff(left: string, right: string, diff: TextDiff, options: UnifiedDiffOptions = {}): string {
  const { context = 3, leftName = "left", rightName = "right" } = options;
  const a = splitLines(left);
  const b = splitLines(right);
  const ops: Op[] = [];
  for (const block of diff.blocks) {
    if (block.kind === "change") {
      for (let i = block.left.start; i < block.left.end; i++) ops.push({ sign: "-", left: i, right: -1, change: true });
      for (let j = block.right.start; j < block.right.end; j++) ops.push({ sign: "+", left: -1, right: j, change: true });
    } else if (block.pairs) {
      for (const pair of block.pairs) {
        if (pair.left !== undefined && pair.right !== undefined) ops.push({ sign: " ", left: pair.left, right: pair.right, change: false });
        else if (pair.left !== undefined) ops.push({ sign: "-", left: pair.left, right: -1, change: false });
        else ops.push({ sign: "+", left: -1, right: pair.right!, change: false });
      }
    } else {
      for (let k = 0; k < block.left.end - block.left.start; k++) {
        ops.push({ sign: " ", left: block.left.start + k, right: block.right.start + k, change: false });
      }
    }
  }

  const hunks: [number, number][] = [];
  for (let k = 0; k < ops.length; k++) {
    if (!ops[k]!.change) continue;
    let end = k;
    while (end + 1 < ops.length && ops[end + 1]!.change) end++;
    const from = Math.max(0, k - context);
    const to = Math.min(ops.length, end + 1 + context);
    const last = hunks.at(-1);
    if (last && from <= last[1]) last[1] = to;
    else hunks.push([from, to]);
    k = end;
  }
  if (hunks.length === 0) return "";

  let out = `--- ${leftName}\n+++ ${rightName}\n`;
  for (const [from, to] of hunks) {
    // The first line of each side in the hunk; for a side without lines in it, how many lines come before it.
    let leftBefore = -1;
    let rightBefore = -1;
    let leftCount = 0;
    let rightCount = 0;
    let body = "";
    for (let k = from; k < to; k++) {
      const op = ops[k]!;
      if (op.left >= 0) {
        if (leftBefore < 0) leftBefore = op.left;
        leftCount++;
      }
      if (op.right >= 0) {
        if (rightBefore < 0) rightBefore = op.right;
        rightCount++;
      }
      if (op.sign === " " && a.endings[op.left] === "" && k < ops.length - 1) {
        // A context line without a line break cannot have lines after it: it is replaced, as git does when the break
        // is what differs, so the lines that follow do not join it. Ignored differences can make this happen.
        body += line("-", a, op.left) + line("+", b, op.right);
      } else body += op.sign === "+" ? line("+", b, op.right) : line(op.sign, a, op.left);
    }
    if (leftBefore < 0) leftBefore = linesBefore(ops, from, "left");
    if (rightBefore < 0) rightBefore = linesBefore(ops, from, "right");
    out += `@@ -${range(leftBefore, leftCount)} +${range(rightBefore, rightCount)} @@\n${body}`;
  }
  return out;
}

function line(sign: string, split: SplitText, index: number): string {
  const ending = split.endings[index]!;
  const text = `${sign}${split.lines[index]!}${ending === "\r\n" ? "\r\n" : "\n"}`;
  return ending === "" ? `${text}\\ No newline at end of file\n` : text;
}

/** The number of lines of one side before op `at`, for a hunk that has none of that side's lines. */
function linesBefore(ops: Op[], at: number, side: "left" | "right"): number {
  for (let k = at - 1; k >= 0; k--) {
    const index = ops[k]![side];
    if (index >= 0) return index + 1;
  }
  return 0;
}

/** "5,3", "5" for one line, "4,0" for none (the line before it). */
function range(before: number, count: number): string {
  if (count === 0) return `${before},0`;
  return count === 1 ? `${before + 1}` : `${before + 1},${count}`;
}
