"use client";

import { useState } from "react";
import type { ApiEntry, ToolMeta } from "@/registry";
import { ToolDemo } from "@/tools/demos";
import { CodeBlock } from "./CodeBlock";

const TABS = ["Demo", "Install & Usage", "API"] as const;
type Tab = (typeof TABS)[number];

const tabId = (tab: Tab) => `tab-${tab.toLowerCase().replace(/[^a-z]+/g, "-")}`;

export function ToolTabs({ tool }: { tool: ToolMeta }) {
  const [active, setActive] = useState<Tab>("Demo");

  return (
    <div>
      <div role="tablist" aria-label="Sections" className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            id={tabId(tab)}
            type="button"
            role="tab"
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
