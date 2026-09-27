import { useEffect, useId, useRef, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./popover";

export interface DialogProps {
  /** The dialog is in the document only while open. */
  open: boolean;
  /** Called on Escape, the Close button and a click on the backdrop. */
  onClose: () => void;
  /** The heading; it names the dialog. */
  title: string;
  children: ReactNode;
  /** Buttons at the bottom right. */
  footer?: ReactNode;
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/**
 * A modal dialog. It opens with `showModal()` where the browser has it (top layer, the page behind is inert); in any
 * case Tab and Shift+Tab stay inside it, Escape closes it, and focus goes back to the element that had it before.
 * The element with `data-autofocus` gets focus first; otherwise the first field or button of the body.
 */
export function Dialog({ open, onClose, title, children, footer, className }: DialogProps): ReactElement | null {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof element.showModal === "function") {
      if (!element.open) element.showModal();
    } else {
      element.setAttribute("open", "");
    }
    const body = element.querySelector<HTMLElement>(".wk-ui-dialog__body");
    const first =
      element.querySelector<HTMLElement>("[data-autofocus]") ?? (body ? focusables(body)[0] : undefined) ?? focusables(element)[0];
    first?.focus();
    // The browser's own Escape handling: keep the state in React.
    const onCancel = (event: Event): void => {
      event.preventDefault();
      close.current();
    };
    element.addEventListener("cancel", onCancel);
    return () => {
      element.removeEventListener("cancel", onCancel);
      if (typeof element.close === "function" && element.open) element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const items = focusables(dialog.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={dialog}
      className={cx("wk-ui-dialog", className)}
      aria-labelledby={`${id}-title`}
      aria-modal="true"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        // The dialog element itself is only hit outside its content box: on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="wk-ui-dialog__content">
        <div className="wk-ui-dialog__head">
          <h2 id={`${id}-title`} className="wk-ui-dialog__title">
            {title}
          </h2>
          <Button icon="close" iconOnly onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="wk-ui-dialog__body">{children}</div>
        {footer !== undefined && <div className="wk-ui-dialog__foot">{footer}</div>}
      </div>
    </dialog>
  );
}
