import type { ReactElement } from "react";
import { cx } from "./popover";
import { Tooltip } from "./Tooltip";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional tooltip for this segment. */
  tooltip?: string;
}

export interface SegmentedProps<T extends string> {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: "md" | "sm";
  className?: string;
}

/**
 * A row of toggle buttons with `aria-pressed`. Each label reserves the width of its bold (selected) form, so picking
 * a segment never changes the width of any button.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
  className,
}: SegmentedProps<T>): ReactElement {
  return (
    <div role="group" aria-label={label} className={cx("wk-ui-segmented", `wk-ui-segmented--${size}`, className)}>
      {options.map((option) => {
        const button = (
          <button
            key={option.value}
            type="button"
            className="wk-ui-segment"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            <span className="wk-ui-segment__label" data-label={option.label}>
              {option.label}
            </span>
          </button>
        );
        return option.tooltip === undefined ? (
          button
        ) : (
          <Tooltip key={option.value} content={option.tooltip}>
            {button}
          </Tooltip>
        );
      })}
    </div>
  );
}
