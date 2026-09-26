import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";
import { codeFrame, type Indent, type JsonError } from "../core/index";
import { HighlightedJson } from "./HighlightedJson";
import { formatBytes, formatStats } from "./JsonStats";
import { JsonTree } from "./JsonTree";
import { useCopy } from "./useCopy";
import {
  PLAIN_TEXT_NOTE,
  useJsonFormatter,
  type JsonFormatterMode,
  type UseJsonFormatterOptions,
} from "./useJsonFormatter";

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

const MODES: { mode: JsonFormatterMode; label: string }[] = [
  { mode: "format", label: "Format" },
  { mode: "minify", label: "Minify" },
  { mode: "escape", label: "Escape" },
  { mode: "unescape", label: "Unescape" },
];

/** Larger files are not read: parsing them would freeze the page. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const SAMPLE =
  '{"name":"web-kit","version":"1.0.0","tools":[{"id":"json-formatter","stable":true,"size_kb":4.2},{"id":"json-convert","stable":true,"size_kb":5}],"homepage":null}';

const encoder = new TextEncoder();

/** The extension tells whether the downloaded output is JSON. */
function downloadName(mode: JsonFormatterMode, plainText: boolean): string {
  if (mode === "format") return "formatted.json";
  if (mode === "minify") return "minified.json";
  if (mode === "escape") return "escaped.txt";
  return plainText ? "unescaped.txt" : "unescaped.json";
}

function saveFile(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: name.endsWith(".json") ? "application/json" : "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoke once the click has handed the URL to the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const ICONS = {
  open: "M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  sample: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
  clear: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  toInput: "M19 12H5M11 6l-6 6 6 6",
  download: "M12 3v12M7 10l5 5 5-5M4 19h16",
};

function Icon({ path }: { path: string }): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

/** Ready-made JSON formatter UI. Import "@web-kit/json-formatter/styles.css" once for the default look. */
export function JsonFormatter(props: JsonFormatterProps): ReactElement {
  const {
    input,
    setInput,
    indent,
    setIndent,
    mode,
    setMode,
    view,
    setView,
    sortKeys,
    setSortKeys,
    note,
    result,
    fixes,
    repair,
    tree,
    treeSource,
    treeFresh,
    stats,
  } = useJsonFormatter(props);
  const jsonMode = mode === "format" || mode === "minify";
  const [copyLabel, copy] = useCopy();
  const [message, setMessage] = useState<string | null>(null);
  // Known only in the browser: deciding it during the server render would not match the first client render.
  const [canPaste, setCanPaste] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const output = result?.ok ? result.value : "";
  const error = result && !result.ok ? result.error : null;
  // Highlighting a large output is slower than typing; let it lag behind the input.
  const highlighted = useDeferredValue(output);
  const shift = hasBom(input) ? 1 : 0;
  const inputBytes = useMemo(() => encoder.encode(input).length, [input]);
  const outputBytes = useMemo(() => encoder.encode(output).length, [output]);

  useEffect(() => {
    setCanPaste(typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function");
  }, []);

  function replaceInput(value: string): void {
    setMessage(null);
    setInput(value);
  }

  async function openFile(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setMessage("File is larger than 10 MB");
      return;
    }
    try {
      replaceInput(await file.text());
    } catch {
      setMessage("Could not read the file");
    }
  }

  async function paste(): Promise<void> {
    try {
      replaceInput(await navigator.clipboard.readText());
    } catch {
      setMessage("Clipboard access was denied");
    }
  }

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
      <div className="wk-json__bar" role="group" aria-label="Options">
        <div className="wk-json__segments wk-json__modes" role="group" aria-label="Mode">
          {MODES.map((item) => (
            <button
              key={item.mode}
              type="button"
              className="wk-json__segment"
              aria-pressed={mode === item.mode}
              onClick={() => setMode(item.mode)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="wk-json__divider" aria-hidden="true" />
        <label className="wk-json__field" htmlFor={`${id}-indent`}>
          Indent
        </label>
        <select
          id={`${id}-indent`}
          className="wk-json__select"
          value={indentToValue(indent)}
          disabled={mode === "minify" || mode === "escape"}
          onChange={(e) => setIndent(valueToIndent(e.target.value))}
        >
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tab</option>
        </select>
        <label className="wk-json__switch">
          <input
            type="checkbox"
            role="switch"
            checked={sortKeys}
            disabled={mode === "escape"}
            onChange={(e) => setSortKeys(e.target.checked)}
          />
          Sort keys
        </label>
        <span className="wk-json__spacer" />
        <button type="button" className="wk-json__ghost" onClick={() => fileRef.current?.click()}>
          <Icon path={ICONS.open} />
          <span className="wk-json__action-label">Open file</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          className="wk-json__file"
          aria-label="Open file"
          tabIndex={-1}
          accept=".json,application/json,text/plain"
          onChange={(e) => {
            void openFile(e.target.files?.[0]);
            // Let the same file be opened again.
            e.target.value = "";
          }}
        />
        <button type="button" className="wk-json__ghost" onClick={() => replaceInput(SAMPLE)}>
          <Icon path={ICONS.sample} />
          <span className="wk-json__action-label">Sample</span>
        </button>
        <button type="button" className="wk-json__ghost" onClick={() => replaceInput("")}>
          <Icon path={ICONS.clear} />
          <span className="wk-json__action-label">Clear</span>
        </button>
      </div>

      <div className="wk-json__panes">
        <section className="wk-json__pane wk-json__pane--input">
          <div className="wk-json__pane-head">
            <label className="wk-json__pane-title" htmlFor={`${id}-input`}>
              Input
            </label>
            <span className="wk-json__size">{formatBytes(inputBytes)}</span>
            <span className="wk-json__spacer" />
            {canPaste && (
              <button type="button" className="wk-json__ghost" onClick={() => void paste()}>
                Paste
              </button>
            )}
          </div>
          <textarea
            ref={inputRef}
            id={`${id}-input`}
            className="wk-json__area"
            value={input}
            onChange={(e) => replaceInput(e.target.value)}
            spellCheck={false}
            placeholder='{"hello": "world"}'
          />
        </section>

        <section className="wk-json__pane wk-json__pane--output">
          <div className="wk-json__pane-head">
            <div className="wk-json__segments wk-json__segments--small" role="group" aria-label="Output view">
              <button type="button" className="wk-json__segment" aria-pressed={view === "text"} onClick={() => setView("text")}>
                Text
              </button>
              <button type="button" className="wk-json__segment" aria-pressed={view === "tree"} onClick={() => setView("tree")}>
                Tree
              </button>
            </div>
            <span className="wk-json__spacer" />
            <button
              type="button"
              className="wk-json__ghost"
              aria-label="Use output as input"
              disabled={output === ""}
              onClick={() => replaceInput(output)}
            >
              <Icon path={ICONS.toInput} />
              <span className="wk-json__action-label">To input</span>
            </button>
            <button
              type="button"
              className="wk-json__ghost"
              disabled={output === ""}
              onClick={() => saveFile(output, downloadName(mode, note === PLAIN_TEXT_NOTE))}
            >
              <Icon path={ICONS.download} />
              <span className="wk-json__action-label">Download</span>
            </button>
            <button type="button" className="wk-json__primary" disabled={output === ""} onClick={() => void copy(output)}>
              {copyLabel}
            </button>
          </div>
          {note && (
            <p className="wk-json__note" aria-live="polite">
              {note}
            </p>
          )}
          <div className="wk-json__body">
            {error ? (
              <div className="wk-json__problem">
                <p className="wk-json__problem-label">{jsonMode ? "Not valid JSON" : "Cannot unescape"}</p>
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
                  <div className="wk-json__fixbox">
                    <p className="wk-json__fixes-title">Suggested fixes · each one is checked</p>
                    <ul className="wk-json__fixes" aria-label="Suggested fixes">
                      {fixes.map((fix) => (
                        <li key={fix.rule}>
                          <span>{fix.description}</span>
                          <button
                            type="button"
                            className="wk-json__button"
                            aria-label={`Apply: ${fix.description}`}
                            onClick={() => replaceInput(fix.text)}
                          >
                            Apply
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {repair && (
                  <button type="button" className="wk-json__primary wk-json__fix-all" onClick={() => replaceInput(repair.value)}>
                    Fix all ({repair.changes.length} changes)
                  </button>
                )}
              </div>
            ) : view === "text" ? (
              <HighlightedJson text={highlighted} aria-label="Output" />
            ) : tree ? (
              <JsonTree root={tree} source={treeSource} onShowInInput={treeFresh ? selectInInput : undefined} />
            ) : (
              <p className="wk-json__placeholder">
                {!jsonMode
                  ? "The tree is available in Format and Minify modes."
                  : input.trim() === ""
                    ? "Enter JSON to see the tree."
                    : "Updating…"}
              </p>
            )}
          </div>
        </section>
      </div>

      <p className="wk-json__status">
        {error ? (
          <>
            <span className="wk-json__state wk-json__state--error">{`Error at ${error.line}:${error.column}`}</span>
            <span>{formatBytes(inputBytes)}</span>
          </>
        ) : output === "" ? (
          <span>Paste JSON, open a file or load a sample.</span>
        ) : jsonMode ? (
          <>
            <span className="wk-json__state wk-json__state--valid">Valid JSON</span>
            {message === null && <span className="wk-stats">{stats ? formatStats(stats) : formatBytes(inputBytes)}</span>}
          </>
        ) : (
          message === null && <span>{formatBytes(outputBytes)}</span>
        )}
        {message && <span className="wk-json__message">{message}</span>}
      </p>
    </div>
  );
}
