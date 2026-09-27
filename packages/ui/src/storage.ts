import { useCallback, useEffect, useRef, useState } from "react";

/** Saving waits for a pause in typing this long; leaving the page saves at once. */
export const SAVE_DELAY = 400;

export interface PersistentState {
  /** False where the browser does not allow storage (blocked site data, some private modes) and before hydration. */
  available: boolean;
  /** Saving is on. Off by default; the choice itself is remembered. */
  enabled: boolean;
  /** The text saved on an earlier visit, read once after hydration; null when there is none. */
  saved: string | null;
  /** True once storage has been read. */
  ready: boolean;
  /** Something is stored now. */
  hasSaved: boolean;
  /** On: remembers the choice and saves `current` at once. Off: stops saving and deletes what was saved. */
  setEnabled: (on: boolean, current: string) => void;
  /** Saves `value` after a short pause, while saving is on. */
  save: (value: string) => void;
  /** Deletes the saved text; saving stays on and resumes with the next change. */
  clear: () => void;
  /** Why the last save failed, or null. */
  error: string | null;
}

/** Said when the browser refuses to store the text (usually its size); the older copy is deleted, not kept. */
export const NOT_SAVED = "Not saved: the input is too large for this browser's storage";

function storage(): Storage | null {
  try {
    const store = window.localStorage;
    const probe = "wk:probe";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

/**
 * The input of one tool kept in localStorage under `wk:<key>:input`, while the flag `wk:<key>:autosave` says saving
 * is on. Nothing is stored until the user turns saving on; turning it off deletes both.
 */
export function usePersistentState(key: string): PersistentState {
  const flagKey = `wk:${key}:autosave`;
  const inputKey = `wk:${key}:input`;
  const [state, setState] = useState({
    available: false,
    enabled: false,
    saved: null as string | null,
    ready: false,
    hasSaved: false,
    error: null as string | null,
  });
  const pending = useRef<{ value: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const enabled = useRef(false);

  const write = useCallback(
    (value: string): void => {
      const store = storage();
      if (!store) return;
      try {
        store.setItem(inputKey, value);
        setState((s) => (s.hasSaved && s.error === null ? s : { ...s, hasSaved: true, error: null }));
      } catch {
        // An older copy would come back on the next visit as if it were the latest: delete it.
        store.removeItem(inputKey);
        setState((s) => ({ ...s, hasSaved: false, error: NOT_SAVED }));
      }
    },
    [inputKey],
  );

  const flush = useCallback((): void => {
    const job = pending.current;
    if (!job) return;
    clearTimeout(job.timer);
    pending.current = null;
    if (enabled.current) write(job.value);
  }, [write]);

  useEffect(() => {
    const store = storage();
    const on = store?.getItem(flagKey) === "1";
    const saved = on ? (store?.getItem(inputKey) ?? null) : null;
    enabled.current = on;
    setState({ available: store !== null, enabled: on, saved, ready: true, hasSaved: saved !== null, error: null });
  }, [flagKey, inputKey]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const setEnabled = useCallback(
    (on: boolean, current: string): void => {
      const store = storage();
      if (!store) return;
      enabled.current = on;
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
      if (on) {
        store.setItem(flagKey, "1");
        setState((s) => ({ ...s, enabled: true }));
        write(current);
      } else {
        store.removeItem(flagKey);
        store.removeItem(inputKey);
        setState((s) => ({ ...s, enabled: false, hasSaved: false, error: null }));
      }
    },
    [flagKey, inputKey, write],
  );

  const save = useCallback((value: string): void => {
    if (!enabled.current) return;
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { value, timer: setTimeout(flush, SAVE_DELAY) };
  }, [flush]);

  const clear = useCallback((): void => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    storage()?.removeItem(inputKey);
    setState((s) => ({ ...s, hasSaved: false, error: null }));
  }, [inputKey]);

  return { ...state, setEnabled, save, clear };
}
