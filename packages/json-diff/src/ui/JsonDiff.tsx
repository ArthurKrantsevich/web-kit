import { formatPath, type JsonError } from "@web-kit/json-core";
import {
  ActionButton,
  CopyButton,
  downloadText,
  EditorPane,
  EditorPanes,
  EditorShell,
  EditorToolbar,
  EmptyState,
  OpenFileButton,
  PasteButton,
  Segmented,
  StatusLine,
  ToolMenu,
  Tooltip,
  useFileDrop,
  type SegmentedOption,
  type Shortcut,
  useHydrated,
} from "@web-kit/ui";
import { useId, useMemo, useRef, useState, type ReactElement } from "react";
import type { JsonChange, JsonSpan } from "../core/types";
import { useJsonDiff, type UseJsonDiffOptions } from "./useJsonDiff";

export interface JsonDiffProps extends UseJsonDiffOptions {
  className?: string;
}

type Side = "left" | "right";

const SAMPLE_LEFT =
  '{"name":"web-kit","version":"1.0.0","tools":[{"id":1,"name":"formatter"},{"id":2,"name":"convert"}],"stable":true}';
const SAMPLE_RIGHT =
  '{"name":"web-kit","version":"1.1.0","tools":[{"id":1,"name":"formatter"},{"id":2,"name":"convert"},{"id":3,"name":"diff"}],"license":"MIT"}';

/** Rows beyond this are not rendered: a huge list would freeze the page. The patch still has every change. */
const LIST_LIMIT = 1000;

/** Larger files and downloads are not read: comparing them would freeze the page. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ACCEPT = ".json,application/json,.txt,text/plain";

/** Longest array key that can be typed; a shared or saved longer one is kept as it is. */
const KEY_MAX_LENGTH = 64;

const ARRAY_MODES: SegmentedOption<"index" | "key">[] = [
  { value: "index", label: "By index", tooltip: "Compare array items at the same position" },
  { value: "key", label: "By key", tooltip: "Match object items by a key, in any order" },
];

const NUMBER_MODES: SegmentedOption<"value" | "raw">[] = [
  { value: "value", label: "By value", tooltip: "1.0 and 1 are the same number" },
  { value: "raw", label: "As written", tooltip: "1.0 and 1 differ because they are written differently" },
];

const SIGN: Record<JsonChange["kind"], string> = { added: "+", removed: "−", changed: "~" };
const LABEL: Record<Side, string> = { left: "Left", right: "Right" };
const hasBom = (text: string): boolean => text.charCodeAt(0) === 0xfeff;
const encoder = new TextEncoder();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const count = (n: number, word: string): string => `${n} ${n === 1 ? word : `${word}s`}`;

/** One line, at most 80 characters. */
function preview(raw: string): string {
  const flat = raw.replace(/\s+/g, " ");
  return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
}

function formatError(side: Side, error: JsonError): string {
  return `${LABEL[side]}: Line ${error.line}, column ${error.column}: ${error.message}`;
}

/** "Changed $.b: 2 → 3", "Added $.c: 4", "Removed $.x: true": the row's visible parts, read as a sentence. */
function describeChange(change: JsonChange): string {
  const path = formatPath(change.path);
  if (change.kind === "changed") return `Changed ${path}: ${preview(change.left!.raw)} → ${preview(change.right!.raw)}`;
  if (change.kind === "added") return `Added ${path}: ${preview(change.right!.raw)}`;
  return `Removed ${path}: ${preview(change.left!.raw)}`;
}

/** Ready-made JSON diff UI. Import "@web-kit/json-diff/styles.css" once for the default look. */
export function JsonDiff(props: JsonDiffProps): ReactElement {
  const state = useJsonDiff(props);
  const { left, right, result, patch, fresh } = state;
  const [notice, setNotice] = useState("");
  const leftRef = useRef<HTMLTextAreaElement>(null);
  const rightRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  // Read-only until hydration: React would replace anything typed earlier with its own state.
  const hydrated = useHydrated();
  const refs = { left: leftRef, right: rightRef };
  const text = { left, right };
  const set = {
    left: (value: string) => {
      setNotice("");
      state.setLeft(value);
    },
    right: (value: string) => {
      setNotice("");
      state.setRight(value);
    },
  };

  // Open file and drop share one reader per side, so the file chosen or dropped last wins.
  const files = { accept: ACCEPT, maxBytes: MAX_FILE_BYTES, onError: setNotice };
  const leftDrop = useFileDrop({ ...files, label: "Open file into Left", onText: set.left });
  const rightDrop = useFileDrop({ ...files, label: "Open file into Right", onText: set.right });
  const drops = { left: leftDrop, right: rightDrop };
  // What a share link carries and what "Save input in this browser" keeps.
  const shared = useMemo(
    () => ({ left, right, arrayMode: state.arrayMode, arrayKey: state.arrayKey, numbers: state.numbers }),
    [left, right, state.arrayMode, state.arrayKey, state.numbers],
  );

  /** Puts back a shared or saved state. It comes from outside, so every field is checked. */
  function restore(value: Record<string, unknown>): void {
    if (typeof value.left === "string") set.left(value.left);
    if (typeof value.right === "string") set.right(value.right);
    if (value.arrayMode === "index" || value.arrayMode === "key") state.setArrayMode(value.arrayMode);
    if (typeof value.arrayKey === "string") state.setArrayKey(value.arrayKey);
    if (value.numbers === "value" || value.numbers === "raw") state.setNumbers(value.numbers);
  }

  function swap(): void {
    set.left(right);
    set.right(left);
  }

  const shortcuts: Shortcut[] = [{ keys: "Mod+Enter", label: "Swap Left and Right", run: swap }];

  /** Selects `start..end` (offsets without a BOM) in one of the inputs. */
  function select(side: Side, start: number, end: number): void {
    const area = refs[side].current;
    if (!area) return;
    const shift = hasBom(text[side]) ? 1 : 0;
    area.focus();
    area.setSelectionRange(start + shift, Math.min(end + shift, text[side].length));
  }

  function show(change: JsonChange): void {
    const [side, where]: [Side, JsonSpan] = change.right ? ["right", change.right] : ["left", change.left!];
    select(side, where.start, where.end);
  }

  const diff = result?.ok ? result.value : null;
  // A patch for older text would not turn the current Left into the current Right.
  const freshPatch = fresh ? patch : "";
  // Read out after each comparison. The element is always there, so the first result is announced too.
  const announcement =
    result === null
      ? ""
      : !result.ok
        ? formatError(result.side, result.error)
        : result.value.changes.length === 0
          ? result.value.wholeArrays.length > 0
            ? "Only the order of array items differs"
            : "No differences"
          : count(result.value.changes.length, "change");

  const toolbar = (
    <EditorToolbar>
      <span className="wk-ui-field" aria-hidden="true">
        Arrays
      </span>
      <Segmented label="Compare arrays" value={state.arrayMode} options={ARRAY_MODES} onChange={state.setArrayMode} />
      <input
        className="wk-ui-input wk-diff__key"
        aria-label="Array key"
        placeholder="id"
        value={state.arrayKey}
        maxLength={KEY_MAX_LENGTH}
        disabled={state.arrayMode !== "key"}
        spellCheck={false}
        onChange={(e) => state.setArrayKey(e.target.value)}
      />
      <span className="wk-ui-divider" aria-hidden="true" />
      <span className="wk-ui-field" aria-hidden="true">
        Numbers
      </span>
      <Segmented label="Compare numbers" value={state.numbers} options={NUMBER_MODES} onChange={state.setNumbers} />
      <span className="wk-ui-spacer" />
      <ActionButton action="custom" icon="swap" tooltip="Swap Left and Right" onClick={swap}>
        Swap
      </ActionButton>
      <ActionButton
        action="sample"
        words={{ target: "both sides" }}
        onClick={() => {
          set.left(SAMPLE_LEFT);
          set.right(SAMPLE_RIGHT);
        }}
      />
      <ActionButton
        action="clear"
        words={{ target: "both sides" }}
        onClick={() => {
          set.left("");
          set.right("");
        }}
      />
      <ToolMenu
        toolKey="json-diff"
        state={shared}
        onRestore={restore}
        urlTargets={[
          { label: "Load Left from URL…", onText: set.left },
          { label: "Load Right from URL…", onText: set.right },
        ]}
        shortcuts={shortcuts}
        onNotice={setNotice}
        dropHint="Drop the file on Left or Right to open it"
        maxBytes={MAX_FILE_BYTES}
      />
    </EditorToolbar>
  );

  const status =
    result === null ? (
      <StatusLine state="idle">
        <span>Nothing to compare yet.</span>
        {notice && <span className="wk-diff__notice">{notice}</span>}
      </StatusLine>
    ) : !result.ok ? (
      <StatusLine state="error">
        <span>{`${LABEL[result.side]} is not valid JSON`}</span>
        {notice && <span className="wk-diff__notice">{notice}</span>}
      </StatusLine>
    ) : result.value.changes.length === 0 ? (
      <StatusLine state="valid">
        <span>{result.value.wholeArrays.length > 0 ? "Same items, different order" : "Same JSON"}</span>
        {notice && <span className="wk-diff__notice">{notice}</span>}
      </StatusLine>
    ) : (
      <StatusLine state="idle">
        <span>{count(result.value.changes.length, "change")}</span>
        {notice && <span className="wk-diff__notice">{notice}</span>}
      </StatusLine>
    );

  return (
    <EditorShell className={["wk-diff", props.className].filter(Boolean).join(" ")} toolbar={toolbar} status={status}>
      <EditorPanes>
        {(["left", "right"] as const).map((side) => (
          <EditorPane
            key={side}
            kind="input"
            className={`wk-diff__pane--${side}`}
            title={LABEL[side]}
            labelFor={`${id}-${side}`}
            meta={formatBytes(encoder.encode(text[side]).length)}
            drop={drops[side]}
            dropLabel={`Drop the file to open it in ${LABEL[side]}`}
            actions={
              <>
                <OpenFileButton
                  aria-label={`Open file into ${LABEL[side]}`}
                  words={{ into: ` into ${LABEL[side]}`, target: LABEL[side] }}
                  drop={drops[side]}
                />
                {/* Its place is kept until hydration, so it may come last: nothing moves when it appears. */}
                <PasteButton
                  aria-label={`Paste into ${LABEL[side]}`}
                  words={{ into: ` into ${LABEL[side]}` }}
                  onText={set[side]}
                  onError={setNotice}
                />
              </>
            }
          >
            <textarea
              ref={refs[side]}
              id={`${id}-${side}`}
              className="wk-ui-area"
              readOnly={!hydrated}
              value={text[side]}
              onChange={(e) => set[side](e.target.value)}
              spellCheck={false}
              placeholder='{"hello": "world"}'
            />
          </EditorPane>
        ))}
      </EditorPanes>

      <section className="wk-diff__result" aria-label="Differences" data-pane="output">
        <div className="wk-ui-pane__head wk-diff__result-head">
          <span className="wk-ui-pane__title">Changes</span>
          {diff && (
            <span className="wk-diff__summary">
              <span className="wk-diff__count wk-diff__count--added">{`+${diff.counts.added}`}</span>
              <span className="wk-diff__count wk-diff__count--removed">{`−${diff.counts.removed}`}</span>
              <span className="wk-diff__count wk-diff__count--changed">{`~${diff.counts.changed}`}</span>
            </span>
          )}
          <span className="wk-ui-spacer" />
          <ActionButton
            action="download"
            words={{ what: "the JSON Patch", file: "patch.json" }}
            disabled={freshPatch === ""}
            onClick={() => downloadText(freshPatch, "patch.json", "application/json")}
          />
          <CopyButton
            text={freshPatch}
            label="Copy JSON Patch"
            tooltip="Copy RFC 6902 operations that turn Left into Right"
            variant="quiet"
            icon
          />
        </div>
        <p role="status" aria-live="polite" className="wk-ui-sr-only">
          {announcement}
        </p>
        <div className="wk-diff__body">
          {result === null ? (
            <EmptyState size="sm" icon="paste" className="wk-diff__placeholder" title="Paste JSON into both sides to compare." />
          ) : !result.ok ? (
            <div className="wk-diff__problem">
              <p className="wk-diff__error">{formatError(result.side, result.error)}</p>
              <Tooltip content={`Select the error in ${LABEL[result.side]}`}>
                <button
                  type="button"
                  className="wk-diff__link"
                  disabled={!fresh}
                  onClick={() => select(result.side, result.error.offset, result.error.offset + 1)}
                >
                  {`Show in ${LABEL[result.side]}`}
                </button>
              </Tooltip>
            </div>
          ) : result.value.changes.length === 0 ? (
            <EmptyState
              size="sm"
              icon="check"
              className="wk-diff__same"
              title={result.value.wholeArrays.length > 0 ? "Only the order of array items differs." : "No differences."}
            />
          ) : (
            <>
              <ul className="wk-diff__changes" aria-label="Changes">
                {result.value.changes.slice(0, LIST_LIMIT).map((change, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      className={`wk-diff__change wk-diff__change--${change.kind}`}
                      aria-label={describeChange(change)}
                      disabled={!fresh}
                      onClick={() => show(change)}
                    >
                      <span className="wk-diff__sign">{SIGN[change.kind]}</span>
                      <code className="wk-diff__path">{formatPath(change.path)}</code>
                      {change.left && <span className="wk-diff__old">{preview(change.left.raw)}</span>}
                      {change.kind === "changed" && <span className="wk-diff__arrow">→</span>}
                      {change.right && <span className="wk-diff__new">{preview(change.right.raw)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {result.value.changes.length > LIST_LIMIT && (
                <p className="wk-diff__more">
                  {`${result.value.changes.length - LIST_LIMIT} more changes are not listed. Copy JSON Patch includes all of them.`}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </EditorShell>
  );
}
