import { formatPath, type JsonError } from "@web-kit/json-core";
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
  StatusLine,
  ToolMenu,
  Tooltip,
  useFileDrop,
  type Shortcut,
  type StatusState,
} from "@web-kit/ui";
import { useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
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

/** Larger files and downloads are not read: checking them would freeze the page. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ACCEPT = ".json,application/json,.txt,text/plain";

const LABEL: Record<Input, string> = { data: "Data", schema: "Schema" };
const hasBom = (text: string): boolean => text.charCodeAt(0) === 0xfeff;
const encoder = new TextEncoder();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const count = (n: number, word: string): string => `${n} ${n === 1 ? word : `${word}s`}`;

/**
 * The warning templates of the core, with the quoted name in group 2. Only these get <code>: other messages can hold
 * user text with backticks of its own (a $ref value, a pattern), which must stay as written.
 */
const QUOTED_NAME = /^(keyword|format) `(.*)` is not checked(: only draft 2020-12 is supported)?$/s;

/** A warning with its keyword or format name as <code>; any other message as plain text. */
function richMessage(message: string): ReactNode {
  const match = QUOTED_NAME.exec(message);
  if (!match) return message;
  return (
    <>
      {`${match[1]} `}
      <code>{match[2]}</code>
      {` is not checked${match[3] ?? ""}`}
    </>
  );
}

function parseErrorText(input: Input, error: JsonError): string {
  return `${LABEL[input]}: Line ${error.line}, column ${error.column}: ${error.message}`;
}

function stateOf(result: SchemaResult): StatusState {
  if (!result.ok || !result.valid) return "error";
  return result.warnings.length > 0 ? "warning" : "valid";
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

  const files = { accept: ACCEPT, maxBytes: MAX_FILE_BYTES, onError: setNotice };
  const dataDrop = useFileDrop({ ...files, label: "Open file into Data", onText: set.data });
  const schemaDrop = useFileDrop({ ...files, label: "Open file into Schema", onText: set.schema });
  const drops = { data: dataDrop, schema: schemaDrop };
  // What a share link carries and what "Save input in this browser" keeps.
  const shared = useMemo(() => ({ data, schema }), [data, schema]);

  /** Puts back a shared or saved state. It comes from outside, so every field is checked. */
  function restore(value: Record<string, unknown>): void {
    if (typeof value.data === "string") set.data(value.data);
    if (typeof value.schema === "string") set.schema(value.schema);
  }

  const shortcuts: Shortcut[] = [
    {
      keys: "Mod+Enter",
      label: "Generate schema from data",
      run: () => (data.trim() === "" ? setNotice("Paste the JSON data first; the schema is generated from it.") : generate()),
    },
  ];

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
  // Read out after each check. The element is always there, so the first result (a parse error too) is announced.
  const parseErrors = result && !result.ok && result.stage === "parse" ? result.parseErrors : [];
  const announcement =
    result === null
      ? ""
      : parseErrors.length > 0
        ? parseErrors.map(({ input, error }) => parseErrorText(input, error)).join(" ")
        : summarizeSchemaResult(result);
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
                  <span className="wk-schema__message">{richMessage(row.message)}</span>
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

  const toolbar = (
    <EditorToolbar>
      <Button
        variant="outline"
        icon="generate"
        tooltip="Replace the schema with one inferred from the data"
        disabled={data.trim() === ""}
        onClick={generate}
      >
        Generate schema from data
      </Button>
      <span className="wk-ui-spacer" />
      <Button
        icon="sample"
        tooltip="Replace data and schema with an example"
        onClick={() => {
          set.data(SAMPLE_DATA);
          set.schema(SAMPLE_SCHEMA);
        }}
      >
        Sample
      </Button>
      <Button
        icon="clear"
        tooltip="Empty data and schema"
        onClick={() => {
          set.data("");
          set.schema("");
        }}
      >
        Clear
      </Button>
      <ToolMenu
        toolKey="json-schema-validator"
        state={shared}
        onRestore={restore}
        urlTargets={[
          { label: "Load Data from URL…", onText: set.data },
          { label: "Load Schema from URL…", onText: set.schema },
        ]}
        shortcuts={shortcuts}
        onNotice={setNotice}
        maxBytes={MAX_FILE_BYTES}
      />
    </EditorToolbar>
  );

  const status = (
    <StatusLine state={result ? stateOf(result) : "idle"}>
      <span>{result ? summarizeSchemaResult(result) : "Nothing to check yet."}</span>
      {notice && <span className="wk-schema__notice">{notice}</span>}
      {/* In the status line, next to "Schema generated from the data.": the toolbar and the Schema header have no
          room left at 390 px, and nothing in them may move when it appears. */}
      {state.previousSchema !== null && (
        <Button
          icon="undo"
          className="wk-schema__undo"
          tooltip="Bring back the schema you had before generating"
          aria-label="Undo generate"
          onClick={() => {
            setNotice("");
            state.undoGenerate();
          }}
        >
          Undo
        </Button>
      )}
    </StatusLine>
  );

  return (
    <EditorShell className={["wk-schema", props.className].filter(Boolean).join(" ")} toolbar={toolbar} status={status}>
      <EditorPanes>
        {(["data", "schema"] as const).map((input) => (
          <EditorPane
            key={input}
            className={`wk-schema__pane--${input}`}
            title={LABEL[input]}
            labelFor={`${id}-${input}`}
            meta={formatBytes(encoder.encode(text[input]).length)}
            drop={drops[input]}
            dropLabel={`Drop the file to open it in ${LABEL[input]}`}
            actions={
              <>
                {/* Paste comes before Open file: it appears after hydration, and nothing to its right may move. */}
                <PasteButton
                  label={`Paste into ${LABEL[input]}`}
                  tooltip={`Paste from the clipboard into ${LABEL[input]}`}
                  iconOnly
                  onText={set[input]}
                  onError={setNotice}
                />
                <OpenFileButton
                  label={`Open file into ${LABEL[input]}`}
                  tooltip={`Open a .json or .txt file into ${LABEL[input]} (up to 10 MB), or drop it on ${LABEL[input]}`}
                  iconOnly
                  drop={drops[input]}
                />
                {input === "schema" && (
                  <>
                    <Button
                      icon="download"
                      iconOnly
                      tooltip="Save the schema as schema.json"
                      disabled={schema === ""}
                      onClick={() => downloadText(schema, "schema.json", "application/schema+json")}
                    >
                      Download
                    </Button>
                    <CopyButton text={schema} tooltip="Copy the schema to the clipboard" />
                  </>
                )}
              </>
            }
          >
            <textarea
              ref={refs[input]}
              id={`${id}-${input}`}
              className="wk-ui-area"
              value={text[input]}
              onChange={(e) => set[input](e.target.value)}
              spellCheck={false}
              placeholder={input === "data" ? '{"name": "web-kit"}' : '{"type": "object"}'}
            />
          </EditorPane>
        ))}
      </EditorPanes>

      <section className="wk-schema__result" aria-label="Results">
        <div className="wk-ui-pane__head wk-schema__result-head">
          <span className="wk-ui-pane__title">Results</span>
          {result?.ok && (
            <span className="wk-schema__counts">
              <span className="wk-schema__count wk-schema__count--error">{count(errors.length, "error")}</span>
              <span className="wk-schema__count wk-schema__count--warning">{count(warnings.length, "warning")}</span>
            </span>
          )}
        </div>
        <p role="status" aria-live="polite" className="wk-ui-sr-only">
          {announcement}
        </p>
        <div className="wk-schema__body">
          {result === null ? (
            <p className="wk-schema__placeholder">{placeholder(data, schema)}</p>
          ) : !result.ok && result.stage === "parse" ? (
            <div className="wk-schema__problem">
              {result.parseErrors.map(({ input, error }) => (
                <p key={input} className="wk-schema__error">
                  {parseErrorText(input, error)}
                </p>
              ))}
              {result.parseErrors.map(({ input, error }) => (
                <Tooltip key={input} content={`Select the error in ${LABEL[input]}`}>
                  <button
                    type="button"
                    className="wk-schema__link"
                    disabled={!fresh}
                    onClick={() => select(input, { offset: error.offset, end: error.offset + 1 })}
                  >
                    {`Show in ${LABEL[input]}`}
                  </button>
                </Tooltip>
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
    </EditorShell>
  );
}
