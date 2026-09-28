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
  /** The IDs as the output shows them: formatted, one per line or as a JSON array. */
  text: string;
  /** Why no IDs could be made (a bad namespace or alphabet), or null. */
  error: string | null;
  /** New IDs with the same settings. */
  regenerate: () => void;
  inspectText: string;
  setInspectText: (text: string) => void;
  /** What inspectId says about `inspectText`, or null while it is empty. */
  inspection: Result<IdInfo> | null;
}

/** The options generateIds needs for these settings. */
export function generateOptions(settings: UuidSettings): Parameters<typeof generateIds>[0] {
  return {
    kind: settings.kind,
    count: settings.count,
    namespace: settings.namespace === "custom" ? settings.customNamespace.trim() : settings.namespace,
    names: settings.names === "" ? [] : settings.names.split(/\r?\n/),
    size: settings.size,
    alphabet: settings.alphabet === "custom" ? settings.customAlphabet : ALPHABETS[settings.alphabet],
  };
}

/** The UUID generator's state without markup: settings, IDs and the inspected ID. */
export function useUuidGenerator(options: UseUuidGeneratorOptions = {}): UseUuidGenerator {
  const [settings, setSettings] = useState<UuidSettings>(() => ({ ...DEFAULT_SETTINGS, ...options.initialSettings }));
  const [round, setRound] = useState(0);
  // The kind the IDs were made as: until new IDs arrive, the old ones keep their own format.
  const [made, setMade] = useState<{ kind: IdKind; ids: string[]; error: string | null }>({ kind: settings.kind, ids: [], error: null });
  const [inspectText, setInspectText] = useState("");

  const { kind, count, namespace, customNamespace, names, size, alphabet, customAlphabet } = settings;
  // IDs are made after hydration, in the browser: a server render cannot know them.
  useEffect(() => {
    const result = generateIds(generateOptions({ ...DEFAULT_SETTINGS, kind, count, namespace, customNamespace, names, size, alphabet, customAlphabet }));
    setMade(result.ok ? { kind, ids: result.value, error: null } : { kind, ids: [], error: result.error.message });
  }, [kind, count, namespace, customNamespace, names, size, alphabet, customAlphabet, round]);

  const update = useCallback((patch: Partial<UuidSettings>) => setSettings((current) => ({ ...current, ...patch })), []);
  const regenerate = useCallback(() => setRound((value) => value + 1), []);

  const text = useMemo(() => {
    const format =
      made.kind === "ulid"
        ? ({ case: settings.ulidLower ? "lower" : "upper" } as const)
        : ({ case: settings.upper ? "upper" : "lower", hyphens: settings.hyphens, wrap: settings.wrap } as const);
    // formatUuid leaves a NanoID as it is.
    const formatted = made.ids.map((id) => formatUuid(id, format));
    return settings.output === "json" ? JSON.stringify(formatted, null, 2) : formatted.join("\n");
  }, [made, settings.upper, settings.hyphens, settings.wrap, settings.ulidLower, settings.output]);

  const inspection = useMemo(() => (inspectText.trim() === "" ? null : inspectId(inspectText)), [inspectText]);

  return { settings, update, ids: made.ids, text, error: made.error, regenerate, inspectText, setInspectText, inspection };
}
