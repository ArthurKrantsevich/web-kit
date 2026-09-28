import { useId, useMemo, useState, type ReactElement } from "react";
import { uuidGenerator, type Result } from "../core/index";

export interface UseUuidGenerator {
  input: string;
  setInput: (value: string) => void;
  result: Result<string> | null;
}

export function useUuidGenerator(initialInput: string = ""): UseUuidGenerator {
  const [input, setInput] = useState(initialInput);
  const result = useMemo(() => (input.trim() === "" ? null : uuidGenerator(input)), [input]);
  return { input, setInput, result };
}

export function UuidGenerator(props: { initialInput?: string; className?: string }): ReactElement {
  const { input, setInput, result } = useUuidGenerator(props.initialInput);
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
