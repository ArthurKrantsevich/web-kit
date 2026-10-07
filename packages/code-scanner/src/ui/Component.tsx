import { useId, useMemo, useState, type ReactElement } from "react";
import { codeScanner, type Result } from "../core/placeholder";

export interface UseCodeScanner {
  input: string;
  setInput: (value: string) => void;
  result: Result<string> | null;
}

export function useCodeScanner(initialInput: string = ""): UseCodeScanner {
  const [input, setInput] = useState(initialInput);
  const result = useMemo(() => (input.trim() === "" ? null : codeScanner(input)), [input]);
  return { input, setInput, result };
}

export function CodeScanner(props: { initialInput?: string; className?: string }): ReactElement {
  const { input, setInput, result } = useCodeScanner(props.initialInput);
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
