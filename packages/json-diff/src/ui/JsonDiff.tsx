import { formatPath, type JsonError } from "@web-kit/json-core";
import { useId, useRef, type ReactElement } from "react";
import type { JsonChange, JsonSpan } from "../core/types";
import { useCopy } from "./useCopy";
import { useJsonDiff, type UseJsonDiffOptions } from "./useJsonDiff";

export interface JsonDiffProps extends UseJsonDiffOptions {
  className?: string;
}

type Side = "left" | "right";

const SAMPLE_LEFT =
  '{"name":"web-kit","version":"1.0.0","tools":[{"id":1,"name":"formatter"},{"id":2,"name":"convert"}],"stable":true}';
const SAMPLE_RIGHT =
  '{"name":"web-kit","version":"1.1.0","tools":[{"id":1,"name":"formatter"},{"id":2,"name":"convert"},{"id":3,"name":"diff"}],"license":"MIT"}';

const SIGN: Record<JsonChange["kind"], string> = { added: "+", removed: "−", changed: "~" };
const LABEL: Record<Side, string> = { left: "Left", right: "Right" };
const hasBom = (text: string): boolean => text.charCodeAt(0) === 0xfeff;
const encoder = new TextEncoder();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One line, at most 80 characters. */
function preview(raw: string): string {
  const flat = raw.replace(/\s+/g, " ");
  return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
}

function formatError(side: Side, error: JsonError): string {
  return `${LABEL[side]}: Line ${error.line}, column ${error.column}: ${error.message}`;
}

/** Ready-made JSON diff UI. Import "@web-kit/json-diff/styles.css" once for the default look. */
export function JsonDiff(props: JsonDiffProps): ReactElement {
  const state = useJsonDiff(props);
  const { left, right, result, patch, fresh } = state;
  const [copyLabel, copy] = useCopy("Copy JSON Patch");
  const leftRef = useRef<HTMLTextAreaElement>(null);
  const rightRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const refs = { left: leftRef, right: rightRef };
  const text = { left, right };
  const set = { left: state.setLeft, right: state.setRight };

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

  return (
    <div className={["wk-diff", props.className].filter(Boolean).join(" ")}>
      <div className="wk-diff__bar" role="group" aria-label="Options">
        <span className="wk-diff__field" aria-hidden="true">
          Arrays
        </span>
        <div className="wk-diff__segments" role="group" aria-label="Compare arrays">
          <button
            type="button"
            className="wk-diff__segment"
            aria-pressed={state.arrayMode === "index"}
            onClick={() => state.setArrayMode("index")}
          >
            By index
          </button>
          <button
            type="button"
            className="wk-diff__segment"
            aria-pressed={state.arrayMode === "key"}
            onClick={() => state.setArrayMode("key")}
          >
            By key
          </button>
        </div>
        {state.arrayMode === "key" && (
          <input
            className="wk-diff__key"
            aria-label="Array key"
            value={state.arrayKey}
            spellCheck={false}
            onChange={(e) => state.setArrayKey(e.target.value)}
          />
        )}
        <span className="wk-diff__divider" aria-hidden="true" />
        <span className="wk-diff__field" aria-hidden="true">
          Numbers
        </span>
        <div className="wk-diff__segments" role="group" aria-label="Compare numbers">
          <button
            type="button"
            className="wk-diff__segment"
            aria-pressed={state.numbers === "value"}
            onClick={() => state.setNumbers("value")}
          >
            By value
          </button>
          <button
            type="button"
            className="wk-diff__segment"
            aria-pressed={state.numbers === "raw"}
            onClick={() => state.setNumbers("raw")}
          >
            As written
          </button>
        </div>
        <span className="wk-diff__spacer" />
        <button
          type="button"
          className="wk-diff__ghost"
          onClick={() => {
            state.setLeft(right);
            state.setRight(left);
          }}
        >
          Swap
        </button>
        <button
          type="button"
          className="wk-diff__ghost"
          onClick={() => {
            state.setLeft(SAMPLE_LEFT);
            state.setRight(SAMPLE_RIGHT);
          }}
        >
          Sample
        </button>
        <button
          type="button"
          className="wk-diff__ghost"
          onClick={() => {
            state.setLeft("");
            state.setRight("");
          }}
        >
          Clear
        </button>
      </div>

      <div className="wk-diff__panes">
        {(["left", "right"] as const).map((side) => (
          <section key={side} className={`wk-diff__pane wk-diff__pane--${side}`}>
            <div className="wk-diff__pane-head">
              <label className="wk-diff__pane-title" htmlFor={`${id}-${side}`}>
                {LABEL[side]}
              </label>
              <span className="wk-diff__size">{formatBytes(encoder.encode(text[side]).length)}</span>
            </div>
            <textarea
              ref={refs[side]}
              id={`${id}-${side}`}
              className="wk-diff__area"
              value={text[side]}
              onChange={(e) => set[side](e.target.value)}
              spellCheck={false}
              placeholder='{"hello": "world"}'
            />
          </section>
        ))}
      </div>

      <section className="wk-diff__result" aria-label="Differences">
        <div className="wk-diff__result-head">
          <span className="wk-diff__result-title">Changes</span>
          {diff && (
            <span className="wk-diff__summary">
              <span className="wk-diff__count wk-diff__count--added">{`+${diff.counts.added}`}</span>
              <span className="wk-diff__count wk-diff__count--removed">{`−${diff.counts.removed}`}</span>
              <span className="wk-diff__count wk-diff__count--changed">{`~${diff.counts.changed}`}</span>
            </span>
          )}
          <span className="wk-diff__spacer" />
          <button type="button" className="wk-diff__primary" disabled={patch === ""} onClick={() => void copy(patch)}>
            {copyLabel}
          </button>
        </div>
        <div className="wk-diff__body">
          {result === null ? (
            <p className="wk-diff__placeholder">Paste JSON into both sides to compare.</p>
          ) : !result.ok ? (
            <div className="wk-diff__problem">
              <p role="status" className="wk-diff__error">
                {formatError(result.side, result.error)}
              </p>
              <button
                type="button"
                className="wk-diff__link"
                disabled={!fresh}
                onClick={() => select(result.side, result.error.offset, result.error.offset + 1)}
              >
                {`Show in ${LABEL[result.side]}`}
              </button>
            </div>
          ) : result.value.changes.length === 0 ? (
            <p className="wk-diff__same">
              {result.value.wholeArrays.length > 0 ? "Only the order of array items differs." : "No differences."}
            </p>
          ) : (
            <ul className="wk-diff__changes" aria-label="Changes">
              {result.value.changes.map((change, index) => (
                <li key={index}>
                  <button
                    type="button"
                    className={`wk-diff__change wk-diff__change--${change.kind}`}
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
          )}
        </div>
      </section>
    </div>
  );
}
