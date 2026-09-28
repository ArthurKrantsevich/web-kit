import { useCallback, useEffect, useMemo, useState } from "react";
import { generateIds } from "../core/generate";
import { inspectId } from "../core/inspect";
import { ALPHABETS } from "../core/nanoid";
import type { IdInfo, IdKind, NamespaceName, Result } from "../core/types";
import { formatUuid } from "../core/uuid";

export type AlphabetName = keyof typeof ALPHABETS | "custom";

/** Everything the generator is set to: what a share link carries and "Save input" keeps. Never the IDs. */
export interface UuidSettings {
  kind: IdKind;
  /** 1 to 1000; not used by v3 and v5. */
  count: number;
  /** v3 and v5. */
  namespace: NamespaceName | "custom";
  customNamespace: string;
  /** v3 and v5: one name per line. */
  names: string;
  /** NanoID. */
  size: number;
  alphabet: AlphabetName;
  customAlphabet: string;
  /** UUIDs in upper case. */
  upper: boolean;
  hyphens: boolean;
  wrap: "none" | "braces" | "urn";
  /** ULIDs in lower case (their canonical form is upper case). */
  ulidLower: boolean;
  output: "lines" | "json";
}

export const DEFAULT_SETTINGS: UuidSettings = {
  kind: "v4",
  count: 10,
  namespace: "dns",
  customNamespace: "",
  names: "www.example.com\nexample.org",
  size: 21,
  alphabet: "url-safe",
  customAlphabet: "",
  upper: false,
  hyphens: true,
  wrap: "none",
  ulidLower: false,
  output: "lines",
};

export interface UseUuidGeneratorOptions {
  initialSettings?: Partial<UuidSettings>;
}

export interface UseUuidGenerator {
  settings: UuidSettings;
  /** Changes some settings; a change of kind, count or their options makes new IDs. */
  update: (patch: Partial<UuidSettings>) => void;
  /** The IDs, in their canonical form; empty until the page has hydrated (random values cannot be rendered on a server). */
  ids: string[];
  /** The IDs as Copy and Download give them: formatted, one per line or as a JSON array. */
  text: string;
  /**
   * The IDs as the output shows them: `text`, except for v3 and v5, where each UUID is on the line of its name (an
   * empty line of names stays empty) so the Names and IDs columns pair up; as JSON, too.
   */
  shown: string;
  /** v3 and v5: each name with its formatted UUID, empty lines left out; empty for the other kinds. */
  pairs: { name: string; id: string }[];
  /** Why no IDs could be made (a bad namespace or alphabet), or null. */
  error: string | null;
  /** New IDs with the same settings. */
  regenerate: () => void;
  inspectText: string;
  setInspectText: (text: string) => void;
  /** What inspectId says about `inspectText`, or null while it is empty. */
  inspection: Result<IdInfo> | null;
}

/** The lines of the Names field. */
export const nameLines = (names: string): string[] => (names === "" ? [] : names.split(/\r?\n/));

/** Each ID on the line of its name: empty lines stay empty; as JSON, the array's brackets and commas go on those lines. */
function pairWithNames(lines: readonly string[], ids: readonly string[], json: boolean): string {
  const at = lines.flatMap((line, index) => (line === "" ? [] : [index]));
  if (json && ids.length === 0) return "[]";
  const out = lines.map(() => "");
  at.forEach((line, k) => {
    const id = ids[k] ?? "";
    out[line] = json ? `${k === 0 ? "[" : " "}${JSON.stringify(id)}${k === at.length - 1 ? "]" : ","}` : id;
  });
  return out.join("\n");
}

/** The options generateIds needs for these settings. */
export function generateOptions(settings: UuidSettings): Parameters<typeof generateIds>[0] {
  return {
    kind: settings.kind,
    count: settings.count,
    namespace: settings.namespace === "custom" ? settings.customNamespace.trim() : settings.namespace,
    // An empty line (a trailing newline, a blank line between names) is not a name: it makes no UUID.
    names: nameLines(settings.names).filter((name) => name !== ""),
    size: settings.size,
    alphabet: settings.alphabet === "custom" ? settings.customAlphabet : ALPHABETS[settings.alphabet],
  };
}

/** The UUID generator's state without markup: settings, IDs and the inspected ID. */
export function useUuidGenerator(options: UseUuidGeneratorOptions = {}): UseUuidGenerator {
  const [settings, setSettings] = useState<UuidSettings>(() => ({ ...DEFAULT_SETTINGS, ...options.initialSettings }));
  const [round, setRound] = useState(0);
  // The kind the IDs were made as: until new IDs arrive, the old ones keep their own format.
  const [made, setMade] = useState<{ kind: IdKind; ids: string[]; error: string | null; lines: string[] }>({ kind: settings.kind, ids: [], error: null, lines: [] });
  const [inspectText, setInspectText] = useState("");

  const { kind, count, namespace, customNamespace, names, size, alphabet, customAlphabet } = settings;
  // IDs are made after hydration, in the browser: a server render cannot know them.
  useEffect(() => {
    let result: ReturnType<typeof generateIds>;
    try {
      result = generateIds(generateOptions({ ...DEFAULT_SETTINGS, kind, count, namespace, customNamespace, names, size, alphabet, customAlphabet }));
    } catch (error) {
      // A bug in the core must not take the tool down: it becomes a message, and other settings still work.
      result = { ok: false, error: { message: `Could not make the IDs: ${error instanceof Error ? error.message : String(error)}` } };
    }
    const lines = nameLines(names);
    setMade(result.ok ? { kind, ids: result.value, error: null, lines } : { kind, ids: [], error: result.error.message, lines });
  }, [kind, count, namespace, customNamespace, names, size, alphabet, customAlphabet, round]);

  const update = useCallback((patch: Partial<UuidSettings>) => setSettings((current) => ({ ...current, ...patch })), []);
  const regenerate = useCallback(() => setRound((value) => value + 1), []);

  const { text, shown, pairs } = useMemo(() => {
    const format =
      made.kind === "ulid"
        ? ({ case: settings.ulidLower ? "lower" : "upper" } as const)
        : ({ case: settings.upper ? "upper" : "lower", hyphens: settings.hyphens, wrap: settings.wrap } as const);
    // A NanoID is never formatted: one of 32 hex digits or 26 Base32 characters would pass for a UUID or a ULID.
    const formatted = made.kind === "nanoid" ? made.ids : made.ids.map((id) => formatUuid(id, format));
    const json = settings.output === "json";
    const all = json ? JSON.stringify(formatted, null, 2) : formatted.join("\n");
    const named = (made.kind === "v3" || made.kind === "v5") && made.error === null;
    const names = made.lines.filter((line) => line !== "");
    return {
      text: all,
      shown: named ? pairWithNames(made.lines, formatted, json) : all,
      pairs: named ? names.map((name, index) => ({ name, id: formatted[index] ?? "" })) : [],
    };
  }, [made, settings.upper, settings.hyphens, settings.wrap, settings.ulidLower, settings.output]);

  const inspection = useMemo(() => (inspectText.trim() === "" ? null : inspectId(inspectText)), [inspectText]);

  return { settings, update, ids: made.ids, text, shown, pairs, error: made.error, regenerate, inspectText, setInspectText, inspection };
}
