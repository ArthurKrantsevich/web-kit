import { Button } from "@web-kit/ui";
import { memo, useMemo, type ReactElement, type ReactNode } from "react";
import { inlineDiff } from "../core/inline";
import type { SplitText } from "../core/lines";
import type { Granularity, Segment } from "../core/types";
import { count } from "./format";
import type { LineRow, RowModel } from "./rows";
import type { Comparison, Layout } from "./useTextCompare";

export interface DiffViewProps {
  comparison: Comparison;
  /** The two texts of `comparison`, cut into lines. */
  lines: { left: SplitText; right: SplitText };
  model: RowModel;
  layout: Layout;
  granularity: Granularity;
  /** Rows drawn; the rest wait for "Show more". */
  limit: number;
  onShowMore: () => void;
  onExpand: (key: number) => void;
  /** The change marked as current, as an index into `model.changes`. */
  current: number | null;
  /** False while the comparison describes older text: its lines cannot be copied then. */
  canMerge: boolean;
  onMerge: (block: number, direction: "to-left" | "to-right") => void;
}

type Pieces = { left: Segment[]; right: Segment[] };

/** The result: rows of both texts, folds, the changes grouped with their merge buttons, and "Show more". */
export function DiffView(props: DiffViewProps): ReactElement {
  const { comparison, lines, model, layout, granularity, limit, current } = props;
  // One highlight per changed pair and view, shared by the two rows of a pair in the inline layout.
  const highlights = useMemo(() => new Map<string, Pieces>(), [comparison, granularity]);
  const pieces = (row: LineRow): Pieces | null => {
    if (row.kind !== "changed" || row.left === null || row.right === null) return null;
    const key = `${row.left}:${row.right}`;
    let found = highlights.get(key);
    if (!found) {
      found = inlineDiff(lines.left.lines[row.left]!, lines.right.lines[row.right]!, granularity, comparison.options);
      highlights.set(key, found);
    }
    return found;
  };
  // A missing last line break is marked on the last line, as git does, when the other side has one.
  const { finalNewline } = comparison.diff;
  const eof = {
    left: finalNewline.left || !finalNewline.right ? -1 : lines.left.lines.length - 1,
    right: finalNewline.right || !finalNewline.left ? -1 : lines.right.lines.length - 1,
  };
  const order = useMemo(() => new Map(model.changes.map((block, index) => [block, index])), [model]);
  const shown = model.rows.slice(0, limit);
  const digits = String(Math.max(1, model.lines)).length;
  const items: ReactNode[] = [];
  const line = (row: LineRow, first: boolean) => (
    <Line
      key={`${row.block}:${row.left}:${row.right}:${row.show}`}
      row={row}
      layout={layout}
      left={row.left === null ? null : lines.left.lines[row.left]!}
      right={row.right === null ? null : lines.right.lines[row.right]!}
      pieces={pieces(row)}
      eofLeft={row.left !== null && row.left === eof.left}
      eofRight={row.right !== null && row.right === eof.right}
      actions={
        first ? (
          <>
            <Button
              icon="arrow-right"
              iconOnly
              className="wk-compare__merge"
              tooltip="Replace these lines on the right with the left ones"
              disabled={!props.canMerge}
              onClick={() => props.onMerge(row.block, "to-right")}
            >
              Use left
            </Button>
            <Button
              icon="arrow-left"
              iconOnly
              className="wk-compare__merge"
              tooltip="Replace these lines on the left with the right ones"
              disabled={!props.canMerge}
              onClick={() => props.onMerge(row.block, "to-left")}
            >
              Use right
            </Button>
          </>
        ) : null
      }
    />
  );
  for (let r = 0; r < shown.length; ) {
    const row = shown[r]!;
    if (row.type === "fold") {
      items.push(
        <div key={`fold:${row.key}`} className="wk-compare__fold">
          <button type="button" className="wk-compare__unfold" onClick={() => props.onExpand(row.key)}>
            {`Show ${count(row.count, "unchanged line")}`}
          </button>
        </div>,
      );
      r++;
      continue;
    }
    if (row.kind === "equal") {
      items.push(line(row, false));
      r++;
      continue;
    }
    const block = row.block;
    const start = r;
    while (r < shown.length && shown[r]!.type === "line" && shown[r]!.block === block) r++;
    const index = order.get(block)!;
    const rows = shown.slice(start, r) as LineRow[];
    items.push(
      <div
        key={`block:${block}`}
        className="wk-compare__block"
        role="group"
        aria-label={`Change ${index + 1} of ${model.changes.length}`}
        data-block={block}
        data-current={index === current || undefined}
      >
        {rows.map((each, k) => line(each, k === 0 && start === model.firstRow[block]))}
      </div>,
    );
  }

  return (
    <div className={`wk-compare__rows wk-compare__rows--${layout}`} style={{ ["--wk-compare-digits" as string]: String(digits) }}>
      {items}
      {model.rows.length > limit && (
        <div className="wk-compare__more">
          <span>{`Showing ${limit.toLocaleString("en-US")} of ${model.rows.length.toLocaleString("en-US")} rows.`}</span>
          <Button variant="outline" onClick={props.onShowMore}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

interface LineProps {
  row: LineRow;
  layout: Layout;
  left: string | null;
  right: string | null;
  pieces: Pieces | null;
  eofLeft: boolean;
  eofRight: boolean;
  actions: ReactNode;
}

const SIDE_CLASS: Record<LineRow["kind"], { left: string; right: string }> = {
  equal: { left: "", right: "" },
  removed: { left: " wk-compare__text--removed", right: " wk-compare__text--none" },
  added: { left: " wk-compare__text--none", right: " wk-compare__text--added" },
  changed: { left: " wk-compare__text--removed", right: " wk-compare__text--added" },
};

function Text({ text, pieces, eof }: { text: string; pieces: Segment[] | null; eof: boolean }): ReactElement {
  return (
    <>
      {pieces === null
        ? text
        : pieces.map((piece, index) =>
            piece.changed ? (
              <span key={index} className="wk-compare__hl">
                {piece.text}
              </span>
            ) : (
              piece.text
            ),
          )}
      {eof && <span className="wk-compare__eof">No newline at end of file</span>}
    </>
  );
}

const Line = memo(function Line({ row, layout, left, right, pieces, eofLeft, eofRight, actions }: LineProps): ReactElement {
  const number = (value: number | null) => <span className="wk-compare__num">{value === null ? "" : value + 1}</span>;
  if (layout === "split") {
    return (
      <div className={`wk-compare__row wk-compare__row--${row.kind}`}>
        {number(row.left)}
        <span className={`wk-compare__text${SIDE_CLASS[row.kind].left}`}>
          {left !== null && <Text text={left} pieces={pieces?.left ?? null} eof={eofLeft} />}
        </span>
        <span className="wk-compare__actions">{actions}</span>
        {number(row.right)}
        <span className={`wk-compare__text${SIDE_CLASS[row.kind].right}`}>
          {right !== null && <Text text={right} pieces={pieces?.right ?? null} eof={eofRight} />}
        </span>
      </div>
    );
  }
  // Inline: an unchanged line shows the right text, as a unified diff does; a changed pair has a row per side.
  const side = row.show === "left" || (row.show === "both" && row.right === null) ? "left" : "right";
  const kind = row.kind === "equal" ? "equal" : side === "left" ? "removed" : "added";
  const sign = kind === "equal" ? " " : kind === "removed" ? "−" : "+";
  return (
    <div className={`wk-compare__row wk-compare__row--${kind}`}>
      <span className="wk-compare__actions">{actions}</span>
      {number(side === "left" || kind === "equal" ? row.left : null)}
      {number(side === "right" || kind === "equal" ? row.right : null)}
      <span className="wk-compare__sign" aria-hidden="true">
        {sign}
      </span>
      <span className={`wk-compare__text${kind === "equal" ? "" : ` wk-compare__text--${kind}`}`}>
        {side === "left" ? (
          <Text text={left ?? ""} pieces={pieces?.left ?? null} eof={eofLeft} />
        ) : (
          <Text text={right ?? ""} pieces={pieces?.right ?? null} eof={eofRight} />
        )}
      </span>
    </div>
  );
});
