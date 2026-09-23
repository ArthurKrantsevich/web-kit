import type { JsonNode, JsonPath } from "./types";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** `$.users[0]["weird key"]` */
export function formatPath(path: JsonPath): string {
  let out = "$";
  for (const part of path) {
    if (typeof part === "number") out += `[${part}]`;
    else if (IDENTIFIER.test(part)) out += `.${part}`;
    else out += `[${JSON.stringify(part)}]`;
  }
  return out;
}

/** Path from the root to `target` (compared by identity), or null if `target` is not in this tree. */
export function pathOf(root: JsonNode, target: JsonNode): JsonPath | null {
  const path: JsonPath = [];
  const visit = (node: JsonNode): boolean => {
    if (node === target) return true;
    if (target.start < node.start || target.end > node.end) return false;
    if (node.type === "object") {
      for (const member of node.members) {
        path.push(member.key.value);
        if (visit(member.value)) return true;
        path.pop();
      }
    } else if (node.type === "array") {
      for (let index = 0; index < node.items.length; index++) {
        path.push(index);
        if (visit(node.items[index]!)) return true;
        path.pop();
      }
    }
    return false;
  };
  return visit(root) ? path : null;
}

/** The deepest value node whose range contains `offset`. Inside a key, returns that member's value. */
export function nodeAt(root: JsonNode, offset: number): JsonNode | null {
  if (offset < root.start || offset >= root.end) return null;
  let node: JsonNode = root;
  for (;;) {
    let next: JsonNode | undefined;
    if (node.type === "object") {
      for (const member of node.members) {
        if (offset >= member.key.start && offset < member.value.end) {
          if (offset < member.value.start) return member.value;
          next = member.value;
          break;
        }
      }
    } else if (node.type === "array") {
      next = node.items.find((item) => offset >= item.start && offset < item.end);
    }
    if (!next) return node;
    node = next;
  }
}

/** Follows a path. Negative array indexes count from the end. Duplicate keys: the last one wins, as in JSON.parse. */
export function getAt(root: JsonNode, path: JsonPath): JsonNode | null {
  let node: JsonNode = root;
  for (const part of path) {
    if (typeof part === "number") {
      if (node.type !== "array") return null;
      const item = node.items[part < 0 ? node.items.length + part : part];
      if (!item) return null;
      node = item;
    } else {
      if (node.type !== "object") return null;
      let found: JsonNode | null = null;
      for (const member of node.members) if (member.key.value === part) found = member.value;
      if (!found) return null;
      node = found;
    }
  }
  return node;
}
