"use client";

import { useState } from "react";

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1500);
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
