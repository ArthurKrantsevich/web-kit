import { getStats, parseJson, stripBom, type JsonNode, type JsonStats } from "@web-kit/json-core";
import { useDeferredValue, useMemo, useState } from "react";
import { formatJson, minifyJson, repairJson, suggestFixes, type Indent, type JsonFix, type Result } from "../core/index";

/** Above this size "Fix all" is not computed, to keep typing fast. Single fixes are still offered. */
const REPAIR_INPUT_LIMIT = 10_000;

export type JsonFormatterMode = "format" | "minify";

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
  /** null while the input is blank. */
  result: Result<string> | null;
  /** Verified one-step fixes for the current error. */
  fixes: JsonFix[];
  /** Verified full repair; only when it needs 2+ changes and ends in valid JSON. */
  repair: { value: string; changes: string[] } | null;
  view: JsonOutputView;
  setView: (value: JsonOutputView) => void;
  /** AST of the input while it is valid. While a new parse is pending, the previous tree is kept. */
  tree: JsonNode | null;
  /** Text the tree was parsed from (without BOM); may lag the input while `treeFresh` is false. */
  treeSource: string;
  /** True when `tree` matches the current input, so its offsets can be used to select text in the input. */
  treeFresh: boolean;
  stats: JsonStats | null;
}

/** Headless state for a JSON formatter: bring your own markup. */
export function useJsonFormatter(options: UseJsonFormatterOptions = {}): UseJsonFormatter {
  const [input, setInput] = useState(options.initialInput ?? "");
  const [indent, setIndent] = useState<Indent>(options.initialIndent ?? 2);
  const [mode, setMode] = useState<JsonFormatterMode>("format");
  const [view, setView] = useState<JsonOutputView>("text");

  const result = useMemo(() => {
    if (input.trim() === "") return null;
    return mode === "format" ? formatJson(input, { indent }) : minifyJson(input);
  }, [input, indent, mode]);

  // Fix suggestions are slower than formatting, so they follow the input at low priority.
  const deferredInput = useDeferredValue(input);
  const hasError = result !== null && !result.ok;

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
    if (deferredInput.trim() === "") return null;
    const parsed = parseJson(deferredInput);
    return parsed.ok
      ? { root: parsed.value, stats: getStats(parsed.value, deferredInput), source: stripBom(deferredInput) }
      : null;
  }, [deferredInput]);
  // Keep the last good tree on screen while the next one is computed, so it does not blink or lose its state.
  const [kept, setKept] = useState(deferredAst);
  if (deferredAst !== null && deferredAst !== kept) setKept(deferredAst);
  const isValid = result !== null && result.ok;
  const shown = isValid ? (fresh ? deferredAst : kept) : null;

  return {
    input,
    setInput,
    indent,
    setIndent,
    mode,
    setMode,
    result,
    fixes,
    repair,
    view,
    setView,
    tree: shown?.root ?? null,
    treeSource: shown?.source ?? "",
    treeFresh: fresh && shown !== null && shown === deferredAst,
    stats: shown?.stats ?? null,
  };
}
