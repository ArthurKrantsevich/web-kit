import { useId, useMemo, useState, type ReactElement } from "react";
import { hashGenerator, type Result } from "../core/index";

export interface UseHashGenerator {
  input: string;
  setInput: (value: string) => void;
  result: Result<string> | null;
}

export function useHashGenerator(initialInput: string = ""): UseHashGenerator {
  const [input, setInput] = useState(initialInput);
  const result = useMemo(() => (input.trim() === "" ? null : hashGenerator(input)), [input]);
  return { input, setInput, result };
}

export function HashGenerator(props: { initialInput?: string; className?: string }): ReactElement {
  const { input, setInput, result } = useHashGenerator(props.initialInput);
  const id = useId();
  return (
    <div className={["wk-tool", props.className].filter(Boolean).join(" ")}>
      <label htmlFor={id + "-input"}>Input</label>
      <textarea id={id + "-input"} value={input} onChange={(e) => setInput(e.target.value)} />
      {result && !result.ok && <p role="alert">{result.error}</p>}
      <label htmlFor={id + "-output"}>Output</label>
      <textarea id={id + "-output"} readOnly value={result && result.ok ? result.value : ""} />
    </div>
  );
}
