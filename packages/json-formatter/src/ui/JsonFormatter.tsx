import {
  Button,
  CopyButton,
  downloadText,
  EditorPane,
  EditorPanes,
  EditorShell,
  EditorToolbar,
  OpenFileButton,
  PasteButton,
  Segmented,
  Select,
  StatusLine,
  ToolMenu,
  Tooltip,
  useFileDrop,
  type SegmentedOption,
  type SelectOption,
  type Shortcut,
  useHydrated,
} from "@web-kit/ui";
import { useDeferredValue, useId, useMemo, useRef, useState, type ReactElement } from "react";
import { utf8Length } from "@web-kit/json-core";
import { codeFrame, type Indent, type JsonError } from "../core/index";
import { HighlightedJson } from "./HighlightedJson";
import { formatBytes, formatStats } from "./JsonStats";
import { JsonTree } from "./JsonTree";
import {
  PLAIN_TEXT_NOTE,
  useJsonFormatter,
  type JsonFormatterMode,
  type JsonOutputView,
  type UseJsonFormatterOptions,
} from "./useJsonFormatter";

export interface JsonFormatterProps extends UseJsonFormatterOptions {
  className?: string;
}

export function formatJsonError(error: JsonError): string {
  return `Line ${error.line}, column ${error.column}: ${error.message}`;
}

type IndentValue = "2" | "4" | "tab";

function indentToValue(indent: Indent): IndentValue {
  return indent === "\t" ? "tab" : indent === 4 ? "4" : "2";
}

function valueToIndent(value: IndentValue): Indent {
  return value === "tab" ? "\t" : value === "4" ? 4 : 2;
}

const hasBom = (text: string): boolean => text.charCodeAt(0) === 0xfeff;

const MODES: SegmentedOption<JsonFormatterMode>[] = [
  { value: "format", label: "Format", tooltip: "Pretty-print with the chosen indent" },
  { value: "minify", label: "Minify", tooltip: "Remove all whitespace" },
  { value: "escape", label: "Escape", tooltip: "Turn any text into a JSON string literal" },
  { value: "unescape", label: "Unescape", tooltip: "Turn a JSON string literal back into its text" },
];

const VIEWS: SegmentedOption<JsonOutputView>[] = [
  { value: "text", label: "Text", tooltip: "Show the output as highlighted text" },
  { value: "tree", label: "Tree", tooltip: "Browse, search and query the output as a tree" },
];

const INDENTS: SelectOption<IndentValue>[] = [
  { value: "2", label: "2 spaces" },
  { value: "4", label: "4 spaces" },
  { value: "tab", label: "Tab" },
];

/** Larger files and downloads are not read: parsing them would freeze the page. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ACCEPT = ".json,application/json,.txt,text/plain";

const MODE_VALUES: readonly string[] = ["format", "minify", "escape", "unescape"];

const SAMPLE =
  '{"name":"web-kit","version":"1.0.0","tools":[{"id":"json-formatter","stable":true,"size_kb":4.2},{"id":"json-convert","stable":true,"size_kb":5}],"homepage":null}';

/** Shown when a file finishes reading after the user changed the input: the file would overwrite that change. */
const STALE_FILE_MESSAGE = "File not loaded: the input changed while reading";

/** The extension tells whether the downloaded output is JSON. */
function downloadName(mode: JsonFormatterMode, plainText: boolean): string {
  if (mode === "format") return "formatted.json";
  if (mode === "minify") return "minified.json";
  if (mode === "escape") return "escaped.txt";
  return plainText ? "unescaped.txt" : "unescaped.json";
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
    inputBytes,
    pending,
    workerNote,
  } = useJsonFormatter(props);
  const jsonMode = mode === "format" || mode === "minify";
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  // Read-only until hydration: React would replace anything typed earlier with its own state.
  const hydrated = useHydrated();
  const output = result?.ok ? result.value : "";
  const error = result && !result.ok ? result.error : null;
  // Highlighting a large output is slower than typing; let it lag behind the input.
  const highlighted = useDeferredValue(output);
  const shift = hasBom(input) ? 1 : 0;
  // The input when the file being opened started to be read; its text is dropped if the input changed since.
  const inputAtRead = useRef<string | null>(null);
  const fileName = downloadName(mode, note === PLAIN_TEXT_NOTE);
  const drop = useFileDrop({
    accept: ACCEPT,
    maxBytes: MAX_FILE_BYTES,
    onReadStart: () => {
      inputAtRead.current = inputRef.current?.value ?? input;
    },
    onText: openedFile,
    onError: setMessage,
  });
  // What a share link carries and what "Save input in this browser" keeps.
  const shared = useMemo(() => ({ input, mode, indent, sortKeys }), [input, mode, indent, sortKeys]);

  function replaceInput(value: string): void {
    setMessage(null);
    setInput(value);
  }

  function openedFile(text: string): void {
    const current = inputRef.current?.value ?? input;
    if (inputAtRead.current !== null && inputAtRead.current !== current) setMessage(STALE_FILE_MESSAGE);
    else replaceInput(text);
    inputAtRead.current = null;
  }

  /** Selects `start..end`, given as offsets in the text without a BOM, in the input field. */
  function selectInInput(start: number, end: number): void {
    const area = inputRef.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(start + shift, Math.min(end + shift, input.length));
  }

  /** Puts back a shared or saved state. It comes from outside, so every field is checked. */
  function restore(state: Record<string, unknown>): void {
    if (typeof state.input === "string") replaceInput(state.input);
    if (typeof state.mode === "string" && MODE_VALUES.includes(state.mode)) setMode(state.mode as JsonFormatterMode);
    if (state.indent === 2 || state.indent === 4 || state.indent === "\t") setIndent(state.indent);
    if (typeof state.sortKeys === "boolean") setSortKeys(state.sortKeys);
  }

  /** Ctrl/⌘+Shift+F: the checked Fix all, or the only checked fix; otherwise says why nothing changed. */
  function fixAll(): void {
    if (repair) replaceInput(repair.value);
    else if (fixes.length === 1) replaceInput(fixes[0]!.text);
    else if (!error) setMessage("Nothing to fix");
    else setMessage(fixes.length === 0 ? "No checked fix for this error" : "Several fixes are possible; choose one below");
  }

  const shortcuts: Shortcut[] = [
    { keys: "Mod+Enter", label: "Format", run: () => setMode("format") },
    { keys: "Mod+Shift+M", label: "Minify", run: () => setMode("minify") },
    { keys: "Mod+Shift+F", label: "Fix all (or the only checked fix)", run: fixAll },
  ];

  function showError(): void {
    if (!error) return;
    const width = (input.codePointAt(error.offset + shift) ?? 0) > 0xffff ? 2 : 1;
    selectInInput(error.offset, error.offset + width);
  }

  const toolbar = (
    <EditorToolbar>
      <Segmented label="Mode" className="wk-json__modes" value={mode} options={MODES} onChange={setMode} />
      <span className="wk-ui-divider" aria-hidden="true" />
      <span className="wk-ui-field" aria-hidden="true">
        Indent
      </span>
      <Select
        label="Indent"
        value={indentToValue(indent)}
        options={INDENTS}
        disabled={mode === "minify" || mode === "escape"}
        onChange={(value) => setIndent(valueToIndent(value))}
      />
      <label className="wk-ui-switch">
        <input
          type="checkbox"
          role="switch"
          checked={sortKeys}
          disabled={mode === "escape"}
          onChange={(e) => setSortKeys(e.target.checked)}
        />
        Sort keys
      </label>
      <span className="wk-ui-spacer" />
      <OpenFileButton tooltip="Open a .json or .txt file (up to 10 MB), or drop it on the input" drop={drop} />
      <Button icon="sample" tooltip="Replace the input with an example" onClick={() => replaceInput(SAMPLE)}>
        Sample
      </Button>
      <Button icon="clear" tooltip="Empty the input" onClick={() => replaceInput("")}>
        Clear
      </Button>
      <ToolMenu
        toolKey="json-formatter"
        state={shared}
        onRestore={restore}
        urlTargets={[{ label: "Load from URL…", onText: replaceInput }]}
        shortcuts={shortcuts}
        onNotice={setMessage}
        dropHint="Drop the file on the input to open it"
        maxBytes={MAX_FILE_BYTES}
      />
    </EditorToolbar>
  );

  const worker = workerNote && <span className="wk-json__message">{workerNote}</span>;
  const status = pending ? (
    <StatusLine state="idle">
      <span role="status">{pending}</span>
    </StatusLine>
  ) : error ? (
    <StatusLine state="error">
      <span>{`Error at ${error.line}:${error.column}`}</span>
      <span>{formatBytes(inputBytes)}</span>
      {message && <span className="wk-json__message">{message}</span>}
      {worker}
    </StatusLine>
  ) : output === "" ? (
    <StatusLine state="idle">
      {message === null ? (
        <span>Paste JSON, open a file or load a sample.</span>
      ) : (
        <span className="wk-json__message">{message}</span>
      )}
    </StatusLine>
  ) : jsonMode || stats !== null ? (
    <StatusLine state="valid">
      <span>Valid JSON</span>
      {message === null ? (
        <span className="wk-stats">{stats ? formatStats(stats) : formatBytes(inputBytes)}</span>
      ) : (
        <span className="wk-json__message">{message}</span>
      )}
      {worker}
    </StatusLine>
  ) : (
    <StatusLine state="idle">
      {message === null ? (
        <span>{formatBytes(utf8Length(output))}</span>
      ) : (
        <span className="wk-json__message">{message}</span>
      )}
    </StatusLine>
  );

  return (
    <EditorShell className={["wk-json", props.className].filter(Boolean).join(" ")} toolbar={toolbar} status={status}>
      <EditorPanes>
        <EditorPane
          className="wk-json__pane--input"
          title="Input"
          drop={drop}
          labelFor={`${id}-input`}
          meta={<span className="wk-json__size">{formatBytes(inputBytes)}</span>}
          actions={
            <PasteButton tooltip="Paste from the clipboard" onText={replaceInput} onError={setMessage} />
          }
        >
          <textarea
            ref={inputRef}
            id={`${id}-input`}
            className="wk-ui-area"
            readOnly={!hydrated}
            value={input}
            onChange={(e) => replaceInput(e.target.value)}
            spellCheck={false}
            placeholder='{"hello": "world"}'
          />
        </EditorPane>

        <EditorPane
          className="wk-json__pane--output"
          title={<Segmented label="Output view" size="sm" value={view} options={VIEWS} onChange={setView} />}
          actions={
            <>
              <Button
                icon="to-input"
                tooltip="Replace the input with the output"
                aria-label="Use output as input"
                disabled={output === ""}
                onClick={() => replaceInput(output)}
              >
                To input
              </Button>
              <Button
                icon="download"
                tooltip={`Save the output as ${fileName}`}
                disabled={output === ""}
                onClick={() => downloadText(output, fileName, fileName.endsWith(".json") ? "application/json" : "text/plain")}
              >
                Download
              </Button>
              <CopyButton text={output} tooltip="Copy the output to the clipboard" />
            </>
          }
        >
          <div className="wk-json__output">
            {note && (
              <p className="wk-json__note" aria-live="polite">
                {note}
              </p>
            )}
            <div className="wk-json__body">
              {pending ? (
                <p className="wk-json__placeholder">{pending}</p>
              ) : error ? (
                <div className="wk-json__problem">
                  <p className="wk-json__problem-label">{jsonMode ? "Not valid JSON" : "Cannot unescape"}</p>
                  <p role="status" className="wk-json__error">
                    {formatJsonError(error)}
                  </p>
                  <pre className="wk-json__frame" role="region" aria-label="Error location">
                    {codeFrame(input, error)}
                  </pre>
                  <Tooltip content="Select the error in the input">
                    <button type="button" className="wk-json__link" onClick={showError}>
                      Show in input
                    </button>
                  </Tooltip>
                  {fixes.length > 0 && (
                    <div className="wk-json__fixbox">
                      <p className="wk-json__fixes-title">Suggested fixes · each one is checked</p>
                      <ul className="wk-json__fixes" aria-label="Suggested fixes">
                        {fixes.map((fix) => (
                          <li key={fix.rule}>
                            <span>{fix.description}</span>
                            <Button
                              variant="outline"
                              aria-label={`Apply: ${fix.description}`}
                              tooltip="Replace the input with this fix; the result was checked"
                              onClick={() => replaceInput(fix.text)}
                            >
                              Apply
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {repair && (
                    <Button
                      variant="primary"
                      className="wk-json__fix-all"
                      tooltip={`Make all ${repair.changes.length} changes; the result was checked to be valid JSON`}
                      onClick={() => replaceInput(repair.value)}
                    >
                      {`Fix all (${repair.changes.length} changes)`}
                    </Button>
                  )}
                </div>
              ) : view === "text" ? (
                <HighlightedJson text={highlighted} aria-label="Output" />
              ) : tree ? (
                <JsonTree
                  root={tree}
                  source={treeSource}
                  onShowInInput={selectInInput}
                  showInInputDisabled={!treeFresh}
                />
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
          </div>
        </EditorPane>
      </EditorPanes>
    </EditorShell>
  );
}
