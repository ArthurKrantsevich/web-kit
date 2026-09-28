import {
  ActionButton,
  Button,
  CopyButton,
  downloadText,
  EditorPane,
  EditorPanes,
  EditorShell,
  EditorToolbar,
  EmptyState,
  Menu,
  NumberField,
  OptionStack,
  PasteButton,
  Segmented,
  Select,
  StatusLine,
  ToolMenu,
  useHydrated,
  type MenuItem,
  type SelectOption,
  type Shortcut,
} from "@web-kit/ui";
import { useId, useMemo, useState, type ReactElement } from "react";
import { MAX_COUNT } from "../core/generate";
import { ALPHABETS } from "../core/nanoid";
import type { IdInfo, IdKind, NamespaceName } from "../core/types";
import { useUuidGenerator, type AlphabetName, type UseUuidGeneratorOptions, type UuidSettings } from "./useUuidGenerator";

export interface UuidGeneratorProps extends UseUuidGeneratorOptions {
  className?: string;
}

const KINDS: SelectOption<IdKind>[] = [
  { value: "v4", label: "UUID v4", description: "Random", group: "UUID" },
  { value: "v7", label: "UUID v7", description: "Time-ordered: Unix milliseconds, then random", group: "UUID" },
  { value: "v1", label: "UUID v1", description: "Time, clock sequence and a random node", group: "UUID" },
  { value: "v6", label: "UUID v6", description: "Version 1 reordered to sort by time", group: "UUID" },
  { value: "v5", label: "UUID v5", description: "SHA-1 of a namespace and a name", group: "UUID" },
  { value: "v3", label: "UUID v3", description: "MD5 of a namespace and a name", group: "UUID" },
  { value: "nil", label: "Nil UUID", description: "All zeros", group: "UUID" },
  { value: "max", label: "Max UUID", description: "All ones", group: "UUID" },
  { value: "ulid", label: "ULID", description: "Time-ordered, 26 characters", group: "Other" },
  { value: "nanoid", label: "NanoID", description: "Random, URL-safe, 21 characters", group: "Other" },
];

/** What each kind is, and the facts that decide when to use it. */
const ABOUT: Record<IdKind, string> = {
  v4: "122 random bits: the usual choice for an ID nobody can guess.",
  v7: "Unix time in milliseconds, then random bits: sorts by creation time, good for database keys.",
  v1: "Gregorian time, a clock sequence and a random node (never your MAC address).",
  v6: "Version 1's fields reordered so the IDs sort by time.",
  v5: "SHA-1 of a namespace and a name: the same name always gives the same UUID.",
  v3: "MD5 of a namespace and a name; prefer version 5 for new systems.",
  nil: "All 128 bits zero: a placeholder that means “no UUID”.",
  max: "All 128 bits one: the largest UUID, used as a sentinel.",
  ulid: "48-bit time and 80 random bits in 26 characters of Crockford's Base32; sorts by time.",
  nanoid: "Random characters from an alphabet, without bias.",
};

const FACTS: Record<Exclude<IdKind, "nanoid">, string> = {
  v4: "122 random bits · a 50% chance of one repeat only after about 2.7 × 10¹⁸ IDs",
  v7: "48-bit milliseconds (until the year 10889) · 12-bit counter · 62 random bits",
  v1: "60-bit time in 100 ns steps (until the year 5236) · 14-bit clock sequence · 48-bit node",
  v6: "60-bit time in 100 ns steps (until the year 5236) · 14-bit clock sequence · 48-bit node",
  v5: "122 bits of SHA-1 · the same namespace and name, the same UUID",
  v3: "122 bits of MD5 · the same namespace and name, the same UUID",
  nil: "RFC 9562 §5.9",
  max: "RFC 9562 §5.10",
  ulid: "48-bit milliseconds · 80 random bits · counts up by one within a millisecond",
};

const NAMESPACES: SelectOption<NamespaceName | "custom">[] = [
  { value: "dns", label: "DNS", description: "Domain names" },
  { value: "url", label: "URL", description: "URLs" },
  { value: "oid", label: "OID", description: "ISO object identifiers" },
  { value: "x500", label: "X.500", description: "X.500 distinguished names" },
  { value: "custom", label: "Custom", description: "Your own namespace UUID" },
];

const ALPHABET_OPTIONS: SelectOption<AlphabetName>[] = [
  { value: "url-safe", label: "URL-safe", description: "A–Z, a–z, 0–9, _ and -" },
  { value: "alphanumeric", label: "Alphanumeric", description: "A–Z, a–z and 0–9" },
  { value: "numbers", label: "Numbers", description: "0–9" },
  { value: "lowercase", label: "Lowercase", description: "a–z" },
  { value: "custom", label: "Custom", description: "Your own characters" },
];

const OUTPUTS = [
  { value: "lines", label: "Lines", tooltip: "One ID per line" },
  { value: "json", label: "JSON", tooltip: "A JSON array of strings" },
] as const;

/** The panel of the options zone each kind uses. */
const PANEL: Record<IdKind, "plain" | "name" | "nanoid"> = {
  v1: "plain",
  v3: "name",
  v4: "plain",
  v5: "name",
  v6: "plain",
  v7: "plain",
  nil: "plain",
  max: "plain",
  ulid: "plain",
  nanoid: "nanoid",
};

const plural = (count: number, word: string) => `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;

/** What the ID kind is called in the status line. */
function noun(kind: IdKind, count: number): string {
  if (kind === "ulid") return plural(count, "ULID");
  if (kind === "nanoid") return plural(count, "NanoID");
  if (kind === "nil" || kind === "max") return `${plural(count, `${kind === "nil" ? "Nil" : "Max"} UUID`)}`;
  return `${plural(count, "UUID")}, version ${kind.slice(1)}`;
}

/** The fields inspectId read, as label and value. */
function rows(info: IdInfo): [string, string][] {
  const list: [string, string][] = [["What", info.description], [info.kind === "ulid" ? "ULID" : "Canonical", info.canonical]];
  if (info.variant) list.push(["Variant", info.variant === "rfc9562" ? "RFC 9562 (10xx)" : info.variant === "ncs" ? "NCS (0xxx)" : info.variant === "microsoft" ? "Microsoft (110x)" : "Future (111x)"]);
  if (info.version !== undefined) list.push(["Version", String(info.version)]);
  if (info.time !== undefined) list.push(["Time (UTC)", info.time]);
  if (info.clockSequence !== undefined) list.push(["Clock sequence", String(info.clockSequence)]);
  if (info.node !== undefined) list.push(["Node", `${info.node} (${info.nodeRandom ? "random: the multicast bit is set" : "a MAC address"})`]);
  if (info.uuid !== undefined) list.push(["As a UUID", info.uuid]);
  return list;
}

/** Ready-made UUID, ULID and NanoID generator. Import "@web-kit/uuid-generator/styles.css" once for the default look. */
export function UuidGenerator(props: UuidGeneratorProps): ReactElement {
  const state = useUuidGenerator(props);
  const { settings, update, ids, text, error } = state;
  const { kind } = settings;
  const [notice, setNotice] = useState("");
  const hydrated = useHydrated();
  const id = useId();
  const panel = PANEL[kind];
  const named = panel === "name";
  const fixed = named || kind === "nil" || kind === "max";
  const uuid = kind !== "ulid" && kind !== "nanoid";

  const nanoBits = useMemo(() => {
    const alphabet = settings.alphabet === "custom" ? settings.customAlphabet : ALPHABETS[settings.alphabet];
    const size = Array.from(new Set(Array.from(alphabet))).length;
    return size < 2 ? 0 : Math.floor(settings.size * Math.log2(size));
  }, [settings.alphabet, settings.customAlphabet, settings.size]);

  const shortcuts: Shortcut[] = [{ keys: "Mod+Enter", label: "Regenerate", run: state.regenerate }];

  /** Puts back a shared or saved state. It comes from outside, so every field is checked. */
  function restore(value: Record<string, unknown>): void {
    const patch: Partial<UuidSettings> = {};
    const pick = <K extends keyof UuidSettings>(key: K, ok: (field: unknown) => boolean) => {
      if (ok(value[key])) patch[key] = value[key] as UuidSettings[K];
    };
    const whole = (min: number, max: number) => (field: unknown) => Number.isInteger(field) && (field as number) >= min && (field as number) <= max;
    const text = (max: number) => (field: unknown) => typeof field === "string" && field.length <= max;
    pick("kind", (field) => KINDS.some((option) => option.value === field));
    pick("count", whole(1, MAX_COUNT));
    pick("namespace", (field) => NAMESPACES.some((option) => option.value === field));
    pick("customNamespace", text(64));
    pick("names", text(100_000));
    pick("size", whole(2, 255));
    pick("alphabet", (field) => ALPHABET_OPTIONS.some((option) => option.value === field));
    pick("customAlphabet", text(256));
    for (const key of ["upper", "hyphens", "ulidLower"] as const) pick(key, (field) => typeof field === "boolean");
    pick("wrap", (field) => field === "none" || field === "braces" || field === "urn");
    pick("output", (field) => field === "lines" || field === "json");
    update(patch);
  }

  const shared = useMemo(() => ({ ...settings }), [settings]);

  const disabledFormat = uuid ? undefined : kind === "ulid" ? "UUIDs only" : "A NanoID is written as it is";
  const formatItems: MenuItem[] = [
    kind === "ulid"
      ? { label: "Lower case", description: "ULIDs are upper case by default", checked: settings.ulidLower, keepOpen: true, onSelect: () => update({ ulidLower: !settings.ulidLower }) }
      : { label: "Upper case", checked: settings.upper, keepOpen: true, disabled: !uuid, description: disabledFormat, onSelect: () => update({ upper: !settings.upper }) },
    { label: "Hyphens", checked: settings.hyphens, keepOpen: true, disabled: !uuid, description: disabledFormat, onSelect: () => update({ hyphens: !settings.hyphens }) },
    ...(
      [
        ["none", "No wrapping"],
        ["braces", "Braces {…}"],
        ["urn", "URN urn:uuid:…"],
      ] as const
    ).map(([wrap, label]) => ({
      label,
      radio: true,
      checked: settings.wrap === wrap,
      keepOpen: true,
      disabled: !uuid,
      description: disabledFormat,
      onSelect: () => update({ wrap }),
    })),
  ];

  const toolbar = (
    <EditorToolbar>
      <span className="wk-ui-field" aria-hidden="true">
        Kind
      </span>
      <Select label="Kind" value={kind} options={KINDS} onChange={(next) => update({ kind: next })} widest />
      {/* v3 and v5 make one ID per name: Count keeps its place, unseen, so nothing next to it moves. */}
      <span className="wk-uuid__count" data-hidden={named} inert={named} aria-hidden={named || undefined}>
        <NumberField label="Count" value={settings.count} min={1} max={MAX_COUNT} onChange={(count) => update({ count })} />
      </span>
      <Menu look="field" label="Format" tooltip="Case, hyphens and wrapping of the IDs" items={formatItems} />
      <Segmented label="Output" value={settings.output} options={[...OUTPUTS]} onChange={(output) => update({ output })} />
      <span className="wk-ui-spacer" />
      <ActionButton
        action="custom"
        icon="generate"
        tooltip={fixed ? (named ? "Name-based UUIDs are the same every time" : "This UUID never changes") : "Make new IDs (Ctrl+Enter)"}
        aria-disabled={fixed || error !== null || undefined}
        onClick={() => {
          if (!fixed && error === null) state.regenerate();
        }}
      >
        Regenerate
      </ActionButton>
      <ToolMenu
        toolKey="uuid-generator"
        state={shared}
        onRestore={restore}
        urlTargets={[]}
        shortcuts={shortcuts}
        onNotice={setNotice}
        dropHint="Paste an ID into Inspect; files are not opened here"
      />
    </EditorToolbar>
  );

  /** What the kind is, and its facts in a second, quieter line. */
  const about = (shown: IdKind, facts: string = FACTS[shown as keyof typeof FACTS]): ReactElement => (
    <div className="wk-uuid__about">
      <p>{ABOUT[shown]}</p>
      <p className="wk-uuid__facts">{facts}</p>
    </div>
  );

  const options = (
    <OptionStack
      className="wk-uuid__options"
      label={`Options for ${KINDS.find((option) => option.value === kind)!.label}`}
      active={panel}
      panels={{
        plain: about(kind === "nanoid" || PANEL[kind] !== "plain" ? "v4" : kind),
        name: (
          <>
            {about(kind === "v3" ? "v3" : "v5")}
            <span className="wk-uuid__namespace">
              <span className="wk-uuid__pair">
                <span className="wk-ui-field" aria-hidden="true">
                  Namespace
                </span>
                <Select label="Namespace" value={settings.namespace} options={NAMESPACES} onChange={(namespace) => update({ namespace })} widest />
              </span>
              <input
                className="wk-ui-input wk-uuid__custom"
                aria-label="Namespace UUID"
                placeholder="Namespace UUID"
                maxLength={64}
                spellCheck={false}
                readOnly={!hydrated}
                value={settings.customNamespace}
                data-hidden={settings.namespace !== "custom"}
                inert={settings.namespace !== "custom"}
                onChange={(event) => update({ customNamespace: event.target.value })}
              />
            </span>
            <textarea
              className="wk-ui-area wk-uuid__names"
              aria-label="Names"
              placeholder="Names, one per line"
              rows={3}
              spellCheck={false}
              readOnly={!hydrated}
              value={settings.names}
              onChange={(event) => update({ names: event.target.value })}
            />
          </>
        ),
        nanoid: (
          <>
            {about("nanoid", `${nanoBits} random bits in ${settings.size} characters`)}
            <span className="wk-uuid__namespace">
              <span className="wk-uuid__pair">
                <NumberField label="Size" value={settings.size} min={2} max={255} onChange={(size) => update({ size })} />
              </span>
              <span className="wk-uuid__pair">
                <span className="wk-ui-field" aria-hidden="true">
                  Alphabet
                </span>
                <Select label="Alphabet" value={settings.alphabet} options={ALPHABET_OPTIONS} onChange={(alphabet) => update({ alphabet })} widest />
              </span>
              <input
                className="wk-ui-input wk-uuid__custom"
                aria-label="Custom alphabet"
                placeholder="Your characters"
                maxLength={256}
                spellCheck={false}
                readOnly={!hydrated}
                value={settings.customAlphabet}
                data-hidden={settings.alphabet !== "custom"}
                inert={settings.alphabet !== "custom"}
                onChange={(event) => update({ customAlphabet: event.target.value })}
              />
            </span>
          </>
        ),
      }}
    />
  );

  const json = settings.output === "json";
  const file = json ? "uuids.json" : "uuids.txt";
  const inspection = state.inspection;
  const status = (
    <StatusLine state={error ? "error" : "idle"}>
      <span role="status">{error ?? (ids.length === 0 ? (named ? "Type names, one per line, to make their UUIDs." : "") : noun(kind, ids.length))}</span>
      {notice && (
        <span className="wk-uuid__notice" title={notice}>
          {notice}
        </span>
      )}
    </StatusLine>
  );

  return (
    <EditorShell className={["wk-uuid", props.className].filter(Boolean).join(" ")} toolbar={toolbar} status={status}>
      {options}
      <EditorPanes>
        <EditorPane
          kind="output"
          className="wk-uuid__pane--output"
          title="IDs"
          labelFor={`${id}-ids`}
          meta={ids.length === 0 ? undefined : plural(ids.length, "ID")}
          actions={
            <>
              <ActionButton
                action="download"
                words={{ what: "the IDs", file }}
                disabled={text === ""}
                onClick={() => downloadText(text, file, json ? "application/json" : "text/plain")}
              />
              <CopyButton text={text} tooltip="Copy every ID to the clipboard" variant="quiet" icon />
            </>
          }
        >
          <textarea id={`${id}-ids`} className="wk-ui-area wk-uuid__ids" readOnly value={text} spellCheck={false} placeholder={named ? "One UUID per name" : ""} />
        </EditorPane>
        <EditorPane
          kind="input"
          className="wk-uuid__pane--inspect"
          title="Inspect"
          labelFor={`${id}-inspect`}
          actions={<PasteButton aria-label="Paste into Inspect" words={{ into: " into Inspect" }} onText={state.setInspectText} onError={setNotice} />}
        >
          <div className="wk-uuid__inspect">
            <input
              id={`${id}-inspect`}
              className="wk-ui-input wk-uuid__id"
              placeholder="A UUID or a ULID"
              spellCheck={false}
              autoComplete="off"
              maxLength={128}
              readOnly={!hydrated}
              value={state.inspectText}
              onChange={(event) => state.setInspectText(event.target.value)}
            />
            <div className="wk-uuid__result" role="status" aria-live="polite">
              {inspection === null ? (
                <EmptyState
                  size="sm"
                  icon="search"
                  title="Paste a UUID or a ULID to read it."
                  action={
                    ids.length > 0 && kind !== "nanoid" ? (
                      <Button variant="outline" onClick={() => state.setInspectText(ids[0]!)}>
                        Inspect the first ID
                      </Button>
                    ) : undefined
                  }
                />
              ) : inspection.ok ? (
                <dl className="wk-uuid__fields">
                  {rows(inspection.value).map(([label, value]) => (
                    <div key={label} className="wk-uuid__field">
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="wk-ui-problem wk-uuid__problem">{inspection.error.message}</p>
              )}
            </div>
          </div>
        </EditorPane>
      </EditorPanes>
    </EditorShell>
  );
}
