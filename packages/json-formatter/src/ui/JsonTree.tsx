import { formatPath, pathOf, type JsonNode } from "@web-kit/json-core";
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactElement } from "react";
import { CHILD_PAGE, expandBreadthFirst, isContainer, visibleRows, type RowId, type TreeRow } from "./tree-model";
import { useCopy } from "./useCopy";

export interface JsonTreeProps {
  root: JsonNode;
  /** Text the AST was parsed from (without a BOM). "Copy value" copies the node's original text from it. */
  source: string;
  /** Called with the node's range in `source` when the user asks to see it in the input. */
  onShowInInput?: (start: number, end: number) => void;
  /** Levels expanded at first. Default 2. */
  initialDepth?: number;
  className?: string;
}

interface TreeState {
  root: JsonNode;
  expanded: Set<number>;
  shown: Map<number, number>;
  selected: RowId;
  note: string | null;
}

const LIMIT_NOTE = "Expanded as much as fits in 5,000 rows. Expand the rest one by one.";

function freshState(root: JsonNode, depth: number): TreeState {
  return { root, expanded: expandBreadthFirst(root, depth).expanded, shown: new Map(), selected: root.start, note: null };
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
  const initialDepth = props.initialDepth ?? 2;
  const baseId = useId();
  const [state, setState] = useState(() => freshState(root, initialDepth));
  const [pathLabel, copyPath] = useCopy("Copy path");
  const [valueLabel, copyValue] = useCopy("Copy value");

  // New data (for example after an edit): start over instead of keeping ids that no longer exist.
  const current = state.root === root ? state : freshState(root, initialDepth);
  if (current !== state) setState(current);

  const rows = useMemo(() => visibleRows(root, current.expanded, current.shown), [root, current.expanded, current.shown]);
  const index = Math.max(0, rows.findIndex((row) => row.id === current.selected));
  const selectedRow = rows[index]!;
  const target: JsonNode =
    selectedRow.kind === "node"
      ? selectedRow.node
      : (rows.find((row): row is Extract<TreeRow, { kind: "node" }> => row.kind === "node" && row.id === selectedRow.parentId)?.node ?? root);
  const path = useMemo(() => formatPath(pathOf(root, target) ?? []), [root, target]);
  const domId = (id: RowId): string => `${baseId}-${id}`;

  useEffect(() => {
    document.getElementById(domId(current.selected))?.scrollIntoView?.({ block: "nearest" });
  });

  const update = (patch: Partial<TreeState>): void => setState((s) => ({ ...s, ...patch }));

  function toggle(id: number): void {
    setState((s) => {
      const expanded = new Set(s.expanded);
      if (!expanded.delete(id)) expanded.add(id);
      return { ...s, expanded, note: null };
    });
  }

  function showMore(parentId: number, at: number): void {
    setState((s) => {
      const shown = new Map(s.shown);
      shown.set(parentId, (shown.get(parentId) ?? CHILD_PAGE) + CHILD_PAGE);
      return { ...s, shown, selected: at > 0 ? rows[at - 1]!.id : s.selected };
    });
  }

  function expandAll(): void {
    const { expanded, complete } = expandBreadthFirst(root, Infinity);
    update({ expanded, shown: new Map(), note: complete ? null : LIMIT_NOTE });
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
        if (row.kind === "node" && isContainer(row.node)) {
          if (!current.expanded.has(row.id)) toggle(row.id);
          else if (next && next.parentId === row.id) update({ selected: next.id });
        }
        break;
      case "ArrowLeft":
        if (row.kind === "node" && isContainer(row.node) && current.expanded.has(row.id)) toggle(row.id);
        else if (row.parentId !== null) update({ selected: row.parentId });
        break;
      case "Enter":
      case " ":
        if (row.kind === "more") showMore(row.parentId, index);
        else if (isContainer(row.node)) toggle(row.id);
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
          onClick={() => update({ expanded: new Set(), shown: new Map(), selected: root.start, note: null })}
        >
          Collapse all
        </button>
      </div>
      {current.note && (
        <p className="wk-tree__note" role="status">
          {current.note}
        </p>
      )}
      <div
        role="tree"
        aria-label="JSON tree"
        tabIndex={0}
        aria-activedescendant={domId(selectedRow.id)}
        className="wk-tree__list"
        onKeyDown={onKeyDown}
      >
        {rows.map((row, at) =>
          row.kind === "more" ? (
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
          ) : (
            <div
              key={row.id}
              id={domId(row.id)}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-expanded={isContainer(row.node) ? current.expanded.has(row.id) : undefined}
              aria-selected={row.id === selectedRow.id}
              aria-label={row.label === null ? valueText(row.node) : `${row.label}: ${valueText(row.node)}`}
              className="wk-tree__row"
              style={{ paddingLeft: `${row.depth * 1.25}rem` }}
              onClick={() => update({ selected: row.id })}
            >
              <span
                className="wk-tree__toggle"
                aria-hidden="true"
                data-state={isContainer(row.node) ? (current.expanded.has(row.id) ? "open" : "closed") : undefined}
                onClick={(event) => {
                  if (!isContainer(row.node)) return;
                  event.stopPropagation();
                  toggle(row.id);
                  update({ selected: row.id });
                }}
              />
              {row.label !== null && <span className="wk-tree__key">{row.label}</span>}
              {row.label !== null && <span className="wk-tree__colon">: </span>}
              <span className={VALUE_CLASS[row.node.type]}>{valueText(row.node)}</span>
            </div>
          ),
        )}
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
