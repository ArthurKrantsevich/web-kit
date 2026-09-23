import { useId, useRef, type ReactElement } from "react";
import { codeFrame, type Indent, type JsonError } from "../core/index";
import { HighlightedJson } from "./HighlightedJson";
import { JsonStats } from "./JsonStats";
import { JsonTree } from "./JsonTree";
import { useCopy } from "./useCopy";
import { useJsonFormatter, type UseJsonFormatterOptions } from "./useJsonFormatter";

export interface JsonFormatterProps extends UseJsonFormatterOptions {
  className?: string;
}

export function formatJsonError(error: JsonError): string {
  return `Line ${error.line}, column ${error.column}: ${error.message}`;
}

function indentToValue(indent: Indent): string {
  return indent === "\t" ? "tab" : String(indent);
}

function valueToIndent(value: string): Indent {
  return value === "tab" ? "\t" : value === "4" ? 4 : 2;
}

const hasBom = (text: string): boolean => text.charCodeAt(0) === 0xfeff;

/** Ready-made JSON formatter UI. Import "@web-kit/json-formatter/styles.css" once for the default look. */
export function JsonFormatter(props: JsonFormatterProps): ReactElement {
  const { input, setInput, indent, setIndent, mode, setMode, view, setView, result, fixes, repair, tree, stats } =
    useJsonFormatter(props);
  const [copyLabel, copy] = useCopy();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const output = result?.ok ? result.value : "";
  const error = result && !result.ok ? result.error : null;
  const shift = hasBom(input) ? 1 : 0;

  /** Selects `start..end`, given as offsets in the text without a BOM, in the input field. */
  function selectInInput(start: number, end: number): void {
    const area = inputRef.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(start + shift, Math.min(end + shift, input.length));
  }

  function showError(): void {
    if (!error) return;
    const width = (input.codePointAt(error.offset + shift) ?? 0) > 0xffff ? 2 : 1;
    selectInInput(error.offset, error.offset + width);
  }

  return (
    <div className={["wk-json", props.className].filter(Boolean).join(" ")}>
      <label className="wk-json__label" htmlFor={`${id}-input`}>
        Input
      </label>
      <textarea
        ref={inputRef}
        id={`${id}-input`}
        className="wk-json__area"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        placeholder='{"hello": "world"}'
      />

      <div className="wk-json__toolbar" role="group" aria-label="Options">
        <button type="button" className="wk-json__button" aria-pressed={mode === "format"} onClick={() => setMode("format")}>
          Format
        </button>
        <button type="button" className="wk-json__button" aria-pressed={mode === "minify"} onClick={() => setMode("minify")}>
          Minify
        </button>
        <label className="wk-json__indent" htmlFor={`${id}-indent`}>
          Indent
        </label>
        <select
          id={`${id}-indent`}
          className="wk-json__select"
          value={indentToValue(indent)}
          disabled={mode === "minify"}
          onChange={(e) => setIndent(valueToIndent(e.target.value))}
        >
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tab</option>
        </select>
        <button type="button" className="wk-json__button wk-json__copy" disabled={output === ""} onClick={() => copy(output)}>
          {copyLabel}
        </button>
      </div>

      {error && (
        <div className="wk-json__problem">
          <p role="status" className="wk-json__error">
            {formatJsonError(error)}
          </p>
          <pre className="wk-json__frame" role="region" aria-label="Error location">
            {codeFrame(input, error)}
          </pre>
          <button type="button" className="wk-json__link" onClick={showError}>
            Show in input
          </button>
          {fixes.length > 0 && (
            <ul className="wk-json__fixes" aria-label="Suggested fixes">
              {fixes.map((fix) => (
                <li key={fix.rule}>
                  <span>{fix.description}</span>
                  <button
                    type="button"
                    className="wk-json__button"
                    aria-label={`Apply: ${fix.description}`}
                    onClick={() => setInput(fix.text)}
                  >
                    Apply
                  </button>
                </li>
              ))}
            </ul>
          )}
          {repair && (
            <button type="button" className="wk-json__button wk-json__fix-all" onClick={() => setInput(repair.value)}>
              Fix all ({repair.changes.length} changes)
            </button>
          )}
        </div>
      )}

      <div className="wk-json__output-head">
        <span className="wk-json__label">Output</span>
        <div className="wk-json__views" role="group" aria-label="Output view">
          <button type="button" className="wk-json__button" aria-pressed={view === "text"} onClick={() => setView("text")}>
            Text
          </button>
          <button type="button" className="wk-json__button" aria-pressed={view === "tree"} onClick={() => setView("tree")}>
            Tree
          </button>
        </div>
      </div>
      {view === "text" ? (
        <HighlightedJson text={output} aria-label="Output" />
      ) : tree ? (
        <JsonTree root={tree} source={shift ? input.slice(1) : input} onShowInInput={selectInInput} />
      ) : (
        <p className="wk-json__placeholder">
          {error ? "Fix the error to see the tree." : input.trim() === "" ? "Enter JSON to see the tree." : "Updating…"}
        </p>
      )}
      {stats && <JsonStats stats={stats} />}
    </div>
  );
}
