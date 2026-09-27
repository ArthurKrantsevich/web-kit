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
  type SegmentedOption,
  type SelectOption,
} from "@web-kit/ui";
import { parseJson } from "@web-kit/json-core";
import { useId, useMemo, useState, type ReactElement } from "react";
import { fromCsv, type CsvDelimiter } from "../core/csv";
import { describeError, type ConvertOptions, type ConvertTarget } from "./convert";
import { HighlightedOutput } from "./HighlightedOutput";
import { useJsonConvert, type UseJsonConvertOptions } from "./useJsonConvert";

export interface JsonConvertProps extends UseJsonConvertOptions {
  className?: string;
}

type Direction = "json" | "csv";
type JsonTarget = Exclude<ConvertTarget, "csv-to-json">;

const DIRECTIONS: SegmentedOption<Direction>[] = [
  { value: "json", label: "JSON → …", tooltip: "Convert JSON to YAML, CSV, XML or TypeScript" },
  { value: "csv", label: "CSV → JSON", tooltip: "Convert CSV with a header row to JSON" },
];

const FORMATS: SelectOption<JsonTarget>[] = [
  { value: "yaml", label: "YAML", description: "YAML 1.2, block style" },
  { value: "csv", label: "CSV", description: "An array of objects as rows" },
  { value: "xml", label: "XML", description: "Keys become element names" },
  { value: "typescript", label: "TypeScript", description: "Interfaces inferred from the data" },
];

const DELIMITERS: SelectOption<CsvDelimiter>[] = [
  { value: ",", label: "Comma" },
  { value: ";", label: "Semicolon" },
  { value: "\t", label: "Tab" },
];

/** Output format, download name and media type of each target. */
const OUTPUTS: Record<ConvertTarget, { format: string; file: string; mime: string }> = {
  yaml: { format: "YAML", file: "converted.yaml", mime: "application/yaml" },
  csv: { format: "CSV", file: "converted.csv", mime: "text/csv" },
  xml: { format: "XML", file: "converted.xml", mime: "application/xml" },
  typescript: { format: "TypeScript", file: "types.ts", mime: "text/plain" },
  "csv-to-json": { format: "JSON", file: "converted.json", mime: "application/json" },
};

/** Larger files are not read: converting them would freeze the page. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const JSON_SAMPLE =
  '[{"id":1,"name":"Ann","email":"ann@example.com","tags":["admin"],"address":{"city":"Oslo"}},{"id":2,"name":"Bob","email":null,"tags":[],"address":{"city":"Riga"}}]';
const CSV_SAMPLE = "id,name,active,score\n1,Ann,true,4.50\n2,Bob,false,\n";

const encoder = new TextEncoder();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const XML_NOTE = "one-way: XML has no arrays or types, so it cannot be turned back into the same JSON";

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** True when some row of the JSON input has an object or array value, which CSV flattens into columns or a JSON cell. */
function hasNestedValues(input: string): boolean {
  const parsed = parseJson(input);
  if (!parsed.ok || parsed.value.type !== "array") return false;
  return parsed.value.items.some(
    (item) =>
      item.type === "object" && item.members.some((member) => member.value.type === "object" || member.value.type === "array"),
  );
}

/**
 * What the status line says about a successful conversion. Only claims what was done: CSV output is read back with
 * fromCsv here and its size reported; the other targets say what they are, not that they were checked.
 */
function successNote(
  target: ConvertTarget,
  input: string,
  output: string,
  options: ConvertOptions,
): { ok: boolean; note: string } {
  switch (target) {
    case "yaml":
      return { ok: true, note: "YAML 1.2; numbers keep their spelling" };
    case "csv": {
      if (output === "") return { ok: true, note: "the array is empty, so there are no rows" };
      const back = fromCsv(output, { delimiter: options.delimiter });
      if (!back.ok) return { ok: false, note: "the CSV could not be read back; please report this input" };
      const rows = JSON.parse(back.value) as Record<string, unknown>[];
      const columns = rows[0] === undefined ? 0 : Object.keys(rows[0]).length;
      const size = `Reads back as ${count(rows.length, "row")} × ${count(columns, "column")}`;
      return { ok: true, note: hasNestedValues(input) ? `${size} · nested values are flattened` : size };
    }
    case "xml":
      return { ok: true, note: XML_NOTE };
    case "typescript":
      return { ok: true, note: "types inferred from the data" };
    case "csv-to-json":
      return { ok: true, note: count((JSON.parse(output) as unknown[]).length, "row") };
  }
}

/** Ready-made converter UI. Import "@web-kit/json-convert/styles.css" once for the default look. */
export function JsonConvert(props: JsonConvertProps): ReactElement {
  const { input, setInput, target, setTarget, options, setOptions, result } = useJsonConvert(props);
  const [jsonTarget, setJsonTarget] = useState<JsonTarget>(target === "csv-to-json" ? "yaml" : target);
  const [message, setMessage] = useState<string | null>(null);
  const id = useId();
  const direction: Direction = target === "csv-to-json" ? "csv" : "json";
  const output = result?.ok ? result.value : "";
  const outputInfo = OUTPUTS[target];
  const success = useMemo(
    () => (result?.ok ? successNote(target, input, result.value, options) : null),
    [result, target, input, options],
  );
  const inputBytes = useMemo(() => encoder.encode(input).length, [input]);
  const outputBytes = useMemo(() => encoder.encode(output).length, [output]);
  const canSwap = (target === "csv" || target === "csv-to-json") && output !== "";

  function replaceInput(value: string): void {
    setMessage(null);
    setInput(value);
  }

  function chooseDirection(next: Direction): void {
    setTarget(next === "csv" ? "csv-to-json" : jsonTarget);
  }

  function chooseFormat(next: JsonTarget): void {
    setJsonTarget(next);
    setTarget(next);
  }

  /** JSON → CSV becomes CSV → JSON with the CSV as input, and back. */
  function swapDirection(): void {
    if (!canSwap) return;
    replaceInput(output);
    if (target === "csv") setTarget("csv-to-json");
    else chooseFormat("csv");
  }

  const toolbar = (
    <EditorToolbar>
      <Segmented label="Direction" value={direction} options={DIRECTIONS} onChange={chooseDirection} />
      <span className="wk-ui-divider" aria-hidden="true" />
      {direction === "json" && (
        <>
          <span className="wk-ui-field" aria-hidden="true">
            To
          </span>
          <Select label="Convert to" value={jsonTarget} options={FORMATS} onChange={chooseFormat} />
        </>
      )}
      {(target === "csv" || target === "csv-to-json") && (
        <>
          <span className="wk-ui-field" aria-hidden="true">
            Delimiter
          </span>
          <Select
            label="Delimiter"
            value={options.delimiter}
            options={DELIMITERS}
            onChange={(delimiter) => setOptions({ delimiter })}
          />
        </>
      )}
      {target === "csv-to-json" && (
        <label className="wk-ui-switch">
          <input
            type="checkbox"
            role="switch"
            checked={options.inferTypes}
            onChange={(e) => setOptions({ inferTypes: e.target.checked })}
          />
          Detect numbers and booleans
        </label>
      )}
      {target === "xml" && (
        <>
          <span className="wk-ui-field" aria-hidden="true">
            Root element
          </span>
          <input
            className="wk-ui-input wk-convert__name"
            aria-label="Root element"
            value={options.xmlRoot}
            spellCheck={false}
            onChange={(e) => setOptions({ xmlRoot: e.target.value })}
          />
        </>
      )}
      {target === "typescript" && (
        <>
          <span className="wk-ui-field" aria-hidden="true">
            Type name
          </span>
          <input
            className="wk-ui-input wk-convert__name"
            aria-label="Type name"
            value={options.typeName}
            spellCheck={false}
            onChange={(e) => setOptions({ typeName: e.target.value })}
          />
        </>
      )}
      <span className="wk-ui-spacer" />
      <OpenFileButton
        tooltip="Open a .json, .csv or .txt file (up to 10 MB)"
        accept=".json,.csv,.txt,application/json,text/csv,text/plain"
        maxBytes={MAX_FILE_BYTES}
        onText={replaceInput}
        onError={setMessage}
      />
      <Button
        icon="sample"
        tooltip="Replace the input with an example"
        onClick={() => replaceInput(direction === "csv" ? CSV_SAMPLE : JSON_SAMPLE)}
      >
        Sample
      </Button>
      <Button icon="clear" tooltip="Empty the input" onClick={() => replaceInput("")}>
        Clear
      </Button>
    </EditorToolbar>
  );

  const notice = message && <span className="wk-convert__message">{message}</span>;
  /** Shown whenever XML is the target, not only after a conversion. */
  const xmlNote = target === "xml" && (
    <>
      <span aria-hidden="true">·</span>
      <span>{XML_NOTE}</span>
    </>
  );
  const status =
    result === null ? (
      <StatusLine state="idle">
        <span>{direction === "csv" ? "Paste CSV, open a file or load a sample." : "Paste JSON, open a file or load a sample."}</span>
        {xmlNote}
        {notice}
      </StatusLine>
    ) : !result.ok ? (
      <StatusLine state="error">
        <span role="status">{describeError(result.error)}</span>
        {xmlNote}
        {notice}
      </StatusLine>
    ) : (
      <StatusLine state={success?.ok === false ? "error" : "valid"}>
        <span>{success?.ok === false ? "Converted, but not checked" : "Converted"}</span>
        <span aria-hidden="true">·</span>
        <span>{success?.note}</span>
        {notice}
      </StatusLine>
    );

  return (
    <EditorShell className={["wk-convert", props.className].filter(Boolean).join(" ")} toolbar={toolbar} status={status}>
      <EditorPanes>
        <EditorPane
          title="Input"
          labelFor={`${id}-input`}
          meta={`${direction === "csv" ? "CSV" : "JSON"} · ${formatBytes(inputBytes)}`}
          actions={<PasteButton tooltip="Paste from the clipboard" onText={replaceInput} onError={setMessage} />}
        >
          <textarea
            id={`${id}-input`}
            className="wk-ui-area"
            value={input}
            onChange={(e) => replaceInput(e.target.value)}
            spellCheck={false}
            placeholder={direction === "csv" ? "name,age\nAnn,31" : '[{"name": "Ann", "age": 31}]'}
          />
        </EditorPane>
        <EditorPane
          title="Output"
          meta={`${outputInfo.format} · ${formatBytes(outputBytes)}`}
          actions={
            <>
              <Button
                icon="swap"
                tooltip="Make the output the input and convert the other way"
                disabled={!canSwap}
                onClick={swapDirection}
              >
                Swap direction
              </Button>
              <Button
                icon="download"
                tooltip={`Save the output as ${outputInfo.file}`}
                disabled={output === ""}
                onClick={() => downloadText(output, outputInfo.file, outputInfo.mime)}
              >
                Download
              </Button>
              <CopyButton text={output} tooltip="Copy the output to the clipboard" />
            </>
          }
        >
          <HighlightedOutput text={output} target={target} delimiter={options.delimiter} />
        </EditorPane>
      </EditorPanes>
    </EditorShell>
  );
}
