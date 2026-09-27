import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from "react";
import { clampLeft, hideFromTopLayer, showInTopLayer, usePopoverSupport } from "./popover";

export interface TooltipProps {
  /** What will happen, in a short sentence. */
  content: string;
  /** One focusable element, usually a button. It gets `aria-describedby`. */
  children: ReactElement<{ "aria-describedby"?: string }>;
}

/** Hover delay before a tooltip appears. Keyboard focus shows it at once. */
export const TOOLTIP_DELAY = 400;

/**
 * A dark label above its element (below when there is no room above). Shown after 400 ms of mouse hover or at once
 * on keyboard focus; hidden on leave, blur, Escape and click; never shown for touch. It describes the element and
 * does not replace its accessible name.
 */
export function Tooltip({ content, children }: TooltipProps): ReactElement {
  const id = useId();
  const popover = usePopoverSupport();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Focus that follows a pointer press is not keyboard focus.
  const pressed = useRef(false);

  const cancel = useCallback((): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const hide = useCallback((): void => {
    cancel();
    setOpen(false);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  useLayoutEffect(() => {
    const element = tip.current;
    if (!element) return;
    if (!open) {
      hideFromTopLayer(element);
      return;
    }
    showInTopLayer(element);
    const target = anchor.current?.firstElementChild;
    if (!target) return;
    const box = target.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const above = box.top - height - 8 >= 4;
    const left = clampLeft(box.left + box.width / 2 - width / 2, width);
    element.dataset.side = above ? "top" : "bottom";
    element.style.left = `${left}px`;
    element.style.top = `${above ? box.top - height - 8 : box.bottom + 8}px`;
    element.style.setProperty("--wk-ui-arrow-x", `${box.left + box.width / 2 - left}px`);
  }, [open, popover]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open, hide]);

  function onPointerEnter(event: PointerEvent): void {
    if (event.pointerType === "touch") return;
    cancel();
    timer.current = setTimeout(() => setOpen(true), TOOLTIP_DELAY);
  }

  const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ");

  return (
    <span
      ref={anchor}
      className="wk-ui-tooltip-anchor"
      onPointerEnter={onPointerEnter}
      onPointerLeave={hide}
      onPointerDown={() => {
        pressed.current = true;
        hide();
      }}
      onPointerUp={() => {
        pressed.current = false;
      }}
      onPointerCancel={() => {
        pressed.current = false;
      }}
      onFocus={() => {
        if (pressed.current) return;
        cancel();
        setOpen(true);
      }}
      onBlur={hide}
      onClick={hide}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      <span ref={tip} id={id} role="tooltip"
        popover={popover ? "manual" : undefined}
        className="wk-ui-tooltip" data-state={open ? "open" : "closed"}>
        {content}
      </span>
    </span>
  );
}
