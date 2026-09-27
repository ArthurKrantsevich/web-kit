import type { ReactElement, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./popover";

export interface EmptyStateProps {
  /** Shown in a circle above the title. */
  icon?: IconName;
  title: string;
  /** A sentence or two under the title. */
  children?: ReactNode;
  /** One next step, usually an outline `Button`. */
  action?: ReactNode;
  /** "sm" for a pane of a tool, "md" (default) for a page. */
  size?: "md" | "sm";
  className?: string;
}

/** What an empty result looks like everywhere: an icon in a circle, a title, a muted line and one next step. */
export function EmptyState({ icon, title, children, action, size = "md", className }: EmptyStateProps): ReactElement {
  return (
    <div className={cx("wk-ui-empty", `wk-ui-empty--${size}`, className)}>
      {icon !== undefined && (
        <span className="wk-ui-empty__icon">
          <Icon name={icon} size={size === "sm" ? 18 : 22} />
        </span>
      )}
      <p className="wk-ui-empty__title">{title}</p>
      {children !== undefined && <div className="wk-ui-empty__text">{children}</div>}
      {action !== undefined && <div className="wk-ui-empty__action">{action}</div>}
    </div>
  );
}
