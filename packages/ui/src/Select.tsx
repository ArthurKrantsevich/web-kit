import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { Icon } from "./Icon";
import { clampLeft, cx, showInTopLayer, useIsomorphicLayoutEffect, usePopoverSupport } from "./popover";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** A second, muted line under the label. */
  description?: string;
}

export interface SelectProps<T extends string> {
  /** Accessible name of the button. The current value is its description. */
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * A button that opens a list of options in the top layer, so no `overflow: hidden` parent clips it. The list opens
 * below the button, or above it when there is no room below. Keyboard: ↓/↑ or Enter/Space open; ↓/↑, Home/End move;
 * Enter/Space pick; a letter jumps to the next option that starts with it; Escape closes and returns focus; Tab
 * closes. A click outside, page scroll or a window resize closes the list.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: SelectProps<T>): ReactElement {
  const id = useId();
  const popover = usePopoverSupport();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];

  function show(): void {
    setActive(selectedIndex);
    setOpen(true);
  }

  function close(returnFocus: boolean): void {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  function pick(index: number): void {
    const option = options[index];
    close(true);
    if (option && option.value !== value) onChange(option.value);
  }

  useIsomorphicLayoutEffect(() => {
    const element = list.current;
    const anchor = button.current;
    if (!open || !element || !anchor) return;
    showInTopLayer(element);
    const box = anchor.getBoundingClientRect();
    element.style.minWidth = `${box.width}px`;
    element.style.maxHeight = "";
    const height = element.offsetHeight;
    const below = window.innerHeight - box.bottom - 12;
    const above = box.top - 12;
    const up = height > below && above > below;
    if (height > (up ? above : below)) element.style.maxHeight = `${Math.max(up ? above : below, 80)}px`;
    const finalHeight = element.offsetHeight;
    element.dataset.side = up ? "top" : "bottom";
    element.style.top = `${up ? box.top - 4 - finalHeight : box.bottom + 4}px`;
    element.style.left = `${clampLeft(box.left, element.offsetWidth)}px`;
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

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show();
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const last = options.length - 1;
    const move = (index: number): void => {
      event.preventDefault();
      setActive(index);
    };
    switch (event.key) {
      case "ArrowDown":
        return move(Math.min(active + 1, last));
      case "ArrowUp":
        return move(Math.max(active - 1, 0));
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "Enter":
      case " ":
        event.preventDefault();
        return pick(active);
      case "Escape":
        event.preventDefault();
        return close(true);
      case "Tab":
        return close(false);
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const letter = event.key.toLocaleLowerCase();
      const order = options.map((_, index) => (active + 1 + index) % options.length);
      const next = order.find((index) => options[index]!.label.toLocaleLowerCase().startsWith(letter));
      if (next !== undefined) move(next);
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={cx("wk-ui-select", className)}
        aria-label={label}
        aria-describedby={`${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : show())}
        onMouseDown={(event) => {
          // Keep focus in the open list, so the click below toggles it closed (Safari does not focus buttons at all).
          if (open) event.preventDefault();
        }}
        onKeyDown={onButtonKeyDown}
      >
        <span id={`${id}-value`} className="wk-ui-select__value">
          {selected?.label ?? ""}
        </span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-option-${active}`}
          tabIndex={-1}
          popover={popover ? "manual" : undefined}
          className="wk-ui-select__list"
          onKeyDown={onListKeyDown}
          onBlur={(event) => {
            const next = event.relatedTarget;
            // Focus moving to the own button is a press on it: its click closes the list, closing here would reopen it.
            if (next instanceof Node && (list.current?.contains(next) || button.current?.contains(next))) return;
            close(false);
          }}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-option-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === selectedIndex}
              aria-labelledby={`${id}-option-${index}-label`}
              aria-describedby={option.description === undefined ? undefined : `${id}-option-${index}-description`}
              className={cx("wk-ui-option", index === active && "wk-ui-option--active")}
              onPointerMove={() => {
                if (active !== index) setActive(index);
              }}
              onClick={() => pick(index)}
            >
              <span className="wk-ui-option__text">
                <span id={`${id}-option-${index}-label`} className="wk-ui-option__label">
                  {option.label}
                </span>
                {option.description !== undefined && (
                  <span id={`${id}-option-${index}-description`} className="wk-ui-option__description">
                    {option.description}
                  </span>
                )}
              </span>
              {index === selectedIndex && <Icon name="check" size={16} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
