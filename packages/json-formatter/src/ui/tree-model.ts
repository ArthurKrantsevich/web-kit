import type { JsonNode } from "@web-kit/json-core";

/** Children shown per click on a large container. */
export const CHILD_PAGE = 500;
/** "Expand all" never shows more rows than this. */
export const EXPAND_ALL_LIMIT = 5000;

export type RowId = number | string;

export type TreeRow =
  | { kind: "node"; id: number; node: JsonNode; label: string | number | null; depth: number; parentId: number | null }
  | { kind: "more"; id: string; parentId: number; depth: number; remaining: number };

export function isContainer(node: JsonNode): boolean {
  return node.type === "object" || node.type === "array";
}

function childrenOf(node: JsonNode): { label: string | number; node: JsonNode }[] {
  if (node.type === "object") return node.members.map((member) => ({ label: member.key.value, node: member.value }));
  if (node.type === "array") return node.items.map((item, index) => ({ label: index, node: item }));
  return [];
}

/** Rows currently on screen. Node ids are `node.start`, unique for value nodes. */
export function visibleRows(
  root: JsonNode,
  expanded: ReadonlySet<number>,
  shown: ReadonlyMap<number, number> = new Map(),
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (node: JsonNode, label: string | number | null, depth: number, parentId: number | null): void => {
    rows.push({ kind: "node", id: node.start, node, label, depth, parentId });
    if (!isContainer(node) || !expanded.has(node.start)) return;
    const children = childrenOf(node);
    const limit = shown.get(node.start) ?? CHILD_PAGE;
    for (const child of children.slice(0, limit)) walk(child.node, child.label, depth + 1, node.start);
    if (children.length > limit) {
      rows.push({ kind: "more", id: `more-${node.start}`, parentId: node.start, depth: depth + 1, remaining: children.length - limit });
    }
  };
  walk(root, null, 0, null);
  return rows;
}

/** Expands containers level by level down to `maxDepth` while the visible rows stay within `budget`. */
export function expandBreadthFirst(
  root: JsonNode,
  maxDepth: number,
  budget: number = EXPAND_ALL_LIMIT,
): { expanded: Set<number>; complete: boolean } {
  const expanded = new Set<number>();
  const queue: { node: JsonNode; depth: number }[] = [{ node: root, depth: 0 }];
  let rows = 1;
  for (let head = 0; head < queue.length; head++) {
    const { node, depth } = queue[head]!;
    if (!isContainer(node) || depth >= maxDepth) continue;
    const children = childrenOf(node);
    const added = Math.min(children.length, CHILD_PAGE) + (children.length > CHILD_PAGE ? 1 : 0);
    if (rows + added > budget) return { expanded, complete: false };
    expanded.add(node.start);
    rows += added;
    for (const child of children.slice(0, CHILD_PAGE)) queue.push({ node: child.node, depth: depth + 1 });
  }
  return { expanded, complete: true };
}
