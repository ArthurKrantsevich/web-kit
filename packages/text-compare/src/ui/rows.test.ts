import { describe, expect, it } from "vitest";
import { compareTexts } from "../core/compare";
import { buildRows, FOLD_CONTEXT, type Row } from "./rows";

const numbered = (count: number, change: Record<number, string> = {}) =>
  Array.from({ length: count }, (_, i) => change[i + 1] ?? `line ${i + 1}`).join("\n") + "\n";

/** "=3/3" for an unchanged row (1-based numbers), "~2/2", "-4/", "+/5", "…12" for a fold of 12 lines. */
const shape = (rows: Row[]) =>
  rows.map((row) =>
    row.type === "fold"
      ? `…${row.count}`
      : `${{ equal: "=", removed: "-", added: "+", changed: "~" }[row.kind]}${row.left === null ? "" : row.left + 1}/${row.right === null ? "" : row.right + 1}${row.show === "both" ? "" : `(${row.show})`}`,
  );

describe("buildRows", () => {
  it("draws short texts whole, side by side", () => {
    const diff = compareTexts("a\nb\nc\n", "a\nb!\nc\nd\n");
    expect(shape(buildRows(diff, "split", new Set(), false).rows)).toEqual(["=1/1", "~2/2", "=3/3", "+/4"]);
  });

  it("puts every removed line of a change above the added ones in the inline layout, pairs included", () => {
    const diff = compareTexts("keep\nold one\ngone\n", "keep\nnew one\nextra\n");
    expect(shape(buildRows(diff, "inline", new Set(), false).rows)).toEqual([
      "=1/1",
      "~2/2(left)",
      "-3/",
      "~2/2(right)",
      "+/3",
    ]);
  });

  it("folds unchanged runs longer than eight lines to three lines of context on each side", () => {
    const diff = compareTexts(numbered(30), numbered(30, { 15: "line 15 changed" }));
    const model = buildRows(diff, "split", new Set(), false);
    expect(shape(model.rows)).toEqual(["…11", "=12/12", "=13/13", "=14/14", "~15/15", "=16/16", "=17/17", "=18/18", "…12"]);
    expect(FOLD_CONTEXT).toBe(3);
  });

  it("folds between two changes and keeps runs of up to eight lines whole", () => {
    const folded = buildRows(compareTexts(numbered(20), numbered(20, { 1: "line 1 x", 11: "line 11 y" })), "split", new Set(), false);
    expect(shape(folded.rows)).toEqual(["~1/1", "=2/2", "=3/3", "=4/4", "…3", "=8/8", "=9/9", "=10/10", "~11/11", "=12/12", "=13/13", "=14/14", "…6"]);
    const whole = buildRows(compareTexts(numbered(10), numbered(10, { 1: "line 1 x", 10: "line 10 y" })), "split", new Set(), false);
    expect(whole.rows.filter((row) => row.type === "fold")).toEqual([]);
  });

  it("shows a folded run that was expanded, or every run with showAll", () => {
    const diff = compareTexts(numbered(30), numbered(30, { 15: "line 15 changed" }));
    const first = buildRows(diff, "split", new Set(), false).rows[0]!;
    expect(first.type).toBe("fold");
    const key = first.type === "fold" ? first.key : -1;
    const expanded = buildRows(diff, "split", new Set([key]), false);
    expect(expanded.rows.filter((row) => row.type === "fold")).toHaveLength(1);
    expect(expanded.rows[0]).toMatchObject({ type: "line", left: 0 });
    expect(buildRows(diff, "split", new Set(), true).rows.filter((row) => row.type === "fold")).toEqual([]);
  });

  it("names a run by its first left line, so an edit below it keeps it expanded", () => {
    const before = buildRows(compareTexts(numbered(30), numbered(30, { 15: "a" })), "split", new Set(), false).rows[0]!;
    const after = buildRows(compareTexts(numbered(30), numbered(30, { 15: "a", 16: "b" })), "split", new Set(), false).rows[0]!;
    expect([before.type === "fold" && before.key, after.type === "fold" && after.key]).toEqual([0, 0]);
  });

  it("lists the changes and the first row of each", () => {
    const model = buildRows(compareTexts(numbered(30), numbered(30, { 2: "line 2 x", 25: "line 25 y" })), "split", new Set(), false);
    expect(model.changes).toEqual([1, 3]);
    expect(model.changes.map((block) => model.rows[model.firstRow[block]!])).toEqual([
      { type: "line", block: 1, kind: "changed", left: 1, right: 1, show: "both" },
      { type: "line", block: 3, kind: "changed", left: 24, right: 24, show: "both" },
    ]);
    expect(model.lines).toBe(30);
  });

  it("draws the extra blank lines of an equal block when blank lines are ignored", () => {
    const diff = compareTexts("a\nb\n", "a\n\nb\n", { ignoreBlankLines: true });
    expect(shape(buildRows(diff, "split", new Set(), false).rows)).toEqual(["=1/1", "=/2", "=2/3"]);
  });
});
