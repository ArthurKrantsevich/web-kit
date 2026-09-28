import {
  ActionButton,
  CopyButton,
  downloadText,
  EditorPane,
  EditorPanes,
  EditorShell,
  EditorToolbar,
  EmptyState,
  NumberField,
  OptionStack,
  Segmented,
  Select,
  StatusLine,
  ToolMenu,
  useHydrated,
  type SegmentedOption,
  type SelectOption,
  type Shortcut,
} from "@web-kit/ui";
import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { MAX_LENGTH, MIN_LENGTH } from "../core/charset";
import { MAX_GROUPS, MAX_SYLLABLES, MIN_GROUPS, MIN_SYLLABLES } from "../core/memorable";
import { MAX_SEPARATOR, MAX_WORDS, MIN_WORDS } from "../core/passphrase";
import { MAX_PIN, MIN_PIN } from "../core/pin";
import {
  DEFAULT_SETTINGS,
  describeSettings,
  MAX_COUNT,
  usePasswordGenerator,
  type Mode,
  type PasswordSettings,
  type Separator,
  type UsePasswordGeneratorOptions,
} from "./usePasswordGenerator";

export interface PasswordGeneratorProps extends UsePasswordGeneratorOptions {
  className?: string;
}

const MODES: SegmentedOption<Mode>[] = [
  { value: "characters", label: "Characters", tooltip: "Random characters from the sets you choose" },
  { value: "words", label: "Words", tooltip: "Random words from the EFF list of 7,776" },
  { value: "memorable", label: "Memorable", tooltip: "Syllables you can say, such as Bolanu-Tekiro" },
  { value: "pin", label: "PIN", tooltip: "Digits only, without obvious PINs" },
];

const SEPARATORS: SelectOption<Separator>[] = [
  { value: "-", label: "Hyphen", description: "word-word" },
  { value: " ", label: "Space", description: "word word" },
  { value: ".", label: "Period", description: "word.word" },
  { value: "_", label: "Underscore", description: "word_word" },
  { value: "custom", label: "Custom", description: "Your own, up to 16 characters" },
];

const STRENGTH_LABEL = { weak: "Weak", fair: "Fair", strong: "Strong", "very strong": "Very strong" } as const;
const NOUN: Record<Mode, [string, string]> = {
  characters: ["password", "passwords"],
  words: ["passphrase", "passphrases"],
  memorable: ["password", "passwords"],
  pin: ["PIN", "PINs"],
};

/** A switch (a checkbox with role="switch") with its label. */
function Switch({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (checked: boolean) => void; title?: string }): ReactElement {
  return (
    <label className="wk-ui-switch" title={title}>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/** Ready-made password, passphrase and PIN generator. Import "@web-kit/password-generator/styles.css" once for the default look. */
export function PasswordGenerator(props: PasswordGeneratorProps): ReactElement {
  const state = usePasswordGenerator(props);
  const { settings, update, passwords, error, estimate } = state;
  const { mode } = settings;
  const [notice, setNotice] = useState("");
  const hydrated = useHydrated();
  const [singular, plural] = NOUN[mode];

  const shortcuts: Shortcut[] = [{ keys: "Mod+Enter", label: "Regenerate", run: state.regenerate }];
  const shared = useMemo(() => ({ ...settings }), [settings]);

  /** Puts back a shared or saved state. It comes from outside, so every field is checked. */
  function restore(value: Record<string, unknown>): void {
    const patch: Partial<PasswordSettings> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof PasswordSettings)[]) {
      const field = value[key];
      const expected = DEFAULT_SETTINGS[key];
      if (typeof field !== typeof expected) continue;
      if (typeof field === "string" && field.length > 128) continue;
      (patch as Record<string, unknown>)[key] = field;
    }
    const whole = (key: keyof PasswordSettings, min: number, max: number) => {
      const field = patch[key];
      if (field !== undefined && (!Number.isInteger(field) || (field as number) < min || (field as number) > max)) delete patch[key];
    };
    whole("count", 1, MAX_COUNT);
    whole("length", MIN_LENGTH, MAX_LENGTH);
    whole("words", MIN_WORDS, MAX_WORDS);
    whole("groups", MIN_GROUPS, MAX_GROUPS);
    whole("syllables", MIN_SYLLABLES, MAX_SYLLABLES);
    whole("pinLength", MIN_PIN, MAX_PIN);
    if (patch.mode !== undefined && !MODES.some((option) => option.value === patch.mode)) delete patch.mode;
    for (const key of ["wordSeparator", "memorableSeparator"] as const) {
      if (patch[key] !== undefined && !SEPARATORS.some((option) => option.value === patch[key])) delete patch[key];
    }
    update(patch);
  }

  const separator = (choice: "wordSeparator" | "memorableSeparator", custom: "wordCustom" | "memorableCustom"): ReactNode => (
    <>
      <span className="wk-password__pair">
        <span className="wk-ui-field" aria-hidden="true">
          Separator
        </span>
        <Select label="Separator" value={settings[choice]} options={SEPARATORS} onChange={(next) => update({ [choice]: next })} widest />
      </span>
      <input
        className="wk-ui-input wk-password__custom"
        aria-label="Custom separator"
        placeholder="Separator"
        maxLength={MAX_SEPARATOR}
        spellCheck={false}
        readOnly={!hydrated}
        value={settings[custom]}
        data-hidden={settings[choice] !== "custom"}
        inert={settings[choice] !== "custom"}
        onChange={(event) => update({ [custom]: event.target.value })}
      />
    </>
  );

  const toolbar = (
    <EditorToolbar>
      <Segmented label="Mode" value={mode} options={MODES} onChange={(next) => update({ mode: next })} />
      <NumberField label="Count" value={settings.count} min={1} max={MAX_COUNT} onChange={(count) => update({ count })} />
      <span className="wk-ui-spacer" />
      <ActionButton
        action="custom"
        icon="generate"
        tooltip={error ?? "Make new passwords (Ctrl+Enter)"}
        aria-disabled={error !== null || undefined}
        onClick={() => {
          if (error === null) state.regenerate();
        }}
      >
        Regenerate
      </ActionButton>
      <ActionButton action="clear" words={{ target: "the list of passwords" }} disabled={passwords.length === 0} onClick={state.clear} />
      <ToolMenu
        toolKey="password-generator"
        state={shared}
        onRestore={restore}
        urlTargets={[]}
        shortcuts={shortcuts}
        onNotice={setNotice}
        dropHint="The password generator does not open files"
      />
    </EditorToolbar>
  );

  const options = (
    <OptionStack
      className="wk-password__options"
      label={`Options for ${MODES.find((option) => option.value === mode)!.label}`}
      active={mode}
      panels={{
        characters: (
          <>
            <span className="wk-password__pair">
              <NumberField label="Length" value={settings.length} min={MIN_LENGTH} max={MAX_LENGTH} onChange={(length) => update({ length })} />
            </span>
            <input
              className="wk-password__slider"
              type="range"
              min={MIN_LENGTH}
              max={64}
              value={Math.min(settings.length, 64)}
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => update({ length: Number(event.target.value) })}
            />
            <Switch label="Lowercase" checked={settings.lower} onChange={(lower) => update({ lower })} />
            <Switch label="Uppercase" checked={settings.upper} onChange={(upper) => update({ upper })} />
            <Switch label="Digits" checked={settings.digits} onChange={(digits) => update({ digits })} />
            <Switch label="Symbols" checked={settings.symbols} onChange={(symbols) => update({ symbols })} />
            <Switch
              label="Exclude ambiguous"
              title="Leaves out I, l, 1, O, 0 and o"
              checked={settings.excludeAmbiguous}
              onChange={(excludeAmbiguous) => update({ excludeAmbiguous })}
            />
            <Switch label="Require each" title="At least one character of every chosen set" checked={settings.requireEach} onChange={(requireEach) => update({ requireEach })} />
            <span className="wk-password__pair">
              <span className="wk-ui-field" aria-hidden="true">
                Exclude
              </span>
              <input
                className="wk-ui-input wk-password__exclude"
                aria-label="Exclude"
                placeholder="Characters"
                maxLength={64}
                spellCheck={false}
                readOnly={!hydrated}
                value={settings.exclude}
                onChange={(event) => update({ exclude: event.target.value })}
              />
            </span>
          </>
        ),
        words: (
          <>
            <span className="wk-password__pair">
              <NumberField label="Words" value={settings.words} min={MIN_WORDS} max={MAX_WORDS} onChange={(words) => update({ words })} />
            </span>
            {separator("wordSeparator", "wordCustom")}
            <Switch label="Capitalize" checked={settings.wordCapitalize} onChange={(wordCapitalize) => update({ wordCapitalize })} />
            <Switch label="Include a number" checked={settings.wordNumber} onChange={(wordNumber) => update({ wordNumber })} />
          </>
        ),
        memorable: (
          <>
            <span className="wk-password__pair">
              <NumberField label="Groups" value={settings.groups} min={MIN_GROUPS} max={MAX_GROUPS} onChange={(groups) => update({ groups })} />
            </span>
            <span className="wk-password__pair">
              <NumberField
                label="Syllables"
                aria-label="Syllables per group"
                value={settings.syllables}
                min={MIN_SYLLABLES}
                max={MAX_SYLLABLES}
                onChange={(syllables) => update({ syllables })}
              />
            </span>
            {separator("memorableSeparator", "memorableCustom")}
            <Switch label="Capitalize" checked={settings.memorableCapitalize} onChange={(memorableCapitalize) => update({ memorableCapitalize })} />
            <Switch label="Include a number" checked={settings.memorableNumber} onChange={(memorableNumber) => update({ memorableNumber })} />
          </>
        ),
        pin: (
          <>
            <span className="wk-password__pair">
              <NumberField label="Length" aria-label="PIN length" value={settings.pinLength} min={MIN_PIN} max={MAX_PIN} onChange={(pinLength) => update({ pinLength })} />
            </span>
            <p className="wk-password__note">Repeated digits, runs such as 1234, repeated pairs such as 1212 and, for four digits, years are left out.</p>
          </>
        ),
      }}
    />
  );

  const text = passwords.length === 0 ? "" : `${passwords.join("\n")}\n`;
  const level = estimate?.strength ?? null;
  const summary = error ?? (passwords.length === 0 ? (state.loading ? "Loading the word list…" : state.cleared ? "Cleared." : "") : `${passwords.length} ${passwords.length === 1 ? singular : plural} · ${describeSettings(settings)}`);

  const status = (
    <StatusLine state={error ? "error" : "idle"}>
      <span role="status">{summary}</span>
      {notice && <span className="wk-password__notice">{notice}</span>}
    </StatusLine>
  );

  return (
    <EditorShell className={["wk-password", props.className].filter(Boolean).join(" ")} toolbar={toolbar} status={status}>
      {options}
      <EditorPanes>
        <EditorPane
          kind="output"
          className="wk-password__pane"
          title={plural.charAt(0).toUpperCase() + plural.slice(1)}
          actions={
            <>
              <ActionButton
                action="download"
                words={{ what: "the passwords", file: "passwords.txt" }}
                disabled={text === ""}
                onClick={() => downloadText(text, "passwords.txt", "text/plain")}
              />
              <CopyButton text={text} label="Copy all" tooltip="Copy every password, one per line" variant="quiet" icon />
            </>
          }
        >
          <div className="wk-password__body">
            <div className="wk-password__estimate" data-strength={level ?? "none"}>
              <span className="wk-password__meter" aria-hidden="true">
                <span style={{ width: `${Math.min(100, ((estimate?.bits ?? 0) / 128) * 100)}%` }} />
              </span>
              <span className="wk-password__bits">
                {estimate === null
                  ? "No entropy to measure"
                  : `${estimate.bits.toFixed(1)} bits · ${STRENGTH_LABEL[estimate.strength]} · ${estimate.crackTime === "instantly" ? "cracked instantly" : `${estimate.crackTime} to crack`} at 10¹⁰ guesses per second`}
              </span>
            </div>
            {passwords.length > 0 ? (
              <ol className="wk-password__list" aria-label={plural}>
                {passwords.map((password, index) => (
                  <li key={index} className="wk-password__item">
                    <code className="wk-password__value">{password}</code>
                    <CopyButton
                      text={password}
                      aria-label={`Copy ${singular} ${index + 1}`}
                      tooltip={`Copy this ${singular}`}
                      variant="quiet"
                      icon
                      iconOnly
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                size="sm"
                className="wk-password__empty"
                icon={error ? "close" : state.cleared ? "clear" : "generate"}
                title={error ?? (state.cleared ? "Cleared." : state.loading ? "Loading the word list…" : hydrated ? "" : "Passwords are made in your browser.")}
              >
                {state.cleared ? "Regenerate to make new ones. Nothing was kept." : undefined}
              </EmptyState>
            )}
          </div>
        </EditorPane>
      </EditorPanes>
    </EditorShell>
  );
}
