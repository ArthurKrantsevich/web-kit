import { useId, type ReactElement } from "react";
import type { CsvDelimiter } from "../core/csv";
import { describeError, TARGETS, type ConvertTarget } from "./convert";
import { useCopy } from "./useCopy";
import { useJsonConvert, type UseJsonConvertOptions } from "./useJsonConvert";

export interface JsonConvertProps extends UseJsonConvertOptions {
  className?: string;
}

/** Ready-made converter UI. Import "@web-kit/json-convert/styles.css" once for the default look. */
export function JsonConvert(props: JsonConvertProps): ReactElement {
  const { input, setInput, target, setTarget, options, setOptions, result } = useJsonConvert(props);
  const [copyLabel, copy] = useCopy();
  const id = useId();
  const output = result?.ok ? result.value : "";
  const csv = target === "csv" || target === "csv-to-json";

  return (
    <div className={["wk-convert", props.className].filter(Boolean).join(" ")}>
      <div className="wk-convert__toolbar">
        <label htmlFor={`${id}-target`}>Convert</label>
        <select id={`${id}-target`} value={target} onChange={(e) => setTarget(e.target.value as ConvertTarget)}>
          {TARGETS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {csv && (
          <>
            <label htmlFor={`${id}-delimiter`}>Delimiter</label>
            <select
              id={`${id}-delimiter`}
              value={options.delimiter}
              onChange={(e) => setOptions({ delimiter: e.target.value as CsvDelimiter })}
            >
              <option value=",">Comma</option>
              <option value=";">Semicolon</option>
              <option value={"\t"}>Tab</option>
            </select>
          </>
        )}
        {target === "csv-to-json" && (
          <label className="wk-convert__check">
            <input type="checkbox" checked={options.inferTypes} onChange={(e) => setOptions({ inferTypes: e.target.checked })} />
            Detect numbers and booleans
          </label>
        )}
        {target === "xml" && (
          <>
            <label htmlFor={`${id}-root`}>Root element</label>
            <input id={`${id}-root`} value={options.xmlRoot} onChange={(e) => setOptions({ xmlRoot: e.target.value })} />
          </>
        )}
        {target === "typescript" && (
          <>
            <label htmlFor={`${id}-name`}>Type name</label>
            <input id={`${id}-name`} value={options.typeName} onChange={(e) => setOptions({ typeName: e.target.value })} />
          </>
        )}
        <button type="button" className="wk-convert__copy" disabled={output === ""} onClick={() => copy(output)}>
          {copyLabel}
        </button>
      </div>

      <label className="wk-convert__label" htmlFor={`${id}-input`}>
        Input
      </label>
      <textarea
        id={`${id}-input`}
        className="wk-convert__area"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        placeholder={target === "csv-to-json" ? "name,age\nAnn,31" : '[{"name": "Ann", "age": 31}]'}
      />

      {result && !result.ok && (
        <p role="status" className="wk-convert__error">
          {describeError(result.error)}
        </p>
      )}
      {target === "xml" && (
        <p className="wk-convert__note">JSON → XML is one-way: XML has no arrays or types, so it cannot be turned back into the same JSON.</p>
      )}

      <span className="wk-convert__label">Output</span>
      <pre className="wk-convert__output" aria-label="Output" tabIndex={0}>
        {output}
      </pre>
    </div>
  );
}
