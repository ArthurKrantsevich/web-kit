import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactElement } from "react";
import { Button, CopyButton } from "./Button";
import { Dialog } from "./Dialog";
import { formatLimit } from "./files";
import { formatHotkey, useApplePlatform, useHotkeys, type HotkeyMap } from "./hotkeys";
import { Menu, type MenuItem } from "./Menu";
import { useIsomorphicLayoutEffect } from "./popover";
import { SHARE_MAX_LENGTH, SHARE_WARNING_LENGTH, useShareHash } from "./share";
import { usePersistentState } from "./storage";
import { loadFromUrl } from "./url";

export interface UrlTarget {
  /** The menu item, e.g. "Load from URL…" or "Load Left from URL…"; without the "…" it is the dialog's title. */
  label: string;
  onText: (text: string) => void;
}

export interface Shortcut {
  /** A combination for useHotkeys, e.g. "Mod+Shift+M". */
  keys: string;
  /** What it does, e.g. "Minify". */
  label: string;
  run: () => void;
}

export interface ToolMenuProps {
  /** Names the share link (`#<toolKey>=…`) and the saved input (`wk:<toolKey>:…` in localStorage). */
  toolKey: string;
  /** What a link shares and what is saved: plain JSON data. Memoize it; saving follows its changes. */
  state: object;
  /**
   * Puts back the state of a share link or of the saved input. Called at most once, after hydration; a link wins
   * over the saved input. The data comes from outside: check every field before using it.
   */
  onRestore: (state: Record<string, unknown>) => void;
  /** One menu item per field that can be loaded from a URL. */
  urlTargets: UrlTarget[];
  /** The tool's keyboard shortcuts. "?" is added: it shows the list. */
  shortcuts: Shortcut[];
  /** Short messages for the tool's status line, e.g. "Saved input cleared". */
  onNotice: (message: string) => void;
  /** Largest download from a URL. Default 10 MB. */
  maxBytes?: number;
}

/** The format of shared and saved data: the tool's state with a version. */
function serialize(state: object): string {
  return JSON.stringify({ v: 1, state });
}

function deserialize(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || (value as { v?: unknown }).v !== 1) return null;
    const state = (value as { state?: unknown }).state;
    return typeof state === "object" && state !== null && !Array.isArray(state) ? (state as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The "More actions" menu of a tool: load from a URL, share by link, save the input in this browser, and keyboard
 * shortcuts, with their dialogs. It also restores a shared link or the saved input once after hydration, keeps saving
 * while saving is on, and handles the tool's hotkeys while focus is inside the tool (its `.wk-ui-editor` root).
 */
export function ToolMenu({
  toolKey,
  state,
  onRestore,
  urlTargets,
  shortcuts,
  onNotice,
  maxBytes = DEFAULT_MAX_BYTES,
}: ToolMenuProps): ReactElement {
  const share = useShareHash(toolKey);
  const store = usePersistentState(toolKey);
  const apple = useApplePlatform();
  const anchor = useRef<HTMLSpanElement>(null);
  const scope = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<"url" | "share" | "keys" | null>(null);
  const [urlTarget, setUrlTarget] = useState<UrlTarget | null>(null);
  const [restored, setRestored] = useState(false);
  const latest = useRef({ onRestore, onNotice });
  latest.current = { onRestore, onNotice };

  useIsomorphicLayoutEffect(() => {
    scope.current = anchor.current?.closest<HTMLElement>(".wk-ui-editor") ?? anchor.current;
  }, []);

  // A share link wins over the saved input; either is applied once.
  const { clear } = store;
  // After a share link opened, its state is not saved over the user's own saved input until they edit it: the first
  // state seen after the restore is the link's, and saving resumes once the state differs from it.
  const linkState = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (restored || !share.ready || !store.ready) return;
    setRestored(true);
    const { onRestore: restore, onNotice: notice } = latest.current;
    if (share.error !== null) notice(share.error);
    const text = share.initial ?? store.saved;
    if (text === null) return;
    const value = deserialize(text);
    if (value !== null) {
      if (share.initial !== null) linkState.current = null;
      restore(value);
    }
    else if (share.initial !== null) notice("The shared link is damaged; nothing was loaded from it");
    else {
      clear();
      notice("The saved input could not be read and was deleted");
    }
  }, [restored, share.ready, share.initial, share.error, store.ready, store.saved, clear]);

  const serialized = useMemo(() => (restored && store.enabled ? serialize(state) : null), [restored, store.enabled, state]);
  const { save } = store;
  useEffect(() => {
    if (serialized === null) return;
    if (linkState.current === null) linkState.current = serialized;
    if (linkState.current !== undefined) {
      if (serialized === linkState.current) return;
      linkState.current = undefined;
    }
    save(serialized);
  }, [serialized, save]);

  useEffect(() => {
    if (store.error !== null) latest.current.onNotice(store.error);
  }, [store.error]);

  const hotkeys = useMemo(() => {
    const map: HotkeyMap = { "?": () => setDialog("keys") };
    for (const shortcut of shortcuts) map[shortcut.keys] = shortcut.run;
    return map;
  }, [shortcuts]);
  useHotkeys(hotkeys, scope);

  const items: MenuItem[] = [
    ...urlTargets.map((target) => ({
      label: target.label,
      onSelect: () => {
        setUrlTarget(target);
        setDialog("url");
      },
    })),
    {
      label: "Share link…",
      description: share.available ? "The data goes into the link; nothing is uploaded" : "This browser cannot make share links",
      disabled: !share.available,
      onSelect: () => setDialog("share"),
    },
    {
      label: "Save input in this browser",
      checked: store.enabled,
      description: !store.available
        ? "This browser does not allow saving"
        : store.enabled
          ? "On: kept here until you turn it off"
          : "Off: nothing is stored",
      disabled: !store.available,
      onSelect: () => {
        store.setEnabled(!store.enabled, serialize(state));
        onNotice(store.enabled ? "Saving is off; the saved input was deleted" : "The input is saved in this browser");
      },
    },
    {
      label: "Clear saved input",
      description: "Delete what this browser keeps for this tool",
      disabled: !store.hasSaved,
      onSelect: () => {
        store.clear();
        onNotice("Saved input cleared");
      },
    },
    { label: "Keyboard shortcuts", shortcut: "?", onSelect: () => setDialog("keys") },
  ];

  return (
    <span ref={anchor} className="wk-ui-tool-menu">
      <Menu label="More actions" tooltip="Load from a URL, share, save, keyboard shortcuts" items={items} />
      {dialog === "url" && urlTarget !== null && (
        <UrlDialog target={urlTarget} maxBytes={maxBytes} onClose={() => setDialog(null)} />
      )}
      {dialog === "share" && (
        <ShareDialog make={() => share.share(serialize(state))} onClose={() => setDialog(null)} />
      )}
      <Dialog open={dialog === "keys"} title="Keyboard shortcuts" onClose={() => setDialog(null)}>
        <dl className="wk-ui-keys">
          {[...shortcuts, { keys: "?", label: "Show this list" }].map((shortcut) => (
            <Fragment key={shortcut.keys}>
              <dt>
                {formatHotkey(shortcut.keys, apple).map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{shortcut.label}</dd>
            </Fragment>
          ))}
        </dl>
        <p className="wk-ui-note">They work while the tool has focus; ? works outside text fields. Browser shortcuts are left alone.</p>
      </Dialog>
    </span>
  );
}

function UrlDialog({ target, maxBytes, onClose }: { target: UrlTarget; maxBytes: number; onClose: () => void }): ReactElement {
  const id = useId();
  const [url, setUrl] = useState("");
  const [loaded, setLoaded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function load(event: FormEvent): Promise<void> {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setLoaded(0);
    const result = await loadFromUrl(url, { maxBytes, signal: controller.signal, onProgress: setLoaded });
    if (controller.signal.aborted) return;
    request.current = null;
    setLoaded(null);
    if (result.ok) {
      target.onText(result.value);
      onClose();
    } else setError(result.error.message);
  }

  return (
    <Dialog
      open
      title={target.label.replace(/…$/, "")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={`${id}-form`} disabled={loaded !== null || url.trim() === ""}>
            Load
          </Button>
        </>
      }
    >
      {/* noValidate: loadFromUrl's own messages ("Enter a full address…") explain a bad address better than the browser's bubble. */}
      <form id={`${id}-form`} noValidate onSubmit={(event) => void load(event)}>
        <input
          className="wk-ui-input"
          type="url"
          aria-label="URL"
          placeholder="https://example.com/data.json"
          spellCheck={false}
          value={url}
          data-autofocus
          onChange={(event) => setUrl(event.target.value)}
        />
      </form>
      <p className="wk-ui-note">
        {`Your browser asks that server directly: no cookies are sent and nothing passes through web-kit. The server must allow reading from other sites (CORS). Up to ${formatLimit(maxBytes)}.`}
      </p>
      <p role="status" className={error === null ? "wk-ui-note" : "wk-ui-problem"}>
        {error ?? (loaded === null ? "" : `Loading… ${formatLimit(loaded)}`)}
      </p>
    </Dialog>
  );
}

function ShareDialog({ make, onClose }: { make: () => Promise<string>; onClose: () => void }): ReactElement {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const build = useRef(make);
  const field = useRef<HTMLInputElement>(null);

  // The link arrives after the dialog opened (and focused its Close button): move focus to it, selected, ready to copy.
  useEffect(() => {
    if (link !== null) field.current?.focus();
  }, [link]);

  useEffect(() => {
    let live = true;
    build.current().then(
      (value) => {
        if (!live) return;
        if (value.length > SHARE_MAX_LENGTH) {
          setError(
            `The link would be ${value.length.toLocaleString("en-US")} characters long; browsers do not open links longer than ${SHARE_MAX_LENGTH.toLocaleString("en-US")}. Download the data and send the file instead.`,
          );
        } else setLink(value);
      },
      () => {
        if (live) setError("The link could not be made in this browser");
      },
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <Dialog
      open
      title="Share link"
      onClose={onClose}
      footer={<CopyButton text={link ?? ""} label="Copy link" tooltip="Copy the link to the clipboard" />}
    >
      {link === null ? (
        <p role="status" className={error === null ? "wk-ui-note" : "wk-ui-problem"}>
          {error ?? "Making the link…"}
        </p>
      ) : (
        <>
          <input
            ref={field}
            className="wk-ui-input"
            aria-label="Share link"
            readOnly
            value={link}
            data-autofocus
            onFocus={(event) => event.target.select()}
          />
          <p>Anyone with the link can see the data. The data is inside the link itself; it is not uploaded anywhere.</p>
          {link.length > SHARE_WARNING_LENGTH && (
            <p className="wk-ui-warning">
              {`This link is ${link.length.toLocaleString("en-US")} characters long. Messengers and email may cut links longer than ${SHARE_WARNING_LENGTH.toLocaleString("en-US")} characters.`}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
