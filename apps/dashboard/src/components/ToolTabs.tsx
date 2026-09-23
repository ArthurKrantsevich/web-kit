"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { ApiEntry, ToolMeta } from "@/registry";
import { ToolDemo } from "@/tools/demos";
import { CodeBlock } from "./CodeBlock";

const TABS = ["Demo", "Install & Usage", "API"] as const;
type Tab = (typeof TABS)[number];

const tabId = (tab: Tab) => `tab-${tab.toLowerCase().replace(/[^a-z]+/g, "-")}`;

export function ToolTabs({ tool }: { tool: ToolMeta }) {
  const [active, setActive] = useState<Tab>("Demo");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.indexOf(active);
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    if (next === -1) return;
    event.preventDefault();
    setActive(TABS[next]!);
    buttons.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Sections" className="tabs" onKeyDown={onKeyDown}>
        {TABS.map((tab, index) => (
          <button
            key={tab}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            id={tabId(tab)}
            type="button"
            role="tab"
            tabIndex={active === tab ? 0 : -1}
            aria-selected={active === tab}
            aria-controls="tool-panel"
            onClick={() => setActive(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="tool-panel" aria-labelledby={tabId(active)} className="panel">
        {active === "Demo" && <ToolDemo id={tool.id} />}
        {active === "Install & Usage" && <Usage tool={tool} />}
        {active === "API" && <ApiTable api={tool.api} />}
      </div>
    </div>
  );
}

function Usage({ tool }: { tool: ToolMeta }) {
  return (
    <div className="stack">
      <p className="note">Not published to npm yet. These commands will work after the first release.</p>
      <CodeBlock label="npm" code={`npm i ${tool.pkg}`} />
      <CodeBlock label="pnpm" code={`pnpm add ${tool.pkg}`} />
      <CodeBlock label="Usage" code={tool.usage} />
    </div>
  );
}

function ApiTable({ api }: { api: ApiEntry[] }) {
  return (
    <table className="api">
      <thead>
        <tr>
          <th>Name</th>
          <th>Signature</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {api.map((entry) => (
          <tr key={entry.name}>
            <td>
              <code>{entry.name}</code>
            </td>
            <td>
              <code>{entry.signature}</code>
            </td>
            <td>{entry.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
