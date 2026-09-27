"use client";

import { Button, EmptyState } from "@web-kit/ui";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { selectCatalog, type EmptyReason, type Filter } from "@/catalog";
import { CATEGORIES, CATEGORY_LABELS, type ToolMeta, type UpcomingTool } from "@/registry";

export function ToolGrid({ tools, upcoming }: { tools: ToolMeta[]; upcoming: UpcomingTool[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const search = useRef<HTMLInputElement>(null);
  const { ready, soon, empty } = useMemo(() => selectCatalog(tools, upcoming, query, filter), [tools, upcoming, query, filter]);

  function clearSearch() {
    setQuery("");
    search.current?.focus();
  }

  return (
    <section id="tools" className="catalog" aria-label="Tools">
      <div className="catalog__toolbar">
        <input
          ref={search}
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

      {empty && <Empty reason={empty} onClearSearch={clearSearch} onShowAll={() => setFilter("all")} />}

      {ready.length + soon.length > 0 && (
        <ul className="grid">
          {ready.map((tool) => (
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
            <li key={tool.id}>
              {/* Not a link: the tool has no page yet. */}
              <div className="card card--soon">
                <pre className="card__preview card__preview--soon" aria-hidden="true">
                  {tool.preview}
                </pre>
                <h2>{tool.title}</h2>
                {/* "Soon" sits on the category line, so it never wraps under a long title. */}
                <p className="card__category">
                  {CATEGORY_LABELS[tool.category]} <span className="soon">Soon</span>
                </p>
                <p>{tool.description}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Empty({ reason, onClearSearch, onShowAll }: { reason: EmptyReason; onClearSearch: () => void; onShowAll: () => void }) {
  if (reason.kind === "search") {
    return (
      <EmptyState
        icon="search"
        title={`Nothing matches “${reason.query}”`}
        action={
          <Button variant="outline" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      >
        Try a shorter word, or browse every tool.
      </EmptyState>
    );
  }
  const { category, planned } = reason;
  return (
    <EmptyState
      icon="generate"
      title={`No ${CATEGORY_LABELS[category]} tools yet`}
      action={
        planned === 0 ? (
          <Button variant="outline" onClick={onShowAll}>
            Show all tools
          </Button>
        ) : undefined
      }
    >
      {planned === 0 ? "Nothing is planned here yet." : `${planned} ${planned === 1 ? "is" : "are"} planned — see ${planned === 1 ? "it" : "them"} below.`}
    </EmptyState>
  );
}
