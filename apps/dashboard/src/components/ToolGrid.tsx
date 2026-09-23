"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES, type Category, type ToolMeta } from "@/registry";

type Filter = Category | "all";

export function ToolGrid({ tools }: { tools: ToolMeta[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter(
      (tool) =>
        (filter === "all" || tool.category === filter) &&
        (q === "" || [tool.title, tool.description, ...tool.tags].some((text) => text.toLowerCase().includes(q))),
    );
  }, [tools, query, filter]);

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
              {c}
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
                <span className="badge">{tool.category}</span>
                <h2>{tool.title}</h2>
                <p>{tool.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
