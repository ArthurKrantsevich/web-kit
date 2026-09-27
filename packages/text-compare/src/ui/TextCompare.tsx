import {
  ActionButton,
  CopyButton,
  downloadText,
  EditorPane,
  EditorPanes,
  EditorShell,
  EditorToolbar,
  EmptyState,
  Menu,
  OpenFileButton,
  PasteButton,
  Segmented,
  StatusLine,
  ToolMenu,
  Tooltip,
  useFileDrop,
  useHydrated,
  type MenuItem,
  type SegmentedOption,
  type Shortcut,
  type StatusState,
} from "@web-kit/ui";
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { applyBlock } from "../core/apply";
import { splitLines } from "../core/lines";
import type { Granularity, LineEndings } from "../core/types";
import { toUnifiedDiff } from "../core/unified";
import { DiffView } from "./DiffView";
import { count, formatBytes } from "./format";
import { buildRows, PAGE_ROWS } from "./rows";
import { DEFAULT_OPTIONS, useTextCompare, type IgnoreOptions, type Layout, type UseTextCompareOptions } from "./useTextCompare";

export interface TextCompareProps extends UseTextCompareOptions {
  className?: string;
}

type Side = "left" | "right";

const LABEL: Record<Side, string> = { left: "Left", right: "Right" };

/** Larger files and downloads are not read: comparing them would freeze the page. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Text files by name or type; the picker can still be switched to all files. */
const ACCEPT =
  "text/*,.txt,.md,.csv,.json,.xml,.yaml,.yml,.log,.ini,.conf,.js,.jsx,.ts,.tsx,.css,.html,.py,.java,.go,.rs,.sql,.sh,.diff,.patch";

const LAYOUTS: SegmentedOption<Layout>[] = [
  { value: "split", label: "Side by side", tooltip: "Left and right in two columns that scroll together" },
  { value: "inline", label: "Inline", tooltip: "One column: removed lines above added ones" },
];

const GRANULARITIES: SegmentedOption<Granularity>[] = [
  { value: "word", label: "Words", tooltip: "Highlight changed words in changed lines" },
  { value: "char", label: "Characters", tooltip: "Highlight changed characters in changed lines" },
];

const IGNORE: { key: keyof IgnoreOptions; label: string; name: string; description: string }[] = [
  { key: "ignoreWhitespace", label: "Whitespace", name: "whitespace", description: "Spaces and tabs anywhere in a line" },
  { key: "ignoreCase", label: "Case", name: "case", description: "Upper and lower case letters" },
  { key: "ignoreBlankLines", label: "Blank lines", name: "blank lines", description: "Empty and whitespace-only lines" },
  { key: "ignoreLineEndings", label: "Line endings", name: "line endings", description: "CRLF, LF and CR, and a missing break at the end" },
];

const ENDING_NAMES: Record<LineEndings, string> = { lf: "LF", crlf: "CRLF", cr: "CR", mixed: "mixed endings", none: "no line breaks" };

const SAMPLE_LEFT = `# Release notes
Version 1.4 of the reporting service.

## Install
npm install report-service

## Settings
port = 8080
timeout = 30
retries = 3
log_level = info
cache = on
cache_size = 128
region = eu-west
user = admin
theme = light

## Changes
- Faster export of large reports.
- The settings page remembers the last tab.
`;

const SAMPLE_RIGHT = `# Release notes
Version 1.5 of the reporting service.

## Install
pnpm add report-service

## Settings
port = 8080
timeout = 30
retries = 3
log_level = info
cache = on
cache_size = 128
region = eu-west
user = admin
theme = dark
language = en

## Changes
- Faster export of large reports.
- Reports can be shared by link.
`;

/** "whitespace, case and line endings". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * Replaces the text of a side (`old`) with `next` through the browser's editing commands, so that Ctrl+Z in the field
 * undoes it. A text field keeps only LF line breaks: a side whose text has CR in it (opened from a file, say) differs
 * from its field and is set directly, keeping them; so is every side where the commands are missing (tests, old
 * browsers).
 */
function replaceText(area: HTMLTextAreaElement | null, old: string, next: string, set: (text: string) => void): void {
  let done = false;
  if (area && area.value === old && typeof document.execCommand === "function") {
    let start = 0;
    while (start < old.length && start < next.length && old[start] === next[start]) start++;
    let end = 0;
    while (end < old.length - start && end < next.length - start && old[old.length - 1 - end] === next[next.length - 1 - end]) end++;
    const inserted = next.slice(start, next.length - end);
    area.focus({ preventScroll: true });
    area.setSelectionRange(start, old.length - end);
    done = document.execCommand(inserted === "" ? "delete" : "insertText", false, inserted) && area.value === next;
  }
  if (!done) set(next);
}

/** Ready-made text compare UI. Import "@web-kit/text-compare/styles.css" once for the default look. */
export function TextCompare(props: TextCompareProps): ReactElement {
  const state = useTextCompare(props);
  const { left, right, comparison, fresh, layout, granularity, options } = state;
  const [notice, setNotice] = useState("");
  const [current, setCurrent] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(PAGE_ROWS);
  const [said, setSaid] = useState("");
  const leftRef = useRef<HTMLTextAreaElement>(null);
  const rightRef = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const centre = useRef(false);
  const hydrated = useHydrated();
  const id = useId();
  const refs = { left: leftRef, right: rightRef };
  const text = { left, right };
  const names = { left: state.leftName, right: state.rightName };
  const set = {
    left: (value: string, name?: string | null) => {
      setNotice("");
      state.setLeft(value, name);
    },
    right: (value: string, name?: string | null) => {
      setNotice("");
      state.setRight(value, name);
    },
  };

  const files = { accept: ACCEPT, maxBytes: MAX_FILE_BYTES, onError: setNotice };
  const leftDrop = useFileDrop({ ...files, label: "Open file into Left", onText: (value, file) => set.left(value, file.name) });
  const rightDrop = useFileDrop({ ...files, label: "Open file into Right", onText: (value, file) => set.right(value, file.name) });
  const drops = { left: leftDrop, right: rightDrop };

  const lines = useMemo(
    () => (comparison ? { left: splitLines(comparison.left), right: splitLines(comparison.right) } : null),
    [comparison],
  );
  const model = useMemo(
    () => (comparison ? buildRows(comparison.diff, layout, expanded, showAll) : null),
    [comparison, layout, expanded, showAll],
  );
  const changes = model?.changes.length ?? 0;
  // A new comparison starts with one page of rows again, so a large result is never drawn at once.
  const [seenComparison, setSeenComparison] = useState(comparison);
  if (comparison !== seenComparison) {
    setSeenComparison(comparison);
    if (limit !== PAGE_ROWS) setLimit(PAGE_ROWS);
  }
  // A new result may have fewer changes: the current one stays in range, or is none.
  const [seen, setSeen] = useState(model);
  if (model !== seen) {
    setSeen(model);
    if (current !== null && current >= changes) setCurrent(changes > 0 ? changes - 1 : null);
    setSaid("");
  }

  // Centre the current change after Previous or Next, a layout switch or Show all, never after other updates (a merge
  // keeps the scroll as it is).
  useLayoutEffect(() => {
    if (!centre.current || current === null || !model) return;
    centre.current = false;
    const element = body.current?.querySelector<HTMLElement>(`[data-block="${model.changes[current]}"]`);
    if (!body.current || !element) return;
    const top = element.offsetTop - Math.max(0, (body.current.clientHeight - element.offsetHeight) / 2);
    body.current.scrollTop = Math.max(0, top);
  }, [current, model, limit]);

  function go(to: number): void {
    if (!model || to < 0 || to >= changes) return;
    const row = model.firstRow[model.changes[to]!]!;
    if (row >= limit) setLimit(Math.ceil((row + 1) / PAGE_ROWS) * PAGE_ROWS);
    centre.current = true;
    setCurrent(to);
    setSaid(`Change ${to + 1} of ${changes}`);
  }
  const next = (): void => go(current === null ? 0 : current + 1);
  const previous = (): void => go(current === null ? -1 : current - 1);

  // Rows move when the layout or the folds change: the current change is centred again.
  function changeLayout(next: Layout): void {
    centre.current = true;
    state.setLayout(next);
  }

  function swap(): void {
    set.left(right, names.right);
    set.right(left, names.left);
  }

  function merge(block: number, direction: "to-left" | "to-right"): void {
    if (!comparison || !fresh) return;
    const side: Side = direction === "to-left" ? "left" : "right";
    const result = applyBlock(comparison.left, comparison.right, comparison.diff, block, direction, comparison.options);
    replaceText(refs[side].current, text[side], result, (value) => set[side](value));
    body.current?.focus({ preventScroll: true });
  }

  // What a share link carries and what "Save input in this browser" keeps.
  const shared = useMemo(
    () => ({ left, right, leftName: names.left, rightName: names.right, layout, granularity, options }),
    [left, right, names.left, names.right, layout, granularity, options],
  );

  /** Puts back a shared or saved state. It comes from outside, so every field is checked. */
  function restore(value: Record<string, unknown>): void {
    const name = (field: unknown) => (typeof field === "string" ? field.slice(0, 255) : null);
    if (typeof value.left === "string") set.left(value.left, name(value.leftName));
    if (typeof value.right === "string") set.right(value.right, name(value.rightName));
    if (value.layout === "split" || value.layout === "inline") state.setLayout(value.layout);
    if (value.granularity === "word" || value.granularity === "char") state.setGranularity(value.granularity);
    if (typeof value.options === "object" && value.options !== null) {
      const given = value.options as Record<string, unknown>;
      const restored = { ...DEFAULT_OPTIONS };
      for (const { key } of IGNORE) if (typeof given[key] === "boolean") restored[key] = given[key];
      state.setOptions(restored);
    }
  }

  const shortcuts: Shortcut[] = [
    { keys: "Mod+Enter", label: "Swap Left and Right", run: swap },
    { keys: "Alt+ArrowDown", label: "Next change", run: next },
    { keys: "Alt+ArrowUp", label: "Previous change", run: previous },
    { keys: "F7", label: "Next change", run: next },
    { keys: "Shift+F7", label: "Previous change", run: previous },
  ];

  const ignored = IGNORE.filter(({ key }) => options[key]);
  const ignoreItems: MenuItem[] = IGNORE.map(({ key, label, description }) => ({
    label,
    description,
    checked: options[key],
    keepOpen: true,
    onSelect: () => state.setOptions({ ...options, [key]: !options[key] }),
  }));
  const showAllItem: MenuItem = {
    label: "Show all unchanged lines",
    description: showAll ? "On: every line is drawn" : "Off: long unchanged runs are folded",
    checked: showAll,
    onSelect: () => {
      centre.current = true;
      setShowAll(!showAll);
    },
  };

  const diff = comparison?.diff ?? null;
  const exportable = fresh && changes > 0;
  const unified = (): string =>
    comparison === null
      ? ""
      : toUnifiedDiff(comparison.left, comparison.right, comparison.diff, {
          leftName: names.left ?? "left",
          rightName: names.right ?? "right",
        });
  const identical = comparison !== null && changes === 0;
  const differsInIgnored = identical && comparison.left.replace(/^\uFEFF/, "") !== comparison.right.replace(/^\uFEFF/, "");
  const sameTitle = differsInIgnored ? `Identical when ignoring ${listNames(ignored.map(({ name }) => name))}.` : "Texts are identical.";
  const position = current === null ? count(changes, "change") : `Change ${current + 1} of ${changes}`;
  const announcement = said || (comparison === null ? "" : identical ? sameTitle.slice(0, -1) : count(changes, "change"));

  const notes: string[] = [];
  if (diff?.approximate) notes.push("Too many differences for an exact result; the diff is correct but may be longer than needed.");
  if (diff && diff.lineEndings.left !== diff.lineEndings.right && diff.lineEndings.left !== "none" && diff.lineEndings.right !== "none") {
    notes.push(`Left ends lines with ${ENDING_NAMES[diff.lineEndings.left]}, Right with ${ENDING_NAMES[diff.lineEndings.right]}`);
  }
  if (diff && diff.finalNewline.left !== diff.finalNewline.right) {
    notes.push(`${diff.finalNewline.left ? "Right" : "Left"} has no newline at the end`);
  }
  if (state.workerNote) notes.push(state.workerNote);
  if (notice) notes.push(notice);

  const statusState: StatusState = comparison === null ? "idle" : diff?.approximate ? "warning" : identical ? "valid" : "idle";
  const summary =
    comparison === null
      ? "Nothing to compare yet."
      : identical
        ? sameTitle.slice(0, -1)
        : `${count(changes, "change")}: +${diff!.counts.added} −${diff!.counts.removed} ~${diff!.counts.changed} lines`;

  const toolbar = (
    <EditorToolbar>
      <Segmented label="Layout" value={layout} options={LAYOUTS} onChange={changeLayout} />
      <Segmented label="Highlight" value={granularity} options={GRANULARITIES} onChange={state.setGranularity} />
      <Menu
        look="field"
        label="Ignore"
        className="wk-compare__ignore"
        tooltip="Choose what does not count as a difference"
        content={
          <span className="wk-compare__ignore-label" data-widest="Ignore (4)">
            <span>{ignored.length > 0 ? `Ignore (${ignored.length})` : "Ignore"}</span>
          </span>
        }
        items={ignoreItems}
      />
      <span className="wk-ui-spacer" />
      <ActionButton action="custom" icon="swap" tooltip="Swap Left and Right" onClick={swap}>
        Swap
      </ActionButton>
      <ActionButton
        action="sample"
        words={{ target: "both sides" }}
        onClick={() => {
          set.left(SAMPLE_LEFT, null);
          set.right(SAMPLE_RIGHT, null);
        }}
      />
      <ActionButton
        action="clear"
        words={{ target: "both sides" }}
        onClick={() => {
          set.left("", null);
          set.right("", null);
          setCurrent(null);
          setExpanded(new Set());
        }}
      />
      <ToolMenu
        toolKey="text-compare"
        state={shared}
        onRestore={restore}
        urlTargets={[
          { label: "Load Left from URL…", onText: (value) => set.left(value, null) },
          { label: "Load Right from URL…", onText: (value) => set.right(value, null) },
        ]}
        extraItems={[showAllItem]}
        shortcuts={shortcuts}
        onNotice={setNotice}
        dropHint="Drop the file on Left or Right to open it"
        maxBytes={MAX_FILE_BYTES}
      />
    </EditorToolbar>
  );

  const status = (
    <StatusLine state={statusState}>
      <span>{summary}</span>
      {notes.map((note) => (
        <span key={note} className="wk-compare__note">
          {note}
        </span>
      ))}
    </StatusLine>
  );

  return (
    <EditorShell className={["wk-compare", props.className].filter(Boolean).join(" ")} toolbar={toolbar} status={status}>
      <EditorPanes>
        {(["left", "right"] as const).map((side) => (
          <EditorPane
            key={side}
            kind="input"
            className={`wk-compare__pane--${side}`}
            title={
              names[side] === null ? (
                LABEL[side]
              ) : (
                <Tooltip content={names[side]!}>
                  <span className="wk-compare__name">{names[side]}</span>
                </Tooltip>
              )
            }
            labelFor={`${id}-${side}`}
            meta={formatBytes(state.bytes[side])}
            drop={drops[side]}
            dropLabel={`Drop the file to open it in ${LABEL[side]}`}
            actions={
              <>
                <OpenFileButton
                  aria-label={`Open file into ${LABEL[side]}`}
                  words={{ types: "text", into: ` into ${LABEL[side]}`, target: LABEL[side] }}
                  drop={drops[side]}
                />
                <PasteButton
                  aria-label={`Paste into ${LABEL[side]}`}
                  words={{ into: ` into ${LABEL[side]}` }}
                  onText={(value) => set[side](value)}
                  onError={setNotice}
                />
              </>
            }
          >
            <textarea
              ref={refs[side]}
              id={`${id}-${side}`}
              className="wk-ui-area"
              aria-label={names[side] === null ? undefined : `${LABEL[side]}: ${names[side]}`}
              readOnly={!hydrated}
              value={text[side]}
              onChange={(event) => set[side](event.target.value)}
              spellCheck={false}
              placeholder={side === "left" ? "Paste or drop the original text" : "Paste or drop the changed text"}
            />
          </EditorPane>
        ))}
      </EditorPanes>

      <section className="wk-ui-pane wk-compare__result" aria-label="Changes" data-pane="output">
        <div className="wk-ui-pane__head">
          <span className="wk-ui-pane__title">Changes</span>
          {diff && (
            <span className="wk-ui-pane__meta wk-compare__counts">
              <span className="wk-compare__count wk-compare__count--added">{`+${diff.counts.added}`}</span>
              <span className="wk-compare__count wk-compare__count--removed">{`−${diff.counts.removed}`}</span>
              <span className="wk-compare__count wk-compare__count--changed">{`~${diff.counts.changed}`}</span>
            </span>
          )}
          <span className="wk-ui-spacer" />
          <ActionButton
            action="custom"
            icon="chevron-up"
            aria-label="Previous change"
            tooltip={`Previous change (Alt+↑ or Shift+F7). ${position}`}
            disabled={current === null || current === 0}
            onClick={previous}
          >
            Previous
          </ActionButton>
          <ActionButton
            action="custom"
            icon="chevron-down"
            aria-label="Next change"
            tooltip={`Next change (Alt+↓ or F7). ${position}`}
            disabled={changes === 0 || current === changes - 1}
            onClick={next}
          >
            Next
          </ActionButton>
          <ActionButton
            action="download"
            words={{ what: "the unified diff", file: "compare.patch" }}
            disabled={!exportable}
            onClick={() => downloadText(unified(), "compare.patch", "text/x-diff")}
          />
          <CopyButton text={unified} tooltip="Copy the unified diff to the clipboard" variant="quiet" icon disabled={!exportable} />
        </div>
        <p role="status" aria-live="polite" className="wk-ui-sr-only">
          {announcement}
        </p>
        <div className="wk-compare__frame">
          <div ref={body} className="wk-compare__body" tabIndex={-1}>
            {comparison === null ? (
              state.pending === null && (
                <EmptyState size="sm" icon="paste" className="wk-compare__state" title="Paste or drop two texts to compare." />
              )
            ) : identical ? (
              state.pending === null && <EmptyState size="sm" icon="check" className="wk-compare__state" title={sameTitle} />
            ) : (
              lines !== null &&
              model !== null && (
                <DiffView
                  comparison={comparison}
                  lines={lines}
                  model={model}
                  layout={layout}
                  granularity={granularity}
                  limit={limit}
                  onShowMore={() => setLimit(limit + PAGE_ROWS)}
                  onExpand={(key) => setExpanded(new Set(expanded).add(key))}
                  current={current}
                  canMerge={fresh}
                  onMerge={merge}
                />
              )
            )}
          </div>
          {/* The previous result stays under it, so its scroll is kept when the new one arrives. */}
          {state.pending !== null && (
            <div className="wk-compare__pending">
              <EmptyState size="sm" icon="generate" title={state.pending} />
            </div>
          )}
        </div>
      </section>
    </EditorShell>
  );
}
