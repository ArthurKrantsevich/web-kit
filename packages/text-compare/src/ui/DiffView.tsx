import { Button } from "@web-kit/ui";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { inlineDiff } from "../core/inline";
import type { SplitText } from "../core/lines";
import type { Granularity, Segment } from "../core/types";
import { count } from "./format";
import type { FoldRow, LineRow, RowModel } from "./rows";
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

/** Rows per chunk: the unit that is drawn or left out as the result scrolls. */
export const CHUNK_ROWS = 100;
/** The height of a row before one is measured, in pixels. */
const ROW_ESTIMATE = 21;
/** How far outside the visible part of the result chunks are drawn, so scrolling does not show them late. */
const NEAR = "800px 0px";

/** A piece of a chunk: an unchanged line, a fold, or the rows of one change block that fall into the chunk. */
type Part =
  | { type: "line"; row: LineRow; index: number }
  | { type: "fold"; row: FoldRow; index: number }
  | { type: "block"; block: number; rows: LineRow[]; start: number; first: boolean };

interface Chunk {
  parts: Part[];
  rows: number;
  /** The change blocks with rows in this chunk. */
  blocks: number[];
}

/** Cuts the drawn rows into chunks of CHUNK_ROWS rows; a change block longer than that is cut too. */
function toChunks(model: RowModel, limit: number): Chunk[] {
  const chunks: Chunk[] = [];
  let chunk: Chunk | null = null;
  const end = Math.min(limit, model.rows.length);
  for (let r = 0; r < end; r++) {
    const row = model.rows[r]!;
    if (chunk === null || chunk.rows === CHUNK_ROWS) chunks.push((chunk = { parts: [], rows: 0, blocks: [] }));
    chunk.rows++;
    if (row.type === "fold") chunk.parts.push({ type: "fold", row, index: r });
    else if (row.kind === "equal") chunk.parts.push({ type: "line", row, index: r });
    else {
      const last = chunk.parts.at(-1);
      if (last?.type === "block" && last.block === row.block) last.rows.push(row);
      else {
        chunk.parts.push({ type: "block", block: row.block, rows: [row], start: r, first: r === model.firstRow[row.block] });
        chunk.blocks.push(row.block);
      }
    }
  }
  return chunks;
}

/** The nearest ancestor that scrolls, or null for the page. */
function scroller(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

/** What every chunk draws with; one object per result, so chunks that did not change are not drawn again. */
interface Context {
  layout: Layout;
  lines: { left: SplitText; right: SplitText };
  pieces: (row: LineRow) => Pieces | null;
  eof: { left: number; right: number };
  order: Map<number, number>;
  total: number;
  canMerge: boolean;
  onMerge: (block: number, direction: "to-left" | "to-right") => void;
  /** Opens the fold `key` found at row `index`. */
  onExpand: (key: number, index: number) => void;
}

/**
 * The result: rows of both texts, folds, the changes grouped with their merge buttons, and "Show more". Only the
 * chunks near the visible part of the result are drawn (and their highlights computed); the others are empty boxes
 * of their measured, or estimated, height. Without IntersectionObserver everything is drawn.
 */
export function DiffView(props: DiffViewProps): ReactElement {
  const { comparison, lines, model, layout, granularity, limit, current } = props;
  // The handlers change with every render of the parent; chunks call the latest ones through stable functions.
  const latest = useRef(props);
  latest.current = props;
  const onMerge = useCallback((block: number, direction: "to-left" | "to-right") => latest.current.onMerge(block, direction), []);
  // A fold's button goes away when it opens: focus then moves to the first line it showed, at the fold's row.
  const reveal = useRef<number | null>(null);
  const onExpand = useCallback((key: number, index: number) => {
    reveal.current = index;
    latest.current.onExpand(key);
  }, []);
  useLayoutEffect(() => {
    if (reveal.current === null) return;
    const row = root.current?.querySelector<HTMLElement>(`[data-row="${reveal.current}"]`);
    reveal.current = null;
    if (!row) return;
    row.tabIndex = -1;
    row.focus({ preventScroll: true });
  }, [model]);
  // One highlight per changed pair and view, shared by the two rows of a pair in the inline layout.
  const pieces = useMemo(() => {
    const cache = new Map<string, Pieces>();
    return (row: LineRow): Pieces | null => {
      if (row.kind !== "changed" || row.left === null || row.right === null) return null;
      const key = `${row.left}:${row.right}`;
      let found = cache.get(key);
      if (!found) {
        found = inlineDiff(lines.left.lines[row.left]!, lines.right.lines[row.right]!, granularity, comparison.options);
        cache.set(key, found);
      }
      return found;
    };
  }, [comparison, lines, granularity]);
  const order = useMemo(() => new Map(model.changes.map((block, index) => [block, index])), [model]);
  // A missing last line break is marked on the last line, as git does, when the other side has one.
  const { finalNewline } = comparison.diff;
  const eofLeft = finalNewline.left || !finalNewline.right ? -1 : lines.left.lines.length - 1;
  const eofRight = finalNewline.right || !finalNewline.left ? -1 : lines.right.lines.length - 1;
  const context = useMemo(
    (): Context => ({
      layout,
      lines,
      pieces,
      eof: { left: eofLeft, right: eofRight },
      order,
      total: model.changes.length,
      canMerge: props.canMerge,
      onMerge,
      onExpand,
    }),
    [layout, lines, pieces, eofLeft, eofRight, order, model, props.canMerge, onMerge, onExpand],
  );
  const chunks = useMemo(() => toChunks(model, limit), [model, limit]);

  // Which chunks are near the view, and the height each one had when it was last drawn.
  // The server and the first render in the browser draw the first chunk only, so hydration matches; null draws all.
  const [near, setNear] = useState<ReadonlySet<number> | null>(() => new Set([0]));
  const heights = useRef(new Map<number, number>());
  const [rowHeight, setRowHeight] = useState(ROW_ESTIMATE);
  const root = useRef<HTMLDivElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  // A layout effect, so the observer exists when the effect below first observes the chunks.
  useLayoutEffect(() => {
    if (typeof IntersectionObserver !== "function") return setNear(null);
    if (!root.current) return;
    const watch = new IntersectionObserver(
      (entries) => {
        setNear((before) => {
          const next = new Set(before);
          for (const entry of entries) {
            const target = entry.target as HTMLElement;
            const index = Number(target.dataset.chunk);
            if (target.dataset.drawn !== undefined) heights.current.set(index, entry.boundingClientRect.height);
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next.size === before?.size && [...next].every((index) => before.has(index)) ? before : next;
        });
      },
      { root: scroller(root.current), rootMargin: NEAR },
    );
    observer.current = watch;
    return () => {
      watch.disconnect();
      observer.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const watch = observer.current;
    if (!watch || !root.current) return;
    for (const element of root.current.querySelectorAll(":scope > .wk-compare__chunk")) watch.observe(element);
    // The first drawn chunk tells how tall a row is, for the boxes of the chunks not drawn yet.
    const first = root.current.querySelector<HTMLElement>(":scope > .wk-compare__chunk[data-drawn]");
    const count = first ? first.querySelectorAll(".wk-compare__row, .wk-compare__fold").length : 0;
    if (first && count > 0) {
      const measured = Math.max(1, Math.round((first.offsetHeight / count) * 10) / 10);
      if (Math.abs(measured - rowHeight) > 0.5) setRowHeight(measured);
    }
  });

  const currentBlock = current === null ? -1 : (model.changes[current] ?? -1);
  const digits = String(Math.max(1, model.lines)).length;
  return (
    <div ref={root} className={`wk-compare__rows wk-compare__rows--${layout}`} style={{ ["--wk-compare-digits" as string]: String(digits) }}>
      {chunks.map((chunk, index) => {
        const holds = chunk.blocks.includes(currentBlock);
        const drawn = near === null || near.has(index) || holds;
        return (
          <ChunkView
            key={index}
            index={index}
            chunk={chunk}
            drawn={drawn}
            height={heights.current.get(index) ?? chunk.rows * rowHeight}
            current={holds ? currentBlock : -1}
            context={context}
          />
        );
      })}
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

interface ChunkProps {
  index: number;
  chunk: Chunk;
  drawn: boolean;
  /** The box's height while the chunk is not drawn. */
  height: number;
  /** The current change's block when it is in this chunk, else -1. */
  current: number;
  context: Context;
}

const ChunkView = memo(function ChunkView({ index, chunk, drawn, height, current, context }: ChunkProps): ReactElement {
  if (!drawn) return <div className="wk-compare__chunk" data-chunk={index} style={{ height: `${height}px` }} />;
  const { layout, lines, pieces, eof, order, total, canMerge, onMerge, onExpand } = context;
  const line = (row: LineRow, first: boolean, index: number) => (
    <Line
      key={`${row.block}:${row.left}:${row.right}:${row.show}`}
      row={row}
      index={index}
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
              disabled={!canMerge}
              onClick={() => onMerge(row.block, "to-right")}
            >
              Use left
            </Button>
            <Button
              icon="arrow-left"
              iconOnly
              className="wk-compare__merge"
              tooltip="Replace these lines on the left with the right ones"
              disabled={!canMerge}
              onClick={() => onMerge(row.block, "to-left")}
            >
              Use right
            </Button>
          </>
        ) : null
      }
    />
  );
  return (
    <div className="wk-compare__chunk" data-chunk={index} data-drawn="">
      {chunk.parts.map((part) => {
        if (part.type === "fold") {
          return (
            <div key={`fold:${part.row.key}`} className="wk-compare__fold">
              <button type="button" className="wk-compare__unfold" onClick={() => onExpand(part.row.key, part.index)}>
                {`Show ${count(part.row.count, "unchanged line")}`}
              </button>
            </div>
          );
        }
        if (part.type === "line") return line(part.row, false, part.index);
        const position = order.get(part.block)!;
        // A block cut by a chunk edge: only its first part is the named group with the merge buttons.
        return (
          <div
            key={`block:${part.block}`}
            className="wk-compare__block"
            role={part.first ? "group" : undefined}
            aria-label={part.first ? `Change ${position + 1} of ${total}` : undefined}
            data-block={part.block}
            data-current={part.block === current || undefined}
          >
            {part.rows.map((each, k) => line(each, k === 0 && part.first, part.start + k))}
          </div>
        );
      })}
    </div>
  );
});

interface LineProps {
  row: LineRow;
  /** The row's place in the model, for focus. */
  index: number;
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

const Line = memo(function Line({ row, index, layout, left, right, pieces, eofLeft, eofRight, actions }: LineProps): ReactElement {
  const number = (value: number | null) => <span className="wk-compare__num">{value === null ? "" : value + 1}</span>;
  if (layout === "split") {
    return (
      <div className={`wk-compare__row wk-compare__row--${row.kind}`} data-row={index}>
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
    <div className={`wk-compare__row wk-compare__row--${kind}`} data-row={index}>
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
