import type { ReactElement, ReactNode } from "react";
import { cx } from "./popover";

export interface OptionStackProps<K extends string> {
  /** The key of the panel to show. */
  active: NoInfer<K>;
  /** Every panel, by key. They are all rendered, one on top of another. */
  panels: Record<K, ReactNode>;
  /** Accessible name of the group, e.g. "Options for Characters". */
  label: string;
  className?: string;
}

/**
 * Options that change with a mode, in a box that never changes height: every panel lies in the same grid cell, so the
 * box is as tall as the tallest panel at every width, and switching the mode moves nothing below it. Hidden panels
 * are invisible, `inert` and `aria-hidden`: they take no focus and are not read out.
 */
export function OptionStack<K extends string>({ active, panels, label, className }: OptionStackProps<K>): ReactElement {
  return (
    <div className={cx("wk-ui-stack", className)} role="group" aria-label={label}>
      {(Object.keys(panels) as K[]).map((key) => (
        <div
          key={key}
          className="wk-ui-stack__panel"
          data-panel={key}
          data-active={key === active}
          inert={key !== active}
          aria-hidden={key === active ? undefined : true}
        >
          {panels[key]}
        </div>
      ))}
    </div>
  );
}
