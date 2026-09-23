import {
  formatJson,
  formatPath,
  pathOf,
  queryJson,
  searchJson,
  type JsonNode,
  type JsonPath,
  type QueryMatch,
} from "@web-kit/json-core";
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { CHILD_PAGE, EXPAND_ALL_LIMIT, expandBreadthFirst, hasChildren, visibleRows, type TreeRow } from "./tree-model";
import { useCopy } from "./useCopy";

export interface JsonTreeProps {
  root: JsonNode;
  /** Text the AST was parsed from (without a BOM). "Copy value" copies the node's original text from it. */
  source: string;
  /** Called with the node's range in `source` when the user asks to see it in the input. Omit to hide the button. */
  onShowInInput?: (start: number, end: number) => void;
  /** Levels expanded at first. Default 2. */
  initialDepth?: number;
  /** Most rows "Expand all" may show. Default 5000. */
  expandAllLimit?: number;
  /** Children shown per step in large containers. Default 500. */
  pageSize?: number;
  /** Show the search / JSONPath bar. Default true. */
  searchable?: boolean;
  className?: string;
}

interface TreeState {
  /** Expanded rows by JSON path, so they survive edits. */
  expanded: Set<string>;
  shown: Map<string, number>;
  selected: string;
  note: string | null;
}

type NodeRow = Extract<TreeRow, { kind: "node" }>;

interface Found {
  mode: "none" | "search" | "path";
  matches: QueryMatch[];
  error: string | null;
}

/** Text starting with `$` is JSONPath; anything else is a case-insensitive search. */
function findMatches(root: JsonNode, query: string): Found {
  const text = query.trim();
  if (text === "") return { mode: "none", matches: [], error: null };
  if (!text.startsWith("$")) return { mode: "search", matches: searchJson(root, text), error: null };
  const result = queryJson(root, text);
  return result.ok
    ? { mode: "path", matches: result.value, error: null }
    : { mode: "path", matches: [], error: `Column ${result.error.column}: ${result.error.message}` };
}

/** Documents larger than this are queried after a pause in typing, not on every keystroke. */
const LARGE_SOURCE = 200_000;
const QUERY_DELAY = 150;

function limitNote(limit: number, collapsed: number): string {
  const what = collapsed === 1 ? "1 container stays" : `${collapsed.toLocaleString("en-US")} containers stay`;
  return `Expanded as much as fits in ${limit.toLocaleString("en-US")} rows. ${what} collapsed; expand them one by one.`;
}

function truncate(text: string): string {
  if (text.length <= 120) return text;
  return `${Array.from(text).slice(0, 119).join("")}…`;
}

/** What a row shows for a node: `{3}`, `[12]`, or the value as written (long strings shortened). */
function valueText(node: JsonNode): string {
  switch (node.type) {
    case "object":
      return `{${node.members.length}}`;
    case "array":
      return `[${node.items.length}]`;
    case "string":
      return truncate(node.raw);
    case "number":
      return node.raw;
    case "boolean":
      return String(node.value);
    case "null":
      return "null";
  }
}

const VALUE_CLASS: Record<JsonNode["type"], string> = {
  object: "wk-tree__preview",
  array: "wk-tree__preview",
  string: "wk-syntax-string",
  number: "wk-syntax-number",
  boolean: "wk-syntax-literal",
  null: "wk-syntax-literal",
};

/** Collapsible, keyboard-accessible JSON tree. Numbers and strings are shown exactly as written. */
export function JsonTree(props: JsonTreeProps): ReactElement {
  const { root, source, onShowInInput } = props;
  const pageSize = props.pageSize ?? CHILD_PAGE;
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TreeState>(() => ({
    expanded: expandBreadthFirst(root, props.initialDepth ?? 2, EXPAND_ALL_LIMIT, props.pageSize ?? CHILD_PAGE).expanded,
    shown: new Map(),
    selected: "$",
    note: null,
  }));
  const [pathLabel, copyPath] = useCopy("Copy path");
  const [resultsLabel, copyResults] = useCopy("Copy results");
  const [query, setQuery] = useState("");
  const [pausedQuery, setPausedQuery] = useState("");
  const large = source.length > LARGE_SOURCE;
  useEffect(() => {
    if (!large) return;
    const timer = setTimeout(() => setPausedQuery(query), QUERY_DELAY);
    return () => clearTimeout(timer);
  }, [query, large]);
  const deferredQuery = useDeferredValue(large ? pausedQuery : query);
  const found = useMemo(() => findMatches(root, deferredQuery), [root, deferredQuery]);
  const matchIds = useMemo(() => new Set(found.matches.map((match) => formatPath(match.path))), [found]);
  const [current, setCurrent] = useState(0);
  // Bumped when the user asks to move to a match (new query, Enter, ↑/↓); an edit of the data alone does not move the selection.
  const [revealTick, setRevealTick] = useState(0);
  const scrollPending = useRef(false);
  const [seen, setSeen] = useState({ found, query: deferredQuery });
  if (seen.found !== found) {
    let next = 0;
    if (seen.query === deferredQuery) {
      const previous = seen.found.matches[current];
      const previousId = previous ? formatPath(previous.path) : null;
      const kept = previousId === null ? -1 : found.matches.findIndex((match) => formatPath(match.path) === previousId);
      next = kept >= 0 ? kept : 0;
    } else {
      setRevealTick((tick) => tick + 1);
    }
    setSeen({ found, query: deferredQuery });
    setCurrent(next);
  }
  const [valueLabel, copyValue] = useCopy("Copy value");

  const rows = useMemo(
    () => visibleRows(root, state.expanded, state.shown, pageSize),
    [root, state.expanded, state.shown, pageSize],
  );
  // A selected path that no longer exists (after an edit) falls back to the root.
  const index = Math.max(0, rows.findIndex((row) => row.id === state.selected));
  const selectedRow = rows[index]!;
  const target: JsonNode =
    selectedRow.kind === "node"
      ? selectedRow.node
      : (rows.find((row): row is NodeRow => row.kind === "node" && row.id === selectedRow.parentId)?.node ?? root);
  const path = useMemo(() => formatPath(pathOf(root, target) ?? []), [root, target]);
  const domId = (id: string): string => `${baseId}-${id}`;

  useEffect(() => {
    const list = listRef.current;
    const requested = scrollPending.current;
    scrollPending.current = false;
    // Scroll while the user moves inside the tree, or when they jumped to a match from the query bar.
    if (!list || (!requested && !list.contains(document.activeElement))) return;
    document.getElementById(`${baseId}-${selectedRow.id}`)?.scrollIntoView?.({ block: "nearest" });
  }, [baseId, selectedRow.id]);

  const update = (patch: Partial<TreeState>): void => setState((s) => ({ ...s, ...patch }));

  /** Expands the ancestors of `path`, opens the pages that hold it, and selects it. */
  function reveal(path: JsonPath): void {
    setState((s) => {
      const expanded = new Set(s.expanded);
      const shown = new Map(s.shown);
      let node: JsonNode = root;
      for (let depth = 0; depth < path.length; depth++) {
        const part = path[depth]!;
        const parentId = formatPath(path.slice(0, depth));
        expanded.add(parentId);
        let position = -1;
        if (node.type === "array" && typeof part === "number") {
          position = part;
          node = node.items[part]!;
        } else if (node.type === "object") {
          node.members.forEach((member, index) => {
            if (member.key.value === part) position = index;
          });
          node = node.members[position]!.value;
        }
        const limit = shown.get(parentId) ?? pageSize;
        if (position >= limit) shown.set(parentId, (Math.floor(position / pageSize) + 1) * pageSize);
      }
      return { ...s, expanded, shown, selected: formatPath(path), note: null };
    });
  }

  useEffect(() => {
    if (revealTick === 0) return;
    const match = found.matches[current];
    if (!match) return;
    scrollPending.current = true;
    reveal(match.path);
    // Only an explicit request (revealTick) moves the selection; found/current are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealTick]);

  function step(delta: number): void {
    const count = found.matches.length;
    if (count === 0) return;
    setCurrent((index) => (index + delta + count) % count);
    setRevealTick((tick) => tick + 1);
  }

  const status =
    found.error ??
    (found.mode === "none" ? "" : found.matches.length === 0 ? "No matches" : `${current + 1} of ${found.matches.length}`);

  function resultsText(): string {
    const joined = `[${found.matches.map((match) => source.slice(match.node.start, match.node.end)).join(",")}]`;
    const formatted = formatJson(joined);
    return formatted.ok ? formatted.value : joined;
  }

  function toggle(id: string): void {
    setState((s) => {
      const expanded = new Set(s.expanded);
      if (!expanded.delete(id)) expanded.add(id);
      return { ...s, expanded, note: null };
    });
  }

  function showMore(parentId: string, at: number): void {
    setState((s) => {
      const shown = new Map(s.shown);
      shown.set(parentId, (shown.get(parentId) ?? pageSize) + pageSize);
      return { ...s, shown, selected: at > 0 ? rows[at - 1]!.id : s.selected };
    });
  }

  function expandAll(): void {
    const limit = props.expandAllLimit ?? EXPAND_ALL_LIMIT;
    const { expanded, collapsed } = expandBreadthFirst(root, Infinity, limit, pageSize);
    update({ expanded, shown: new Map(), note: collapsed === 0 ? null : limitNote(limit, collapsed) });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const row = selectedRow;
    const next = rows[index + 1];
    let handled = true;
    switch (event.key) {
      case "ArrowDown":
        if (next) update({ selected: next.id });
        break;
      case "ArrowUp":
        if (index > 0) update({ selected: rows[index - 1]!.id });
        break;
      case "Home":
        update({ selected: rows[0]!.id });
        break;
      case "End":
        update({ selected: rows[rows.length - 1]!.id });
        break;
      case "ArrowRight":
        if (row.kind === "node" && hasChildren(row.node)) {
          if (!state.expanded.has(row.id)) toggle(row.id);
          else if (next && next.parentId === row.id) update({ selected: next.id });
        }
        break;
      case "ArrowLeft":
        if (row.kind === "node" && hasChildren(row.node) && state.expanded.has(row.id)) toggle(row.id);
        else if (row.parentId !== null) update({ selected: row.parentId });
        break;
      case "Enter":
      case " ":
        if (row.kind === "more") showMore(row.parentId, index);
        else if (hasChildren(row.node)) toggle(row.id);
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  }

  return (
    <div className={["wk-tree", props.className].filter(Boolean).join(" ")}>
      {props.searchable !== false && (
        <div className="wk-tree__query">
          <input
            type="search"
            className="wk-tree__search"
            aria-label="Search or JSONPath"
            aria-invalid={found.error ? true : undefined}
            aria-describedby={`${baseId}-query-status`}
            placeholder="Search, or JSONPath like $..price"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            }}
          />
          <span id={`${baseId}-query-status`} className="wk-tree__count" aria-live="polite">
            {status}
          </span>
          <button
            type="button"
            className="wk-json__button"
            aria-label="Previous match"
            disabled={found.matches.length < 2}
            onClick={() => step(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="wk-json__button"
            aria-label="Next match"
            disabled={found.matches.length < 2}
            onClick={() => step(1)}
          >
            ↓
          </button>
          {found.mode === "path" && found.matches.length > 0 && (
            <button type="button" className="wk-json__button" onClick={() => copyResults(resultsText())}>
              {resultsLabel}
            </button>
          )}
        </div>
      )}
      <div className="wk-tree__toolbar">
        <button type="button" className="wk-json__button" onClick={expandAll}>
          Expand all
        </button>
        <button
          type="button"
          className="wk-json__button"
          onClick={() => update({ expanded: new Set(), shown: new Map(), selected: "$", note: null })}
        >
          Collapse all
        </button>
      </div>
      {state.note && (
        <p className="wk-tree__note" role="status">
          {state.note}
        </p>
      )}
      <div
        ref={listRef}
        role="tree"
        aria-label="JSON tree"
        tabIndex={0}
        aria-activedescendant={domId(selectedRow.id)}
        className="wk-tree__list"
        onKeyDown={onKeyDown}
      >
        {rows.map((row, at) => {
          if (row.kind === "more") {
            return (
              <div
                key={row.id}
                id={domId(row.id)}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-selected={row.id === selectedRow.id}
                className="wk-tree__row wk-tree__more"
                style={{ paddingLeft: `${row.depth * 1.25 + 1.25}rem` }}
                onClick={() => showMore(row.parentId, at)}
              >
                {`Show ${Math.min(pageSize, row.remaining)} more (${row.remaining} left)`}
              </div>
            );
          }
          const expandable = hasChildren(row.node);
          const open = expandable && state.expanded.has(row.id);
          return (
            <div
              key={row.id}
              id={domId(row.id)}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-posinset={row.position}
              aria-setsize={row.siblings}
              aria-expanded={expandable ? open : undefined}
              aria-selected={row.id === selectedRow.id}
              aria-label={row.label === null ? valueText(row.node) : `${row.label}: ${valueText(row.node)}`}
              className={matchIds.has(row.id) ? "wk-tree__row wk-tree__row--match" : "wk-tree__row"}
              style={{ paddingLeft: `${row.depth * 1.25}rem` }}
              onClick={() => update({ selected: row.id })}
            >
              <span
                className="wk-tree__toggle"
                aria-hidden="true"
                data-state={expandable ? (open ? "open" : "closed") : undefined}
                onClick={(event) => {
                  if (!expandable) return;
                  event.stopPropagation();
                  toggle(row.id);
                  update({ selected: row.id });
                }}
              />
              {row.label !== null && <span className="wk-tree__key">{row.label}</span>}
              {row.label !== null && <span className="wk-tree__colon">: </span>}
              <span className={VALUE_CLASS[row.node.type]}>{valueText(row.node)}</span>
            </div>
          );
        })}
      </div>
      <div className="wk-tree__details">
        <code className="wk-tree__path" aria-label="Selected path">
          {path}
        </code>
        <button type="button" className="wk-json__button" onClick={() => copyPath(path)}>
          {pathLabel}
        </button>
        <button type="button" className="wk-json__button" onClick={() => copyValue(source.slice(target.start, target.end))}>
          {valueLabel}
        </button>
        {onShowInInput && (
          <button type="button" className="wk-json__button" onClick={() => onShowInInput(target.start, target.end)}>
            Show in input
          </button>
        )}
      </div>
    </div>
  );
}
