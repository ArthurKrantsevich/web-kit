import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import type { ActionId } from "./actions";
import { Icon, type IconName } from "./Icon";
import { clampLeft, cx, showInTopLayer, useIsomorphicLayoutEffect, usePopoverSupport } from "./popover";
import { Tooltip } from "./Tooltip";

export interface MenuItem {
  label: string;
  /** A second, muted line. */
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Makes the item a checkbox (`menuitemcheckbox`) in this state, or a radio button with `radio`. */
  checked?: boolean;
  /** With `checked`: one of a set of choices (`menuitemradio`), such as a format. */
  radio?: boolean;
  /** A key shown at the right, e.g. "?". */
  shortcut?: string;
  /** Choosing it leaves the menu open, as for one of several options to tick. */
  keepOpen?: boolean;
}

export interface MenuProps {
  /** Accessible name of the button and of the menu. */
  label: string;
  tooltip: string;
  items: MenuItem[];
  icon?: IconName;
  /** The label stays the accessible name; only the icon is visible. Default true. */
  iconOnly?: boolean;
  /** Marks the button as one of the shared actions (`data-action`), e.g. "more". */
  action?: ActionId;
  /**
   * "field": an outlined button with its text and a chevron, like a Select, for a menu of options; `icon` and
   * `iconOnly` do not apply. Default "icon".
   */
  look?: "icon" | "field";
  /** What a "field" button shows; default `label`. Its text is the button's accessible name. */
  content?: ReactNode;
  className?: string;
}

/**
 * A button that opens a menu of actions in the top layer, right-aligned under the button (above it when there is no
 * room below). Keyboard: Enter, Space or ↓ open on the first item, ↑ on the last; ↓/↑, Home/End move; Enter/Space
 * choose; Escape closes and returns focus; Tab closes. A click outside, page scroll or a resize closes it.
 */
export function Menu({
  label,
  tooltip,
  items,
  icon = "more",
  iconOnly = true,
  action,
  look = "icon",
  content,
  className,
}: MenuProps): ReactElement {
  const id = useId();
  const popover = usePopoverSupport();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  function show(at: number): void {
    setActive(at);
    setOpen(true);
  }

  function close(returnFocus: boolean): void {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  function choose(index: number): void {
    const item = items[index];
    if (!item || item.disabled) return;
    if (item.keepOpen) {
      item.onSelect();
      return;
    }
    // Focus goes back to the button first, so a dialog opened by the item returns focus there when it closes.
    close(true);
    item.onSelect();
  }

  useIsomorphicLayoutEffect(() => {
    const element = list.current;
    const anchor = button.current;
    if (!open || !element || !anchor) return;
    showInTopLayer(element);
    const box = anchor.getBoundingClientRect();
    const height = element.offsetHeight;
    const up = window.innerHeight - box.bottom - 12 < height && box.top - 12 > window.innerHeight - box.bottom - 12;
    element.dataset.side = up ? "top" : "bottom";
    element.style.top = `${up ? box.top - 4 - height : box.bottom + 4}px`;
    element.style.left = `${clampLeft(box.right - element.offsetWidth, element.offsetWidth)}px`;
    element.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.PointerEvent): void => {
      const target = event.target as Node | null;
      if (target && (list.current?.contains(target) || button.current?.contains(target))) return;
      close(false);
    };
    const onScroll = (event: Event): void => {
      if (event.target instanceof Node && list.current?.contains(event.target)) return;
      close(false);
    };
    const onResize = (): void => close(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      show(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      show(items.length - 1);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const last = items.length - 1;
    const move = (index: number): void => {
      event.preventDefault();
      setActive(index);
    };
    switch (event.key) {
      case "ArrowDown":
        return move(active === last ? 0 : active + 1);
      case "ArrowUp":
        return move(active === 0 ? last : active - 1);
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "Enter":
      case " ":
        event.preventDefault();
        return choose(active);
      case "Escape":
        event.preventDefault();
        return close(true);
      case "Tab":
        return close(false);
    }
  }

  return (
    <>
      <Tooltip content={tooltip}>
        <button
          ref={button}
          type="button"
          className={
            look === "field"
              ? cx("wk-ui-select", "wk-ui-menu-button", className)
              : cx(
                  "wk-ui-button",
                  "wk-ui-button--quiet",
                  "wk-ui-button--has-icon",
                  iconOnly && "wk-ui-button--icon-only",
                  "wk-ui-menu-button",
                  className,
                )
          }
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? `${id}-menu` : undefined}
          data-action={action}
          onClick={() => (open ? close(false) : show(0))}
          onMouseDown={(event) => {
            // Keep focus in the open menu, so the click below toggles it closed.
            if (open) event.preventDefault();
          }}
          onKeyDown={onButtonKeyDown}
        >
          {look === "field" ? (
            <>
              <span className="wk-ui-select__value">{content ?? label}</span>
              <Icon name="chevron-down" size={14} />
            </>
          ) : (
            <>
              <Icon name={icon} />
              <span className={iconOnly ? "wk-ui-sr-only" : "wk-ui-button__label"}>{label}</span>
            </>
          )}
        </button>
      </Tooltip>
      {open && (
        <div
          ref={list}
          id={`${id}-menu`}
          role="menu"
          aria-label={label}
          aria-activedescendant={`${id}-item-${active}`}
          tabIndex={-1}
          popover={popover ? "manual" : undefined}
          className="wk-ui-menu"
          onKeyDown={onListKeyDown}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && (list.current?.contains(next) || button.current?.contains(next))) return;
            close(false);
          }}
        >
          {items.map((item, index) => (
            <div
              key={item.label}
              id={`${id}-item-${index}`}
              role={item.checked === undefined ? "menuitem" : item.radio ? "menuitemradio" : "menuitemcheckbox"}
              aria-checked={item.checked}
              aria-disabled={item.disabled || undefined}
              aria-labelledby={`${id}-item-${index}-label`}
              aria-describedby={item.description === undefined ? undefined : `${id}-item-${index}-description`}
              className={cx("wk-ui-option", "wk-ui-menu__item", index === active && "wk-ui-option--active")}
              onPointerMove={() => {
                if (active !== index) setActive(index);
              }}
              onClick={() => choose(index)}
            >
              <span className="wk-ui-menu__check" aria-hidden="true">
                {item.checked && <Icon name="check" size={16} />}
              </span>
              <span className="wk-ui-option__text">
                <span id={`${id}-item-${index}-label`} className="wk-ui-option__label">
                  {item.label}
                </span>
                {item.description !== undefined && (
                  <span id={`${id}-item-${index}-description`} className="wk-ui-option__description">
                    {item.description}
                  </span>
                )}
              </span>
              {item.shortcut !== undefined && (
                <kbd className="wk-ui-menu__shortcut" aria-hidden="true">
                  {item.shortcut}
                </kbd>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
