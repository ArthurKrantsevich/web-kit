import {
  forwardRef,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ForwardRefExoticComponent,
  type ReactElement,
  type RefAttributes,
} from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./popover";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "primary" | "quiet" | "outline";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: IconName;
  /** Shown on hover and keyboard focus; says what the button will do. */
  tooltip?: string;
  /** The label stays the accessible name; only the icon is visible. */
  iconOnly?: boolean;
}

/**
 * A button in the shared style. `type` defaults to "button". A `ref` reaches the `<button>`; it is a forwardRef
 * component so that React 18 passes the ref too.
 */
export const Button: ForwardRefExoticComponent<ButtonProps & RefAttributes<HTMLButtonElement>> = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "quiet", icon, tooltip, iconOnly = false, className, children, type = "button", ...rest },
  ref,
): ReactElement {
  const button = (
    <button
      ref={ref}
      type={type}
      className={cx(
        "wk-ui-button",
        `wk-ui-button--${variant}`,
        icon !== undefined && "wk-ui-button--has-icon",
        iconOnly && "wk-ui-button--icon-only",
        className,
      )}
      {...rest}
    >
      {icon !== undefined && <Icon name={icon} />}
      <span className={iconOnly ? "wk-ui-sr-only" : "wk-ui-button__label"}>{children}</span>
    </button>
  );
  return tooltip === undefined ? button : <Tooltip content={tooltip}>{button}</Tooltip>;
});

export interface CopyButtonProps {
  /**
   * Copied as is. The button is disabled while it is empty. A function is called only on click, for text that is
   * costly to build.
   */
  text: string | (() => string);
  /** Idle label and accessible name. Default "Copy". */
  label?: string;
  tooltip: string;
  variant?: "primary" | "quiet";
  /** Default: disabled while `text` is "". */
  disabled?: boolean;
}

type CopyState = "idle" | "copied" | "failed";

/** How long "Copied" or "Copy failed" stays. */
export const COPY_FEEDBACK_MS = 1500;

/**
 * Copies `text`. The label changes to "Copied" or "Copy failed" for 1.5 s without changing the button's width: all
 * three labels share one grid cell and only one is visible. The change is announced through a polite live region.
 */
export function CopyButton({ text, label = "Copy", tooltip, variant = "primary", disabled }: CopyButtonProps): ReactElement {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  const labels: [CopyState, ReactElement | string][] = [
    ["idle", label],
    [
      "copied",
      <>
        <Icon name="check" size={14} />
        Copied
      </>,
    ],
    ["failed", "Copy failed"],
  ];

  return (
    <>
      <Tooltip content={tooltip}>
        <button
          type="button"
          className={cx("wk-ui-button", `wk-ui-button--${variant}`, "wk-ui-copy")}
          disabled={disabled ?? text === ""}
          onClick={() => void copy()}
        >
          <span className="wk-ui-copy__labels">
            {labels.map(([key, content]) => (
              <span key={key} className="wk-ui-copy__label" data-shown={state === key} aria-hidden={state !== key}>
                {content}
              </span>
            ))}
          </span>
        </button>
      </Tooltip>
      <span className="wk-ui-sr-only" aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </>
  );
}
