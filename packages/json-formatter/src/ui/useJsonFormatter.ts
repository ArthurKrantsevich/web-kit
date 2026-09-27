import {
  escapeJson,
  getStats,
  parseJson,
  printJson,
  stripBom,
  unescapeJson,
  utf8Length,
  type JsonJob,
  type JsonNode,
  type JsonStats,
} from "@web-kit/json-core";
import { useDeferredValue, useMemo, useState } from "react";
import { formatJson, minifyJson, repairJson, suggestFixes, type Indent, type JsonFix, type Result } from "../core/index";
import { formatBytes } from "./JsonStats";
import { useJsonJob } from "./useJsonJob";

/** Above this size "Fix all" is not computed, to keep typing fast. Single fixes are still offered. */
const REPAIR_INPUT_LIMIT = 10_000;

/** Format and Minify of a larger input (UTF-8 bytes) run in a worker, so typing and scrolling stay smooth. */
export const WORKER_THRESHOLD: number = 1024 * 1024;

/** Shown when no worker could start and a large input is processed on the page. */
export const WORKER_FALLBACK_NOTE: string =
  "The background worker could not start, so large inputs are processed on the page and may freeze it.";

export type JsonFormatterMode = "format" | "minify" | "escape" | "unescape";

export type JsonOutputView = "text" | "tree";

export interface UseJsonFormatterOptions {
  initialInput?: string;
  initialIndent?: Indent;
}

export interface UseJsonFormatter {
  input: string;
  setInput: (value: string) => void;
  indent: Indent;
  setIndent: (value: Indent) => void;
  mode: JsonFormatterMode;
  setMode: (value: JsonFormatterMode) => void;
  /** null while the input is blank, and while a worker job for it runs (see `pending`). */
  result: Result<string> | null;
  /** Verified one-step fixes for the current error. */
  fixes: JsonFix[];
  /** Verified full repair; only when it needs 2+ changes and ends in valid JSON. */
  repair: { value: string; changes: string[] } | null;
  view: JsonOutputView;
  setView: (value: JsonOutputView) => void;
  /** Sort object keys (Format and Minify). */
  sortKeys: boolean;
  setSortKeys: (value: boolean) => void;
  /** A short explanation of how the output was produced (Unescape), or null. */
  note: string | null;
  /** AST of the input while it is valid. While a new parse is pending, the previous tree is kept. */
  tree: JsonNode | null;
  /** Text the tree was parsed from (without BOM); may lag the input while `treeFresh` is false. */
  treeSource: string;
  /** True when `tree` matches the current input, so its offsets can be used to select text in the input. */
  treeFresh: boolean;
  /** Facts about the valid JSON: the input in Format and Minify, the unescaped text when Unescape finds JSON. */
  stats: JsonStats | null;
  /** UTF-8 size of the input. */
  inputBytes: number;
  /** "Formatting 5.2 MB…" while a worker job runs; null otherwise. */
  pending: string | null;
  /** WORKER_FALLBACK_NOTE when large inputs run on the page, or a worker failure; null otherwise. */
  workerNote: string | null;
}

/** Unescape's note when the decoded string is not JSON; the UI uses it to name downloads. */
export const PLAIN_TEXT_NOTE = "The string is not JSON; shown as plain text.";

const NOTHING = { result: null, note: null } as const;

/** Headless state for a JSON formatter: bring your own markup. */
export function useJsonFormatter(options: UseJsonFormatterOptions = {}): UseJsonFormatter {
  const [input, setInput] = useState(options.initialInput ?? "");
  const [indent, setIndent] = useState<Indent>(options.initialIndent ?? 2);
  const [mode, setMode] = useState<JsonFormatterMode>("format");
  const [view, setView] = useState<JsonOutputView>("text");
  const [sortKeys, setSortKeys] = useState(false);
  const jsonMode = mode === "format" || mode === "minify";
  const inputBytes = useMemo(() => utf8Length(input), [input]);
  const large = jsonMode && inputBytes > WORKER_THRESHOLD;

  // Format and Minify of a large input go to the worker; everything below is skipped for it.
  const job = useMemo(
    (): JsonJob | null => (large ? { input, mode: mode === "minify" ? "minify" : "format", indent, sortKeys } : null),
    [large, input, mode, indent, sortKeys],
  );
  const background = useJsonJob(job);

  const { result, note, unescapedStats } = useMemo((): {
    result: Result<string> | null;
    note: string | null;
    unescapedStats?: JsonStats;
  } => {
    if (large) return NOTHING;
    if (mode === "escape") {
      // Whitespace is content here; a leading BOM is not.
      return input === "" ? NOTHING : { result: { ok: true, value: escapeJson(stripBom(input)) }, note: null };
    }
    if (input.trim() === "") return NOTHING;
    if (mode === "unescape") {
      const unescaped = unescapeJson(input);
      if (!unescaped.ok) return { result: unescaped, note: null };
      const { text, isJson, wrapped } = unescaped.value;
      if (!isJson) return { result: { ok: true, value: text }, note: PLAIN_TEXT_NOTE };
      const inner = parseJson(text);
      if (!inner.ok) return { result: inner, note: null };
      const note = wrapped
        ? "No surrounding quotes: read the input as the inside of a JSON string."
        : inner.value.type === "string"
          ? "The value is itself a JSON string; unescape it again to go one level deeper."
          : "The string contains JSON; shown formatted.";
      return {
        result: { ok: true, value: printJson(inner.value, { indent, sortKeys }) },
        note,
        unescapedStats: getStats(inner.value, text),
      };
    }
    if (!sortKeys) return { result: mode === "format" ? formatJson(input, { indent }) : minifyJson(input), note: null };
    const parsed = parseJson(input);
    if (!parsed.ok) return { result: parsed, note: null };
    const printed = printJson(parsed.value, mode === "format" ? { indent, sortKeys: true } : { minify: true, sortKeys: true });
    return { result: { ok: true, value: printed }, note: null };
  }, [large, input, indent, mode, sortKeys]);

  // Fix suggestions are slower than formatting, so they follow the input at low priority.
  const deferredInput = useDeferredValue(input);
  // Fixes only make sense for JSON input (Format and Minify).
  const hasError = jsonMode && !large && result !== null && !result.ok;

  const deferredFixes = useMemo(() => (hasError ? suggestFixes(deferredInput) : []), [hasError, deferredInput]);

  const deferredRepair = useMemo(() => {
    if (!hasError || deferredInput.length > REPAIR_INPUT_LIMIT) return null;
    const repaired = repairJson(deferredInput);
    return repaired.ok && repaired.changes.length > 1 ? { value: repaired.value, changes: repaired.changes } : null;
  }, [hasError, deferredInput]);

  // Never show suggestions computed for older text: applying one would drop what was typed since.
  const fresh = deferredInput === input;
  const fixes = fresh ? deferredFixes : [];
  const repair = fresh ? deferredRepair : null;

  const deferredAst = useMemo(() => {
    // A large input is parsed by the worker, never here.
    if (deferredInput.trim() === "" || (jsonMode && utf8Length(deferredInput) > WORKER_THRESHOLD)) return null;
    const parsed = parseJson(deferredInput);
    return parsed.ok
      ? { root: parsed.value, stats: getStats(parsed.value, deferredInput), source: stripBom(deferredInput) }
      : null;
  }, [deferredInput, jsonMode]);
  // Keep the last good tree on screen while the next one is computed, so it does not blink or lose its state.
  const [kept, setKept] = useState(deferredAst);
  if (deferredAst !== null && deferredAst !== kept) setKept(deferredAst);
  const isValid = jsonMode && result !== null && result.ok;
  const shown = isValid ? (fresh ? deferredAst : kept) : null;

  const common = { input, setInput, indent, setIndent, mode, setMode, view, setView, sortKeys, setSortKeys, inputBytes };

  if (large) {
    const done = background.value;
    return {
      ...common,
      result: done?.result ?? null,
      fixes: done?.fixes ?? [],
      repair: null,
      note: null,
      tree: done?.tree ?? null,
      treeSource: done?.source ?? "",
      treeFresh: done !== null && done.tree !== null,
      stats: done?.stats ?? null,
      pending: background.running ? `${mode === "minify" ? "Minifying" : "Formatting"} ${formatBytes(inputBytes)}…` : null,
      workerNote: background.fallback
        ? WORKER_FALLBACK_NOTE
        : background.failed
          ? "The background worker failed on this input."
          : null,
    };
  }

  return {
    ...common,
    result,
    fixes,
    repair,
    note,
    tree: shown?.root ?? null,
    treeSource: shown?.source ?? "",
    treeFresh: fresh && shown !== null && shown === deferredAst,
    stats: mode === "unescape" ? (unescapedStats ?? null) : (shown?.stats ?? null),
    pending: null,
    workerNote: null,
  };
}
