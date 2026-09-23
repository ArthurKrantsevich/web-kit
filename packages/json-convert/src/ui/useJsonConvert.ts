import { useMemo, useState } from "react";
import type { ConvertResult } from "../core/index";
import { convert, DEFAULT_OPTIONS, type ConvertOptions, type ConvertTarget } from "./convert";

export interface UseJsonConvertOptions {
  initialInput?: string;
  initialTarget?: ConvertTarget;
}

export interface UseJsonConvert {
  input: string;
  setInput: (value: string) => void;
  target: ConvertTarget;
  setTarget: (value: ConvertTarget) => void;
  options: ConvertOptions;
  setOptions: (patch: Partial<ConvertOptions>) => void;
  /** null while the input is blank. */
  result: ConvertResult | null;
}

/** Headless state for the converter. */
export function useJsonConvert(options: UseJsonConvertOptions = {}): UseJsonConvert {
  const [input, setInput] = useState(options.initialInput ?? "");
  const [target, setTarget] = useState<ConvertTarget>(options.initialTarget ?? "yaml");
  const [convertOptions, setConvertOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS);
  const result = useMemo(
    () => (input.trim() === "" ? null : convert(input, target, convertOptions)),
    [input, target, convertOptions],
  );
  return {
    input,
    setInput,
    target,
    setTarget,
    options: convertOptions,
    setOptions: (patch) => setConvertOptions((current) => ({ ...current, ...patch })),
    result,
  };
}
