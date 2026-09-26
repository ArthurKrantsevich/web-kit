"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_LABELS, type Category, type ToolMeta, type UpcomingTool } from "@/registry";

type Filter = Category | "all";

export function ToolGrid({ tools, upcoming }: { tools: ToolMeta[]; upcoming: UpcomingTool[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      tools.filter(
        (tool) =>
          (filter === "all" || tool.category === filter) &&
          (q === "" || [tool.title, tool.description, ...tool.tags].some((text) => text.toLowerCase().includes(q))),
      ),
    [tools, q, filter],
  );
  // "Soon" cards only on the unfiltered catalog: they are not searchable.
  const soon = q === "" && filter === "all" ? upcoming : [];

  return (
    <section className="catalog">
      <div className="catalog__toolbar">
        <input
          type="search"
          aria-label="Search utilities"
          placeholder="Search utilities…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips" role="group" aria-label="Category">
          {(["all", ...CATEGORIES] as Filter[]).map((c) => (
            <button key={c} type="button" aria-pressed={filter === c} onClick={() => setFilter(c)}>
              {c === "all" ? "All" : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="empty">No utilities match your search.</p>
      ) : (
        <ul className="grid">
          {visible.map((tool) => (
            <li key={tool.id}>
              <Link className="card" href={`/tools/${tool.id}/`}>
                <pre className="card__preview" aria-hidden="true">
                  {tool.preview}
                </pre>
                <h2>{tool.title}</h2>
                <p>{tool.description}</p>
              </Link>
            </li>
          ))}
          {soon.map((tool) => (
            <li key={tool.title}>
              <div className="card card--soon">
                <div className="card__preview" aria-hidden="true" />
                <div className="card__title-row">
                  <h2>{tool.title}</h2>
                  <span className="soon">Soon</span>
                </div>
                <p>{tool.description}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
