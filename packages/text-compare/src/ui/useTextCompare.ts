import { useDeferredValue, useMemo, useState } from "react";
import { compareTexts } from "../core/compare";
import type { CompareOptions, Granularity, TextDiff } from "../core/types";
import type { CompareJob } from "../job";
import { formatBytes, utf8Length } from "./format";
import { useCompareJob } from "./useCompareJob";

/** Texts larger than this together (UTF-8 bytes) are compared in a worker, so typing and scrolling stay smooth. */
export const WORKER_THRESHOLD: number = 1024 * 1024;

/** Shown when no worker could start and large texts are compared on the page. */
export const WORKER_FALLBACK_NOTE: string =
  "The background worker could not start, so large texts are compared on the page and may freeze it.";

export type Layout = "split" | "inline";

/** Every ignore option, all set. */
export type IgnoreOptions = Required<CompareOptions>;

export const DEFAULT_OPTIONS: IgnoreOptions = {
  ignoreWhitespace: false,
  ignoreCase: false,
  ignoreBlankLines: false,
  ignoreLineEndings: true,
};

/** A diff with the texts and options it was computed from: what the result shows. */
export interface Comparison {
  diff: TextDiff;
  left: string;
  right: string;
  options: IgnoreOptions;
}

export interface UseTextCompareOptions {
  initialLeft?: string;
  initialRight?: string;
}

export interface UseTextCompare {
  left: string;
  right: string;
  /** Sets a side's text; `name` (a file name, or null for none) is kept until it is given again. */
  setLeft: (text: string, name?: string | null) => void;
  setRight: (text: string, name?: string | null) => void;
  /** The name of the file each side was opened from, or null. */
  leftName: string | null;
  rightName: string | null;
  layout: Layout;
  setLayout: (layout: Layout) => void;
  granularity: Granularity;
  setGranularity: (granularity: Granularity) => void;
  options: IgnoreOptions;
  setOptions: (options: IgnoreOptions) => void;
  /** Size of each side in UTF-8 bytes. */
  bytes: { left: number; right: number };
  /**
   * The latest comparison, kept on screen while the next one is computed; null while both sides are empty and before
   * the first result of large texts.
   */
  comparison: Comparison | null;
  /** True when `comparison` describes the current texts and options. */
  fresh: boolean;
  /** "Comparing 5.2 MB…" while the worker compares; null otherwise. */
  pending: string | null;
  /** WORKER_FALLBACK_NOTE, or a worker failure; null otherwise. */
  workerNote: string | null;
  /** True when the worker failed on the current texts: `comparison` is then an older one. */
  failed: boolean;
}

/** A file name without line breaks and other control characters (it goes into titles and patch headers). */
function cleanName(name: string | null): string | null {
  return name === null ? null : name.replace(/[\u0000-\u001f\u007f]/g, "");
}

/** Headless state for comparing two texts: the texts, file names, view settings, options and the comparison. */
export function useTextCompare(settings: UseTextCompareOptions = {}): UseTextCompare {
  const [left, setLeftText] = useState(settings.initialLeft ?? "");
  const [right, setRightText] = useState(settings.initialRight ?? "");
  const [leftName, setLeftName] = useState<string | null>(null);
  const [rightName, setRightName] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("split");
  const [granularity, setGranularity] = useState<Granularity>("word");
  const [options, setOptions] = useState<IgnoreOptions>(DEFAULT_OPTIONS);

  const leftBytes = useMemo(() => utf8Length(left), [left]);
  const rightBytes = useMemo(() => utf8Length(right), [right]);
  const total = leftBytes + rightBytes;
  const empty = left === "" && right === "";
  const large = total > WORKER_THRESHOLD;

  // Large texts go to the worker; small ones are compared here, one step behind the typing.
  const job = useMemo(
    (): (CompareJob & { options: IgnoreOptions }) | null => (large ? { left, right, options } : null),
    [large, left, right, options],
  );
  const background = useCompareJob(job);
  const current = useMemo(() => ({ left, right, options, large }), [left, right, options, large]);
  const deferred = useDeferredValue(current);
  const onPage = useMemo((): Comparison | null => {
    if (deferred.large || (deferred.left === "" && deferred.right === "")) return null;
    return { diff: compareTexts(deferred.left, deferred.right, deferred.options), left: deferred.left, right: deferred.right, options: deferred.options };
  }, [deferred]);
  const fromWorker = useMemo(
    (): Comparison | null => (job !== null && background.value !== null ? { diff: background.value, ...job } : null),
    [job, background.value],
  );
  const latest = large ? fromWorker : onPage;

  // Keep the last result on screen while the next one is computed, so the view does not blink or lose its scroll.
  const [kept, setKept] = useState<Comparison | null>(latest);
  if (empty) {
    if (kept !== null) setKept(null);
  } else if (latest !== null && latest !== kept) setKept(latest);
  const comparison = empty ? null : (latest ?? kept);

  return {
    left,
    right,
    setLeft: (text, name) => {
      setLeftText(text);
      if (name !== undefined) setLeftName(cleanName(name));
    },
    setRight: (text, name) => {
      setRightText(text);
      if (name !== undefined) setRightName(cleanName(name));
    },
    leftName,
    rightName,
    layout,
    setLayout,
    granularity,
    setGranularity,
    options,
    setOptions,
    bytes: { left: leftBytes, right: rightBytes },
    comparison,
    fresh: comparison !== null && comparison.left === left && comparison.right === right && comparison.options === options,
    pending: large && background.running ? `Comparing ${formatBytes(total)}…` : null,
    failed: large && background.failed,
    workerNote: background.fallback
      ? WORKER_FALLBACK_NOTE
      : background.failed
        ? "The background worker failed on these texts."
        : null,
  };
}
