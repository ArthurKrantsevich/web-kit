import { formatPath, pathOf, type JsonNode } from "@web-kit/json-core";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { CHILD_PAGE, expandBreadthFirst, hasChildren, visibleRows, type TreeRow } from "./tree-model";
import { useCopy } from "./useCopy";

export interface JsonTreeProps {
  root: JsonNode;
  /** Text the AST was parsed from (without a BOM). "Copy value" copies the node's original text from it. */
  source: string;
  /** Called with the node's range in `source` when the user asks to see it in the input. Omit to hide the button. */
  onShowInInput?: (start: number, end: number) => void;
  /** Levels expanded at first. Default 2. */
  initialDepth?: number;
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

function limitNote(collapsed: number): string {
  const what = collapsed === 1 ? "1 container stays" : `${collapsed.toLocaleString("en-US")} containers stay`;
  return `Expanded as much as fits in 5,000 rows. ${what} collapsed; expand them one by one.`;
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
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TreeState>(() => ({
    expanded: expandBreadthFirst(root, props.initialDepth ?? 2).expanded,
    shown: new Map(),
    selected: "$",
    note: null,
  }));
  const [pathLabel, copyPath] = useCopy("Copy path");
  const [valueLabel, copyValue] = useCopy("Copy value");

  const rows = useMemo(() => visibleRows(root, state.expanded, state.shown), [root, state.expanded, state.shown]);
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
    if (!list || !list.contains(document.activeElement)) return;
    document.getElementById(`${baseId}-${selectedRow.id}`)?.scrollIntoView?.({ block: "nearest" });
  }, [baseId, selectedRow.id]);

  const update = (patch: Partial<TreeState>): void => setState((s) => ({ ...s, ...patch }));

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
      shown.set(parentId, (shown.get(parentId) ?? CHILD_PAGE) + CHILD_PAGE);
      return { ...s, shown, selected: at > 0 ? rows[at - 1]!.id : s.selected };
    });
  }

  function expandAll(): void {
    const { expanded, collapsed } = expandBreadthFirst(root, Infinity);
    update({ expanded, shown: new Map(), note: collapsed === 0 ? null : limitNote(collapsed) });
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
                {`Show ${Math.min(CHILD_PAGE, row.remaining)} more (${row.remaining} left)`}
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
              className="wk-tree__row"
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
