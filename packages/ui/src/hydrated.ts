import { useSyncExternalStore } from "react";

const noSubscription = (): (() => void) => () => {};

/**
 * False in the server HTML and during hydration, true once React runs the page. Fields render `readOnly` until then:
 * text typed before hydration would otherwise be replaced by React's state without a word.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}
