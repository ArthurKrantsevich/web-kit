import type { JsonNode } from "./types";

export type Primitive = "string" | "number" | "boolean" | "null";

export interface ObjectShape {
  fields: Map<string, TypeShape>;
  /** In how many of the merged objects each key appeared. */
  counts: Map<string, number>;
  /** How many objects were merged. A key is optional when its count is below this. */
  samples: number;
}

/** Everything a value was seen to be: a set of primitives, at most one object shape, at most one array shape. */
export interface TypeShape {
  primitives: Set<Primitive>;
  object: ObjectShape | null;
  /** `item` is null when only empty arrays were seen. */
  array: { item: TypeShape | null } | null;
}

/** Structural type of a JSON value. Duplicate keys: the last value wins, like JSON.parse. */
export function inferShape(node: JsonNode): TypeShape {
  const shape: TypeShape = { primitives: new Set(), object: null, array: null };
  if (node.type === "object") {
    const fields = new Map<string, TypeShape>();
    for (const member of node.members) fields.set(member.key.value, inferShape(member.value));
    shape.object = { fields, counts: new Map([...fields.keys()].map((key) => [key, 1])), samples: 1 };
  } else if (node.type === "array") {
    let item: TypeShape | null = null;
    for (const element of node.items) {
      const next = inferShape(element);
      item = item ? mergeShapes(item, next) : next;
    }
    shape.array = { item };
  } else {
    shape.primitives.add(node.type);
  }
  return shape;
}

export function mergeShapes(a: TypeShape, b: TypeShape): TypeShape {
  return {
    primitives: new Set([...a.primitives, ...b.primitives]),
    object: a.object && b.object ? mergeObjects(a.object, b.object) : (a.object ?? b.object),
    array:
      a.array && b.array
        ? { item: a.array.item && b.array.item ? mergeShapes(a.array.item, b.array.item) : (a.array.item ?? b.array.item) }
        : (a.array ?? b.array),
  };
}

function mergeObjects(a: ObjectShape, b: ObjectShape): ObjectShape {
  const fields = new Map(a.fields);
  const counts = new Map(a.counts);
  for (const [key, shape] of b.fields) {
    const previous = fields.get(key);
    fields.set(key, previous ? mergeShapes(previous, shape) : shape);
    counts.set(key, (counts.get(key) ?? 0) + (b.counts.get(key) ?? 0));
  }
  return { fields, counts, samples: a.samples + b.samples };
}
