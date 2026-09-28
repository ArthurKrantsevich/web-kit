import { useEffect, useState } from "react";

/** How long a value must stay the same before useSettled gives it: about one pause in typing. */
export const SETTLE_DELAY = 800;

/**
 * The value once it has stayed the same for `delay` ms; until then, the last value that did. For live regions: a
 * status that changes with every keystroke is announced once, when the typing pauses. A delay of 0 gives it at once.
 */
export function useSettled<T>(value: T, delay: number = SETTLE_DELAY): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (delay <= 0) {
      setSettled(() => value);
      return;
    }
    const timer = setTimeout(() => setSettled(() => value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return delay <= 0 ? value : settled;
}
