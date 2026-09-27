import { CATEGORY_LABELS, type Category, type ToolMeta, type UpcomingTool } from "./registry";

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

/** The empty message's words, shared by the page and the announcement. */
export function emptyTitle(reason: EmptyReason): string {
  return reason.kind === "search" ? `Nothing matches “${reason.query}”` : `No ${CATEGORY_LABELS[reason.category]} tools yet`;
}

export function emptyText(reason: EmptyReason): string {
  if (reason.kind === "search") return "Try a shorter word, or browse every tool.";
  const { planned } = reason;
  return planned === 0 ? "Nothing is planned here yet." : `${planned} ${planned === 1 ? "is" : "are"} planned — see ${planned === 1 ? "it" : "them"} below.`;
}

/**
 * What a screen reader hears after a search or a category change (a polite live region): the counts, or the empty
 * message. Nothing before the user has searched or picked a category.
 */
export function announceCatalog({ ready, soon, empty }: Catalog, query: string, filter: Filter): string {
  if (query.trim() === "" && filter === "all") return "";
  if (empty?.kind === "search") return `${emptyTitle(empty)}. ${emptyText(empty)}`;
  if (empty?.kind === "category") {
    return `${emptyTitle(empty)}. ${empty.planned === 0 ? emptyText(empty) : `${empty.planned} ${empty.planned === 1 ? "is" : "are"} planned.`}`;
  }
  return `${ready.length} ${ready.length === 1 ? "tool" : "tools"} ready, ${soon.length} planned`;
}
