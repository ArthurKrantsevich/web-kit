import { useEffect, useState } from "react";

type CopyState = "idle" | "copied" | "failed";

/** Copies text to the clipboard with a short-lived label. Never throws: a blocked clipboard shows "Copy failed". */
export function useCopy(idleLabel: string = "Copy"): [label: string, copy: (text: string) => Promise<void>] {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 1500);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return [state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : idleLabel, copy];
}
