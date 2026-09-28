import { createIdGenerators, type IdGenerators } from "./generators";
import type { NanoidOptions } from "./nanoid";
import type { IdKind, NamespaceName, Result } from "./types";
import { MAX_UUID, NIL_UUID, uuidV3, uuidV5 } from "./uuid";

export const MAX_COUNT = 1000;

export interface GenerateOptions extends NanoidOptions {
  kind: IdKind;
  /** 1 to 1000; default 1. v3 and v5 make one ID per name instead. */
  count?: number;
  /** v3 and v5: "dns", "url", "oid", "x500" or a UUID. Default "dns". */
  namespace?: NamespaceName | string;
  /** v3 and v5: one ID per name, in order; at most 1000. */
  names?: readonly string[];
}

let shared: IdGenerators | null = null;

/** The generators every call without its own set shares, so v7, ULID, v1 and v6 keep increasing across calls. */
export function defaultGenerators(): IdGenerators {
  shared ??= createIdGenerators();
  return shared;
}

/** One kind of ID, `count` times (v3 and v5: one per name). Refuses a count, name list, namespace or alphabet it cannot use. */
export function generateIds(options: GenerateOptions, generators: IdGenerators = defaultGenerators()): Result<string[]> {
  const { kind } = options;
  if (kind === "v3" || kind === "v5") {
    const names = options.names ?? [];
    if (names.length > MAX_COUNT) return { ok: false, error: { message: `At most ${MAX_COUNT} names at a time` } };
    const ids: string[] = [];
    for (const name of names) {
      const id = (kind === "v3" ? uuidV3 : uuidV5)(options.namespace ?? "dns", name);
      if (!id.ok) return id;
      ids.push(id.value);
    }
    return { ok: true, value: ids };
  }
  const count = options.count ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    return { ok: false, error: { message: `The count must be a whole number from 1 to ${MAX_COUNT}` } };
  }
  if (kind === "nanoid") {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = generators.nanoid(options);
      if (!id.ok) return id;
      ids.push(id.value);
    }
    return { ok: true, value: ids };
  }
  const make: () => string =
    kind === "v4"
      ? generators.uuidV4
      : kind === "v7"
        ? () => generators.uuidV7()
        : kind === "v1"
          ? () => generators.uuidV1()
          : kind === "v6"
            ? () => generators.uuidV6()
            : kind === "ulid"
              ? () => generators.ulid()
              : () => (kind === "nil" ? NIL_UUID : MAX_UUID);
  return { ok: true, value: Array.from({ length: count }, make) };
}

/** A random UUID v4. */
export const uuidV4 = (): string => defaultGenerators().uuidV4();
/** A UUID v7; values from one page strictly increase. */
export const uuidV7 = (now?: number): string => defaultGenerators().uuidV7(now);
/** A UUID v1 with a random node (never a MAC address). */
export const uuidV1 = (now?: number): string => defaultGenerators().uuidV1(now);
/** A UUID v6 with a random node. */
export const uuidV6 = (now?: number): string => defaultGenerators().uuidV6(now);
/** A ULID; values from one page strictly increase. */
export const ulid = (now?: number): string => defaultGenerators().ulid(now);
/** A NanoID: 21 URL-safe characters by default. */
export const nanoid = (options?: NanoidOptions): Result<string> => defaultGenerators().nanoid(options);
