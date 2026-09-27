import type { ReactElement, ReactNode } from "react";
import { cx } from "./popover";

export interface EditorShellProps {
  /** The tool's own root class, e.g. "wk-json"; kept next to "wk-ui-editor". */
  className?: string;
  toolbar: ReactNode;
  children: ReactNode;
  status: ReactNode;
}

/**
 * The card of the editor layout: toolbar, panes (and anything under them), status line. It is an inline-size
 * container, so its layout follows its own width, not the window's.
 */
export function EditorShell({ className, toolbar, children, status }: EditorShellProps): ReactElement {
  return (
    <div className={cx("wk-ui-editor", className)}>
      {toolbar}
      {children}
      {status}
    </div>
  );
}

/** The toolbar: a group named "Options". Put a `<span className="wk-ui-spacer" />` before the right-hand actions. */
export function EditorToolbar({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="wk-ui-editor__toolbar" role="group" aria-label="Options">
      {children}
    </div>
  );
}

/** Two panes: stacked, side by side from 1024 px of component width. Height: `--wk-editor-height`. */
export function EditorPanes({ children }: { children: ReactNode }): ReactElement {
  return <div className="wk-ui-editor__panes">{children}</div>;
}

export interface EditorPaneProps {
  /** Pane title; a `<label>` for `labelFor` when given. */
  title: ReactNode;
  /** Muted text after the title, e.g. the size. */
  meta?: ReactNode;
  /** Buttons at the right end of the pane header. */
  actions?: ReactNode;
  /** The pane body: a textarea or a scrolling element. It fills the rest of the pane. */
  children: ReactNode;
  /** Id of the field the title labels. */
  labelFor?: string;
  className?: string;
}

export function EditorPane({ title, meta, actions, children, labelFor, className }: EditorPaneProps): ReactElement {
  return (
    <section className={cx("wk-ui-pane", className)}>
      <div className="wk-ui-pane__head">
        {labelFor === undefined ? (
          <span className="wk-ui-pane__title">{title}</span>
        ) : (
          <label className="wk-ui-pane__title" htmlFor={labelFor}>
            {title}
          </label>
        )}
        {meta !== undefined && <span className="wk-ui-pane__meta">{meta}</span>}
        <span className="wk-ui-spacer" />
        {actions}
      </div>
      {children}
    </section>
  );
}

export type StatusState = "idle" | "valid" | "warning" | "error";

export interface StatusLineProps {
  /** Colors the dot and the first child. "warning" is for results with a caveat, e.g. keywords that were not checked. */
  state: StatusState;
  children: ReactNode;
}

/** The line under the panes. It has no role: tools give `role="status"` only to the text that must be announced. */
export function StatusLine({ state, children }: StatusLineProps): ReactElement {
  return <p className={cx("wk-ui-status", `wk-ui-status--${state}`)}>{children}</p>;
}
