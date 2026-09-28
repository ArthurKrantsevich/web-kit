import { useCallback, useEffect, useMemo, useState } from "react";
import { characterPool } from "../core/charset";
import { generateMemorable } from "../core/memorable";
import { EFF_WORDLIST_SIZE, generatePassphrase } from "../core/passphrase";
import { generatePassword } from "../core/password";
import { countObviousPins, generatePin } from "../core/pin";
import { crackTime, entropy, strength } from "../core/strength";
import type { GeneratorOptions, Result, Strength } from "../core/types";

export type Mode = "characters" | "words" | "memorable" | "pin";
export type Separator = "-" | " " | "." | "_" | "custom";

/** Everything the generator is set to: what a share link carries and "Save input" keeps. Never a password. */
export interface PasswordSettings {
  mode: Mode;
  /** 1 to 50 passwords at a time. */
  count: number;
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
  exclude: string;
  requireEach: boolean;
  words: number;
  wordSeparator: Separator;
  wordCustom: string;
  wordCapitalize: boolean;
  wordNumber: boolean;
  groups: number;
  syllables: number;
  memorableSeparator: Separator;
  memorableCustom: string;
  memorableCapitalize: boolean;
  memorableNumber: boolean;
  pinLength: number;
}

export const DEFAULT_SETTINGS: PasswordSettings = {
  mode: "characters",
  count: 5,
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
  exclude: "",
  requireEach: true,
  words: 6,
  wordSeparator: "-",
  wordCustom: "",
  wordCapitalize: false,
  wordNumber: false,
  groups: 3,
  syllables: 3,
  memorableSeparator: "-",
  memorableCustom: "",
  memorableCapitalize: true,
  memorableNumber: true,
  pinLength: 6,
};

export const MAX_COUNT = 50;

/** The core options of the chosen mode. */
export function generatorOptions(settings: PasswordSettings): GeneratorOptions {
  const separator = (choice: Separator, custom: string) => (choice === "custom" ? custom : choice);
  switch (settings.mode) {
    case "characters":
      return {
        mode: "characters",
        length: settings.length,
        lower: settings.lower,
        upper: settings.upper,
        digits: settings.digits,
        symbols: settings.symbols,
        excludeAmbiguous: settings.excludeAmbiguous,
        exclude: settings.exclude,
        requireEach: settings.requireEach,
      };
    case "words":
      return {
        mode: "words",
        words: settings.words,
        separator: separator(settings.wordSeparator, settings.wordCustom),
        capitalize: settings.wordCapitalize,
        includeNumber: settings.wordNumber,
      };
    case "memorable":
      return {
        mode: "memorable",
        groups: settings.groups,
        syllables: settings.syllables,
        separator: separator(settings.memorableSeparator, settings.memorableCustom),
        capitalize: settings.memorableCapitalize,
        includeNumber: settings.memorableNumber,
      };
    case "pin":
      return { mode: "pin", length: settings.pinLength };
  }
}

/** One password of the chosen mode (words need the list). */
export function generateOne(options: GeneratorOptions, wordlist: readonly string[] | null): Result<string> {
  switch (options.mode) {
    case "characters":
      return generatePassword(options);
    case "words":
      return generatePassphrase(options, wordlist ?? []);
    case "memorable":
      return generateMemorable(options);
    case "pin":
      return generatePin(options);
  }
}

/** What the passwords are made of, for the status line. */
export function describeSettings(settings: PasswordSettings): string {
  const options = generatorOptions(settings);
  switch (options.mode) {
    case "characters": {
      const pool = characterPool(options);
      return pool.ok ? `${options.length} characters from ${pool.value.pool.length}` : "";
    }
    case "words":
      return `${options.words} words from ${EFF_WORDLIST_SIZE.toLocaleString("en-US")}`;
    case "memorable":
      return `${options.groups} groups of ${options.syllables} syllables from 225`;
    case "pin":
      return `${options.length} digits, ${countObviousPins(options.length).toLocaleString("en-US")} obvious PINs left out`;
  }
}

export interface Estimate {
  bits: number;
  strength: Strength;
  /** "3 hours", "centuries". */
  crackTime: string;
}

export interface UsePasswordGeneratorOptions {
  initialSettings?: Partial<PasswordSettings>;
  /** Loads the EFF wordlist; by default the package's own `./wordlist` entry, loaded when Words is first chosen. */
  loadWordlist?: () => Promise<readonly string[]>;
}

export interface UsePasswordGenerator {
  settings: PasswordSettings;
  update: (patch: Partial<PasswordSettings>) => void;
  /** Empty until the page has hydrated, after Clear, and while the options allow none. */
  passwords: string[];
  /** Why no password can be made, or null. */
  error: string | null;
  /** Words is chosen and the word list is still loading. */
  loading: boolean;
  /** True after Clear, until new passwords are made. */
  cleared: boolean;
  estimate: Estimate | null;
  regenerate: () => void;
  /** Forgets the passwords. */
  clear: () => void;
}

const loadEffWordlist = (): Promise<readonly string[]> => import("../wordlist").then((module) => module.EFF_LARGE_WORDLIST);

/** The password generator's state without markup. Passwords live only in this state: never in storage or links. */
export function usePasswordGenerator(options: UsePasswordGeneratorOptions = {}): UsePasswordGenerator {
  const [settings, setSettings] = useState<PasswordSettings>(() => ({ ...DEFAULT_SETTINGS, ...options.initialSettings }));
  const [wordlist, setWordlist] = useState<readonly string[] | null>(null);
  const [round, setRound] = useState(0);
  const [made, setMade] = useState<{ passwords: string[]; error: string | null; cleared: boolean }>({ passwords: [], error: null, cleared: false });
  const load = options.loadWordlist ?? loadEffWordlist;

  const words = settings.mode === "words";
  useEffect(() => {
    if (!words || wordlist !== null) return;
    let live = true;
    load().then(
      (list) => {
        if (live) setWordlist(list);
      },
      () => {
        if (live) setMade({ passwords: [], error: "The word list could not be loaded", cleared: false });
      },
    );
    return () => {
      live = false;
    };
  }, [words, wordlist, load]);

  const generator = useMemo(() => generatorOptions(settings), [settings]);
  const { count } = settings;
  // Passwords are made after hydration, in the browser: a server render must never contain one.
  useEffect(() => {
    const passwords: string[] = [];
    if (generator.mode === "words" && wordlist === null) {
      setMade((current) => (current.error === "The word list could not be loaded" ? current : { passwords, error: null, cleared: false }));
      return;
    }
    for (let i = 0; i < count; i++) {
      const one = generateOne(generator, wordlist);
      if (!one.ok) {
        setMade({ passwords: [], error: one.error.message, cleared: false });
        return;
      }
      passwords.push(one.value);
    }
    setMade({ passwords, error: null, cleared: false });
  }, [generator, count, wordlist, round]);

  const estimate = useMemo((): Estimate | null => {
    const bits = entropy(generator);
    return bits > 0 ? { bits, strength: strength(bits), crackTime: crackTime(bits).text } : null;
  }, [generator]);

  const update = useCallback((patch: Partial<PasswordSettings>) => setSettings((current) => ({ ...current, ...patch })), []);
  const regenerate = useCallback(() => setRound((value) => value + 1), []);
  const clear = useCallback(() => setMade({ passwords: [], error: null, cleared: true }), []);

  const loading = words && wordlist === null && made.error === null;
  return { settings, update, passwords: made.passwords, error: made.error, loading, cleared: made.cleared, estimate, regenerate, clear };
}
