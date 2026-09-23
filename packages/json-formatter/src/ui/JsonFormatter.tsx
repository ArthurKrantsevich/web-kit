import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { codeFrame, type Indent, type JsonError } from "../core/index";
import { useJsonFormatter, type UseJsonFormatterOptions } from "./useJsonFormatter";

export interface JsonFormatterProps extends UseJsonFormatterOptions {
  className?: string;
}

type CopyState = "idle" | "copied" | "failed";

const COPY_LABEL: Record<CopyState, string> = { idle: "Copy", copied: "Copied", failed: "Copy failed" };

export function formatJsonError(error: JsonError): string {
  return `Line ${error.line}, column ${error.column}: ${error.message}`;
}

function indentToValue(indent: Indent): string {
  return indent === "\t" ? "tab" : String(indent);
}

function valueToIndent(value: string): Indent {
  return value === "tab" ? "\t" : value === "4" ? 4 : 2;
}

/** Ready-made JSON formatter UI. Import "@web-kit/json-formatter/styles.css" once for the default look. */
export function JsonFormatter(props: JsonFormatterProps): ReactElement {
  const { input, setInput, indent, setIndent, mode, setMode, result, fixes, repair } = useJsonFormatter(props);
  const [copy, setCopy] = useState<CopyState>("idle");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const output = result?.ok ? result.value : "";
  const error = result && !result.ok ? result.error : null;

  useEffect(() => {
    if (copy === "idle") return;
    const timer = setTimeout(() => setCopy("idle"), 1500);
    return () => clearTimeout(timer);
  }, [copy]);

  async function copyOutput(): Promise<void> {
    try {
      await navigator.clipboard.writeText(output);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  function showError(): void {
    const area = inputRef.current;
    if (!area || !error) return;
    // Error offsets ignore a leading BOM; the textarea still contains it.
    const at = error.offset + (input.charCodeAt(0) === 0xfeff ? 1 : 0);
    area.focus();
    const width = (input.codePointAt(at) ?? 0) > 0xffff ? 2 : 1;
    area.setSelectionRange(at, Math.min(at + width, input.length));
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
        <button type="button" className="wk-json__button wk-json__copy" disabled={output === ""} onClick={copyOutput}>
          {COPY_LABEL[copy]}
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

      <label className="wk-json__label" htmlFor={`${id}-output`}>
        Output
      </label>
      <textarea id={`${id}-output`} className="wk-json__area" value={output} readOnly spellCheck={false} />
    </div>
  );
}
