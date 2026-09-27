import type { Category, ToolMeta, UpcomingTool } from "./registry";

export type Filter = Category | "all";

/** Why the ready tools are missing, when they are. */
export type EmptyReason =
  | { kind: "search"; query: string }
  | { kind: "category"; category: Category; planned: number };

export interface Catalog {
  /** Ready tools that match, in registry order; they come first. */
  ready: ToolMeta[];
  /** Planned tools that match, after the ready ones. */
  soon: UpcomingTool[];
  /** Set when there is something to explain instead of (or above) the cards. */
  empty: EmptyReason | null;
}

const has = (texts: string[], query: string): boolean => query === "" || texts.some((text) => text.toLowerCase().includes(query));

/**
 * What the home page shows for a search and a category. Ready tools match by title, description and tags; planned
 * ones by title and description. Nothing at all for a search → "search"; a category with no ready tool (and no
 * search) → "category", with the planned ones of that category still listed.
 */
export function selectCatalog(tools: ToolMeta[], upcoming: UpcomingTool[], query: string, filter: Filter): Catalog {
  const words = query.trim();
  const needle = words.toLowerCase();
  const inFilter = (category: Category) => filter === "all" || category === filter;
  const ready = tools.filter((tool) => inFilter(tool.category) && has([tool.title, tool.description, ...tool.tags], needle));
  const soon = upcoming.filter((tool) => inFilter(tool.category) && has([tool.title, tool.description], needle));
  let empty: EmptyReason | null = null;
  if (ready.length === 0 && soon.length === 0 && needle !== "") empty = { kind: "search", query: words };
  else if (ready.length === 0 && needle === "" && filter !== "all") empty = { kind: "category", category: filter, planned: soon.length };
  return { ready, soon, empty };
}
