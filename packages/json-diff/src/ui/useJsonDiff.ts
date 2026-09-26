import { useDeferredValue, useMemo, useState } from "react";
import { diffJson } from "../core/diff";
import { formatJsonPatch, toJsonPatch } from "../core/patch";
import type { DiffResult } from "../core/types";

export interface UseJsonDiffOptions {
  initialLeft?: string;
  initialRight?: string;
}

export interface UseJsonDiff {
  left: string;
  setLeft: (value: string) => void;
  right: string;
  setRight: (value: string) => void;
  arrayMode: "index" | "key";
  setArrayMode: (value: "index" | "key") => void;
  arrayKey: string;
  setArrayKey: (value: string) => void;
  numbers: "value" | "raw";
  setNumbers: (value: "value" | "raw") => void;
  /** null while either side is empty. */
  result: DiffResult | null;
  /** The JSON Patch as text; "" without a result. */
  patch: string;
  /** False while the result still describes older text: its offsets may not match the inputs. */
  fresh: boolean;
}

/** Headless state for comparing two JSON documents. */
export function useJsonDiff(options: UseJsonDiffOptions = {}): UseJsonDiff {
  const [left, setLeft] = useState(options.initialLeft ?? "");
  const [right, setRight] = useState(options.initialRight ?? "");
  const [arrayMode, setArrayMode] = useState<"index" | "key">("index");
  const [arrayKey, setArrayKey] = useState("id");
  const [numbers, setNumbers] = useState<"value" | "raw">("value");
  // Comparing large documents is slower than typing; let the result follow the text.
  const deferredLeft = useDeferredValue(left);
  const deferredRight = useDeferredValue(right);

  const result = useMemo((): DiffResult | null => {
    if (deferredLeft.trim() === "" || deferredRight.trim() === "") return null;
    return diffJson(deferredLeft, deferredRight, { numbers, arrayKey: arrayMode === "key" ? arrayKey : undefined });
  }, [deferredLeft, deferredRight, numbers, arrayMode, arrayKey]);

  const patch = useMemo(() => (result?.ok ? formatJsonPatch(toJsonPatch(result.value)) : ""), [result]);

  return {
    left,
    setLeft,
    right,
    setRight,
    arrayMode,
    setArrayMode,
    arrayKey,
    setArrayKey,
    numbers,
    setNumbers,
    result,
    patch,
    fresh: deferredLeft === left && deferredRight === right,
  };
}
