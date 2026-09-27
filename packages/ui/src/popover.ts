import { useSyncExternalStore } from "react";

const noSubscription = (): (() => void) => () => {};
const hasPopoverApi = (): boolean =>
  typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover === "function";

/**
 * True in browsers with the Popover API. False during the server render and hydration (so the markup matches), and in
 * environments without the API, such as jsdom: there the floating element is a plain `position: fixed` element that
 * is shown and hidden by its `data-state`.
 */
export function usePopoverSupport(): boolean {
  return useSyncExternalStore(noSubscription, hasPopoverApi, () => false);
}

/** Puts the element into the top layer when the browser has the Popover API. Without it the element stays in place. */
export function showInTopLayer(element: HTMLElement): void {
  if (typeof element.showPopover !== "function") return;
  try {
    element.showPopover();
  } catch {
    // Already open, or disconnected: nothing to do.
  }
}

export function hideFromTopLayer(element: HTMLElement): void {
  if (typeof element.hidePopover !== "function") return;
  try {
    element.hidePopover();
  } catch {
    // Already closed.
  }
}

/** Keeps a floating box of `width` inside the window, 8 px from each edge. */
export function clampLeft(left: number, width: number): number {
  return Math.max(8, Math.min(left, window.innerWidth - width - 8));
}

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
