import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

/**
 * Key combinations: "Mod+Enter", "Mod+Shift+M", "Alt+ArrowDown", "Shift+F7", "?". "Mod" is ⌘ on Apple systems and
 * Ctrl elsewhere; "Alt" is ⌥ there. Other keys are named as KeyboardEvent.key names them ("ArrowDown", "F7"). A letter is
 * matched by the Latin letter the key types (so the key labelled M works on AZERTY), and by the physical key
 * (event.code) when the layout types a non-Latin letter there (Cyrillic, Greek…); "?" is matched by the character.
 */
export type HotkeyMap = Record<string, () => void>;

interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const noSubscription = (): (() => void) => () => {};

/** True on Apple systems; false during the server render and hydration, so the markup matches. */
export function useApplePlatform(): boolean {
  return useSyncExternalStore(noSubscription, isApplePlatform, () => false);
}

/** Whether `event` is the combination `combo`. Extra modifiers never match, so browser shortcuts pass through. */
export function matchHotkey(combo: string, event: KeyLike, apple: boolean): boolean {
  const parts = combo.split("+");
  const key = parts.pop()!;
  const mod = parts.includes("Mod");
  const shift = parts.includes("Shift");
  const alt = parts.includes("Alt");
  if (key === "?") return event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey;
  if (event.altKey !== alt || event.shiftKey !== shift) return false;
  if (mod !== (apple ? event.metaKey : event.ctrlKey) || (apple ? event.ctrlKey : event.metaKey)) return false;
  if (!/^[A-Z]$/.test(key)) return event.key === key;
  if (/^[a-z]$/i.test(event.key)) return event.key.toUpperCase() === key;
  // A non-Latin letter (Cyrillic, Greek…): fall back to the physical key. Punctuation and digits never match.
  return /^\p{L}$/u.test(event.key) && event.code === `Key${key}`;
}

const ARROWS: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };

/** The keys of a combination, for lists of shortcuts: ["⌘", "Enter"], ["⌥", "↓"], or ["Ctrl", "Shift", "M"] elsewhere. */
export function formatHotkey(combo: string, apple: boolean): string[] {
  return combo.split("+").map((part) => {
    if (part === "Mod") return apple ? "⌘" : "Ctrl";
    if (part === "Shift" && apple) return "⇧";
    if (part === "Alt" && apple) return "⌥";
    return ARROWS[part] ?? part;
  });
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/** Tools with hotkeys, in mount order. When nothing on the page has focus, the first one gets the keys. */
const scopes: RefObject<HTMLElement | null>[] = [];

/**
 * Keyboard shortcuts for one tool. A combination works while focus is inside `scope`, or when nothing has focus and
 * this is the first tool on the page. "?" and Alt with an arrow work only outside text fields. Keys inside a dialog, during IME
 * composition, or already handled by a control (a Select's Enter, for example) are left alone, and so is every
 * combination that is not in the map.
 */
export function useHotkeys(map: HotkeyMap, scope: RefObject<HTMLElement | null>): void {
  const latest = useRef(map);
  latest.current = map;

  useEffect(() => {
    scopes.push(scope);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const target = event.target instanceof Node ? event.target : null;
      const root = scope.current;
      const unfocused = target === null || target === document.body || target === document.documentElement;
      if (!root || !(unfocused ? scopes[0] === scope : root.contains(target))) return;
      if (target instanceof Element && target.closest("dialog, [role='dialog']")) return;
      const apple = isApplePlatform();
      for (const [combo, run] of Object.entries(latest.current)) {
        if (!matchHotkey(combo, event, apple)) continue;
        // In a text field "?" is typed and Alt with an arrow moves the caret: both are left to the field.
        if ((combo === "?" || /^Alt\+Arrow/.test(combo)) && isEditable(event.target)) return;
        event.preventDefault();
        run();
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      scopes.splice(scopes.indexOf(scope), 1);
    };
  }, [scope]);
}
