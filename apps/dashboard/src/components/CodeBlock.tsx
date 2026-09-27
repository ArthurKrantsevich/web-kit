"use client";

import { useEffect, useRef, useState } from "react";

/** How long "Copied" or "Copy failed" stays after the last copy. */
const FEEDBACK_MS = 1500;

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    // Emptied first, so a second copy within 1.5 s changes the live region again and is announced again.
    setState("idle");
    let next: "copied" | "failed";
    try {
      await navigator.clipboard.writeText(code);
      next = "copied";
    } catch {
      next = "failed";
    }
    setState(next);
    timer.current = setTimeout(() => setState("idle"), FEEDBACK_MS);
  }

  const message = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "";

  return (
    <div className="code">
      <div className="code__bar">
        <span>{label}</span>
        <button type="button" aria-label={`Copy ${label}`} onClick={copy}>
          {message || "Copy"}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {message}
        </span>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
