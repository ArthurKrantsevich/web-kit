import { formatPath, type JsonNode } from "@web-kit/json-core";

/** Children shown per click on a large container. */
export const CHILD_PAGE = 500;
/** "Expand all" never shows more rows than this. */
export const EXPAND_ALL_LIMIT = 5000;

/**
 * Rows are identified by their JSON path (`$`, `$.users[0]`), so expansion and selection
 * survive edits that keep the path. Paging rows use `<parent path>#more`.
 */
export type TreeRow =
  | {
      kind: "node";
      id: string;
      node: JsonNode;
      label: string | number | null;
      depth: number;
      parentId: string | null;
      /** 1-based position among siblings, and the sibling count (for aria-posinset / aria-setsize). */
      position: number;
      siblings: number;
    }
  | { kind: "more"; id: string; parentId: string; depth: number; remaining: number };

export function isContainer(node: JsonNode): boolean {
  return node.type === "object" || node.type === "array";
}

/** A container that can actually be expanded: `{}` and `[]` cannot. */
export function hasChildren(node: JsonNode): boolean {
  return (node.type === "object" && node.members.length > 0) || (node.type === "array" && node.items.length > 0);
}

function childrenOf(node: JsonNode): { label: string | number; node: JsonNode }[] {
  if (node.type === "object") return node.members.map((member) => ({ label: member.key.value, node: member.value }));
  if (node.type === "array") return node.items.map((item, index) => ({ label: index, node: item }));
  return [];
}

function childId(parentId: string, label: string | number): string {
  return parentId + formatPath([label]).slice(1);
}

/** Rows currently on screen. */
export function visibleRows(
  root: JsonNode,
  expanded: ReadonlySet<string>,
  shown: ReadonlyMap<string, number> = new Map(),
  pageSize: number = CHILD_PAGE,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (
    node: JsonNode,
    label: string | number | null,
    id: string,
    depth: number,
    parentId: string | null,
    position: number,
    siblings: number,
  ): void => {
    rows.push({ kind: "node", id, node, label, depth, parentId, position, siblings });
    if (!hasChildren(node) || !expanded.has(id)) return;
    const children = childrenOf(node);
    const limit = shown.get(id) ?? pageSize;
    children.slice(0, limit).forEach((child, index) => {
      walk(child.node, child.label, childId(id, child.label), depth + 1, id, index + 1, children.length);
    });
    if (children.length > limit) {
      rows.push({ kind: "more", id: `${id}#more`, parentId: id, depth: depth + 1, remaining: children.length - limit });
    }
  };
  walk(root, null, "$", 0, null, 1, 1);
  return rows;
}

/**
 * Expands containers level by level down to `maxDepth` while the visible rows stay within `budget`.
 * `collapsed` counts the visible containers left collapsed because the budget ran out.
 */
export function expandBreadthFirst(
  root: JsonNode,
  maxDepth: number,
  budget: number = EXPAND_ALL_LIMIT,
  pageSize: number = CHILD_PAGE,
): { expanded: Set<string>; collapsed: number } {
  const expanded = new Set<string>();
  const queue: { node: JsonNode; id: string; depth: number }[] = [{ node: root, id: "$", depth: 0 }];
  let rows = 1;
  for (let head = 0; head < queue.length; head++) {
    const { node, id, depth } = queue[head]!;
    if (!hasChildren(node) || depth >= maxDepth) continue;
    const children = childrenOf(node);
    const added = Math.min(children.length, pageSize) + (children.length > pageSize ? 1 : 0);
    if (rows + added > budget) {
      const collapsed = queue.slice(head).filter((item) => hasChildren(item.node) && item.depth < maxDepth).length;
      return { expanded, collapsed };
    }
    expanded.add(id);
    rows += added;
    for (const child of children.slice(0, pageSize)) {
      queue.push({ node: child.node, id: childId(id, child.label), depth: depth + 1 });
    }
  }
  return { expanded, collapsed: 0 };
}
