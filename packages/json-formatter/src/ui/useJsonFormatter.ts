import { useMemo, useState } from "react";
import { repairJson, suggestFixes, type JsonFix } from "../core/fixes";
import { formatJson, minifyJson } from "../core/format";
import type { Indent, Result } from "../core/types";

/** Above this size "Fix all" is not computed, to keep typing fast. Single fixes are still offered. */
const REPAIR_INPUT_LIMIT = 100_000;

export type JsonFormatterMode = "format" | "minify";

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
}

/** Headless state for a JSON formatter: bring your own markup. */
export function useJsonFormatter(options: UseJsonFormatterOptions = {}): UseJsonFormatter {
  const [input, setInput] = useState(options.initialInput ?? "");
  const [indent, setIndent] = useState<Indent>(options.initialIndent ?? 2);
  const [mode, setMode] = useState<JsonFormatterMode>("format");

  const result = useMemo(() => {
    if (input.trim() === "") return null;
    return mode === "format" ? formatJson(input, { indent }) : minifyJson(input);
  }, [input, indent, mode]);

  const hasError = result !== null && !result.ok;

  const fixes = useMemo(() => (hasError ? suggestFixes(input) : []), [hasError, input]);

  const repair = useMemo(() => {
    if (!hasError || input.length > REPAIR_INPUT_LIMIT) return null;
    const repaired = repairJson(input);
    return repaired.ok && repaired.changes.length > 1 ? { value: repaired.value, changes: repaired.changes } : null;
  }, [hasError, input]);

  return { input, setInput, indent, setIndent, mode, setMode, result, fixes, repair };
}
