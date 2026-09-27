"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

/** How long "Copied" or "Copy failed" stays after the last copy. */
const FEEDBACK_MS = 1500;

type CopyState = "idle" | "copied" | "failed";

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [state, setState] = useState<CopyState>("idle");
  // The live region's text, kept apart from the button's label: it is emptied before every copy, the label is not.
  const [announced, setAnnounced] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    // Emptied at once, so a second copy within 1.5 s changes the live region again and is announced again. Without
    // flushSync a fast clipboard lets React render "" and "Copied" together, and nothing changes.
    flushSync(() => setAnnounced(""));
    let next: "copied" | "failed";
    try {
      await navigator.clipboard.writeText(code);
      next = "copied";
    } catch {
      next = "failed";
    }
    setState(next);
    setAnnounced(next === "copied" ? "Copied" : "Copy failed");
    timer.current = setTimeout(() => {
      setState("idle");
      setAnnounced("");
    }, FEEDBACK_MS);
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
          {announced}
        </span>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
