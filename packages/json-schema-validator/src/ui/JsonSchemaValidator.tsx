import { formatPath } from "@web-kit/json-core";
import { useId, useRef, useState, type ReactElement } from "react";
import type { SchemaResult, TextRange } from "../core/types";
import { summarizeSchemaResult } from "../core/validate";
import { useJsonSchemaValidator, type UseJsonSchemaValidatorOptions } from "./useJsonSchemaValidator";

export interface JsonSchemaValidatorProps extends UseJsonSchemaValidatorOptions {
  className?: string;
}

type Input = "data" | "schema";

interface Row {
  input: Input;
  range: TextRange;
  path: string;
  message: string;
  /** The schema path of a data error. */
  where?: string;
}

const SAMPLE_DATA = `{
  "name": "web-kit",
  "version": "1.1",
  "homepage": "not a link",
  "stars": -3,
  "tags": ["json", "schema", "json"]
}`;

const SAMPLE_SCHEMA = String.raw`{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "homepage": { "type": "string", "format": "uri" },
    "stars": { "type": "integer", "minimum": 0 },
    "tags": { "type": "array", "items": { "type": "string" }, "uniqueItems": true }
  },
  "required": ["name", "version", "license"]
}`;

/** Rows beyond this are not rendered: a huge list would freeze the page. */
const LIST_LIMIT = 1000;

const LABEL: Record<Input, string> = { data: "Data", schema: "Schema" };
const hasBom = (text: string): boolean => text.charCodeAt(0) === 0xfeff;
const encoder = new TextEncoder();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const count = (n: number, word: string): string => `${n} ${n === 1 ? word : `${word}s`}`;

function stateOf(result: SchemaResult): "valid" | "partial" | "error" {
  if (!result.ok || !result.valid) return "error";
  return result.warnings.length > 0 ? "partial" : "valid";
}

function placeholder(data: string, schema: string): string {
  if (data.trim() === "" && schema.trim() === "") return "Paste JSON data and a schema, or load a sample.";
  return data.trim() === "" ? "Paste the JSON data to check." : "Paste a schema, or generate one from the data.";
}

/** Ready-made JSON Schema validator. Import "@web-kit/json-schema-validator/styles.css" once for the default look. */
export function JsonSchemaValidator(props: JsonSchemaValidatorProps): ReactElement {
  const state = useJsonSchemaValidator(props);
  const { data, schema, result, fresh } = state;
  const [notice, setNotice] = useState("");
  const dataRef = useRef<HTMLTextAreaElement>(null);
  const schemaRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const refs = { data: dataRef, schema: schemaRef };
  const text = { data, schema };
  const set = {
    data: (value: string) => {
      setNotice("");
      state.setData(value);
    },
    schema: (value: string) => {
      setNotice("");
      state.setSchema(value);
    },
  };

  /** Selects a range (offsets without a BOM) in one of the inputs. */
  function select(input: Input, range: { offset: number; end: number }): void {
    const area = refs[input].current;
    if (!area) return;
    const shift = hasBom(text[input]) ? 1 : 0;
    area.focus();
    area.setSelectionRange(range.offset + shift, Math.min(range.end + shift, text[input].length));
  }

  function generate(): void {
    const inferred = state.generate();
    setNotice(
      inferred.ok
        ? "Schema generated from the data."
        : `Could not generate a schema: Data line ${inferred.error.line}, column ${inferred.error.column}: ${inferred.error.message}`,
    );
  }

  const errors = result?.ok ? result.errors : [];
  const warnings = result && (result.ok || result.stage === "schema") ? result.warnings : [];

  /** One clickable list; `noun` names it ("error" → "Errors") and its "more" line. */
  function rows<T>(items: T[], noun: string, kind: "error" | "warning", render: (item: T) => Row): ReactElement {
    return (
      <>
        <ul className={`wk-schema__list wk-schema__list--${kind}`} aria-label={`${noun[0]!.toUpperCase()}${noun.slice(1)}s`}>
          {items.slice(0, LIST_LIMIT).map((item, index) => {
            const row = render(item);
            return (
              <li key={index}>
                <button type="button" className="wk-schema__row" disabled={!fresh} onClick={() => select(row.input, row.range)}>
                  <code className="wk-schema__path">{row.path}</code>
                  <span className="wk-schema__message">{row.message}</span>
                  {row.where && <span className="wk-schema__where">{row.where}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {items.length > LIST_LIMIT && <p className="wk-schema__more">{`${items.length - LIST_LIMIT} more ${noun}s are not listed.`}</p>}
      </>
    );
  }

  return (
    <div className={["wk-schema", props.className].filter(Boolean).join(" ")}>
      <div className="wk-schema__bar" role="group" aria-label="Options">
        <button type="button" className="wk-schema__ghost" disabled={data.trim() === ""} onClick={generate}>
          Generate schema from data
        </button>
        <span className="wk-schema__spacer" />
        <button
          type="button"
          className="wk-schema__ghost"
          onClick={() => {
            set.data(SAMPLE_DATA);
            set.schema(SAMPLE_SCHEMA);
          }}
        >
          Sample
        </button>
        <button
          type="button"
          className="wk-schema__ghost"
          onClick={() => {
            set.data("");
            set.schema("");
          }}
        >
          Clear
        </button>
      </div>

      <div className="wk-schema__panes">
        {(["data", "schema"] as const).map((input) => (
          <section key={input} className={`wk-schema__pane wk-schema__pane--${input}`}>
            <div className="wk-schema__pane-head">
              <label className="wk-schema__pane-title" htmlFor={`${id}-${input}`}>
                {LABEL[input]}
              </label>
              <span className="wk-schema__size">{formatBytes(encoder.encode(text[input]).length)}</span>
              {input === "schema" && state.previousSchema !== null && (
                <button
                  type="button"
                  className="wk-schema__ghost wk-schema__undo"
                  aria-label="Undo generate"
                  onClick={() => {
                    setNotice("");
                    state.undoGenerate();
                  }}
                >
                  Undo
                </button>
              )}
            </div>
            <textarea
              ref={refs[input]}
              id={`${id}-${input}`}
              className="wk-schema__area"
              value={text[input]}
              onChange={(e) => set[input](e.target.value)}
              spellCheck={false}
              placeholder={input === "data" ? '{"name": "web-kit"}' : '{"type": "object"}'}
            />
          </section>
        ))}
      </div>

      <section className="wk-schema__result" aria-label="Results">
        <div className="wk-schema__result-head">
          <span className="wk-schema__result-title">Results</span>
          {result?.ok && (
            <span className="wk-schema__counts">
              <span className="wk-schema__count wk-schema__count--error">{count(errors.length, "error")}</span>
              <span className="wk-schema__count wk-schema__count--warning">{count(warnings.length, "warning")}</span>
            </span>
          )}
        </div>
        <div className="wk-schema__body">
          {result === null ? (
            <p className="wk-schema__placeholder">{placeholder(data, schema)}</p>
          ) : !result.ok && result.stage === "parse" ? (
            <div className="wk-schema__problem">
              <div role="status">
                {result.parseErrors.map(({ input, error }) => (
                  <p key={input} className="wk-schema__error">
                    {`${LABEL[input]}: Line ${error.line}, column ${error.column}: ${error.message}`}
                  </p>
                ))}
              </div>
              {result.parseErrors.map(({ input, error }) => (
                <button
                  key={input}
                  type="button"
                  className="wk-schema__link"
                  disabled={!fresh}
                  onClick={() => select(input, { offset: error.offset, end: error.offset + 1 })}
                >
                  {`Show in ${LABEL[input]}`}
                </button>
              ))}
            </div>
          ) : (
            <>
              {!result.ok &&
                rows(result.problems, "schema error", "error", (problem) => ({
                  input: "schema",
                  range: problem.schema,
                  path: problem.schemaPath,
                  message: problem.message,
                }))}
              {result.ok && errors.length > 0 &&
                rows(errors, "error", "error", (error) => ({
                  input: "data",
                  range: error.data,
                  path: formatPath(error.dataPath),
                  message: error.message,
                  where: error.schemaPath,
                }))}
              {result.ok && errors.length === 0 && (
                <p className="wk-schema__same">
                  {warnings.length === 0
                    ? "The data matches the schema."
                    : "No errors found, but the keywords below were not checked."}
                </p>
              )}
              {warnings.length > 0 &&
                rows(warnings, "warning", "warning", (warning) => ({
                  input: "schema",
                  range: warning.schema,
                  path: warning.schemaPath,
                  message: warning.message,
                }))}
            </>
          )}
        </div>
      </section>

      <p className="wk-schema__status">
        {result ? (
          <span className={`wk-schema__state wk-schema__state--${stateOf(result)}`}>{summarizeSchemaResult(result)}</span>
        ) : (
          <span>Nothing to check yet.</span>
        )}
        {notice && <span className="wk-schema__notice">{notice}</span>}
      </p>
    </div>
  );
}
