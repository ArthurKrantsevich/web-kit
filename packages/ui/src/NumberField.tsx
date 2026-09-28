import { useEffect, useState, type ReactElement } from "react";
import { useHydrated } from "./hydrated";
import { cx } from "./popover";

export interface NumberFieldProps {
  /** The visible label before the field, and its accessible name unless `aria-label` says more. */
  label: string;
  "aria-label"?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  className?: string;
}

/**
 * A whole number from `min` to `max` in a toolbar: a short label (hidden on a narrow tool, like other field labels)
 * and a number field. What is typed is kept as typed; `onChange` gets only whole numbers in range. Leaving the field
 * puts back the last good value. Like every field, it is read-only until the page has hydrated.
 */
export function NumberField({ label, "aria-label": name, value, min, max, onChange, className }: NumberFieldProps): ReactElement {
  const [text, setText] = useState(String(value));
  const hydrated = useHydrated();
  useEffect(() => {
    setText((current) => (Number(current) === value && current.trim() !== "" ? current : String(value)));
  }, [value]);
  return (
    <>
      <span className="wk-ui-field" aria-hidden="true">
        {label}
      </span>
      <input
        className={cx("wk-ui-input", "wk-ui-number", className)}
        type="number"
        inputMode="numeric"
        aria-label={name ?? label}
        min={min}
        max={max}
        step={1}
        readOnly={!hydrated}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value.trim() !== "" && Number.isInteger(next) && next >= min && next <= max) onChange(next);
        }}
        onBlur={() => setText(String(value))}
      />
    </>
  );
}
