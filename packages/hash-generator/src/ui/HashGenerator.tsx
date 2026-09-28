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
  OpenFileButton,
  PasteButton,
  Segmented,
  StatusLine,
  ToolMenu,
  Tooltip,
  useFileDrop,
  useHydrated,
  useSettled,
  type SegmentedOption,
} from "@web-kit/ui";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";
import { ALGORITHM_NAMES } from "../core/algorithms";
import { encodeDigest } from "../core/encode";
import type { DigestEncoding } from "../core/types";
import { checksumFile } from "./sums";
import { formatSize, MAX_FILE_BYTES, useHashGenerator, type HashSettings, type UseHashGeneratorOptions } from "./useHashGenerator";

export interface HashGeneratorProps extends UseHashGeneratorOptions {
  className?: string;
}

const ENCODINGS: SegmentedOption<DigestEncoding>[] = [
  { value: "hex", label: "hex", tooltip: "Lower-case hexadecimal, as sha256sum prints it" },
  { value: "HEX", label: "HEX", tooltip: "Upper-case hexadecimal" },
  { value: "base64", label: "Base64", tooltip: "Base64 with padding, as in SRI and many APIs" },
  { value: "base64url", label: "Base64url", tooltip: "URL-safe Base64 without padding" },
];

const KEY_FORMATS: SegmentedOption<"text" | "hex">[] = [
  { value: "text", label: "Text", tooltip: "The key is the UTF-8 bytes of the text" },
  { value: "hex", label: "Hex", tooltip: "The key is written in hexadecimal digits" },
];

const SAMPLE = "The quick brown fox jumps over the lazy dog";

export { checksumFile } from "./sums";

/** Ready-made hash and HMAC generator for texts and files. Import "@web-kit/hash-generator/styles.css" once. */
export function HashGenerator(props: HashGeneratorProps): ReactElement {
  const state = useHashGenerator(props);
  const { settings, update, results, pending, file, match } = state;
  const [notice, setNotice] = useState("");
  const hydrated = useHydrated();
  const id = useId();
  const hmac = settings.hmac;
  // A control that disappears on its own click hands focus on: Check them to Verify, Back to text to the text.
  const verifyField = useRef<HTMLInputElement>(null);
  const textField = useRef<HTMLTextAreaElement>(null);
  const [focusText, setFocusText] = useState(false);
  useEffect(() => {
    if (!focusText || file !== null) return;
    textField.current?.focus();
    setFocusText(false);
  }, [focusText, file]);
  const drop = useFileDrop({
    accept: "*/*",
    maxBytes: MAX_FILE_BYTES,
    label: "Open file to hash",
    onFile: (next) => {
      setNotice("");
      state.openFile(next);
    },
    onError: setNotice,
  });

  const rows = state.algorithms.map((algorithm) => ({
    ...algorithm,
    label: hmac && algorithm.webCrypto ? `HMAC-${algorithm.name}` : algorithm.name,
    digest: results[algorithm.id],
    noHmac: hmac && !algorithm.webCrypto,
  }));
  const computed = rows.filter((row) => row.digest !== undefined) as (typeof rows[number] & { digest: Uint8Array })[];
  const fileName = file?.name ?? "-";
  // HMACs are not checksums a tool can check: hashes.txt has the plain digests only (none while HMAC is on).
  const plain = hmac ? [] : computed;
  const sums = plain.length === 0 || pending !== null ? "" : checksumFile(plain, fileName);
  const matched = match.status === "match" ? match.algorithm : null;
  const bytes = useMemo(() => (file ? file.size : new TextEncoder().encode(settings.text).length), [file, settings.text]);

  // No HMAC switch: the key never travels, and HMAC on without a key would open as an error.
  const shared = useMemo(
    () => ({ text: settings.text, encoding: settings.encoding, keyFormat: settings.keyFormat, expanded: settings.expanded }),
    [settings],
  );

  /** Puts back a shared or saved state. It comes from outside, so every field is checked. */
  function restore(value: Record<string, unknown>): void {
    const patch: Partial<HashSettings> = {};
    if (typeof value.text === "string") patch.text = value.text;
    if (ENCODINGS.some((option) => option.value === value.encoding)) patch.encoding = value.encoding as DigestEncoding;
    // An older link or saved input may say HMAC was on; without its key it opens off.
    if (value.hmac === true) patch.hmac = false;
    if (value.keyFormat === "text" || value.keyFormat === "hex") patch.keyFormat = value.keyFormat;
    if (typeof value.expanded === "boolean") patch.expanded = value.expanded;
    state.closeFile();
    update(patch);
  }

  const offered = match.status === "none" && match.uncomputed.length > 0 && !settings.expanded ? match.uncomputed : [];
  const names = offered.map((one) => ALGORITHM_NAMES[one]);
  const offeredList =
    names.length === 0 ? "" : `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`} ${names.length === 1 ? "has" : "have"} this length`;
  // Empty: the field's placeholder asks for a hash, so the verdict stays empty (no second sentence saying the same).
  const verifyText =
    match.status === "empty"
      ? ""
      : match.status === "invalid"
        ? match.message
        : match.status === "match"
          ? `Matches ${rows.find((row) => row.id === match.algorithm)?.label ?? ALGORITHM_NAMES[match.algorithm]}`
          : pending !== null
            ? "Checking when hashing ends…"
            : offered.length > 0
              ? `No match yet; ${offered.length} more ${offered.length === 1 ? "algorithm has" : "algorithms have"} this length`
              : "No algorithm matches";
  const settledVerdict = useSettled(offeredList === "" ? verifyText : `${verifyText}: ${offeredList}`);
  const verifyState = match.status === "match" ? "valid" : match.status === "none" && pending === null ? "error" : match.status === "invalid" ? "error" : "idle";

  function row(item: (typeof rows)[number]): ReactElement {
    const value = item.digest === undefined ? "" : encodeDigest(item.digest, settings.encoding);
    return (
      <li key={item.id} className="wk-hash__row" data-match={matched === item.id || undefined}>
        <span className="wk-hash__algorithm">{item.label}</span>
        {/* The value lies over an unseen hex value of full length, so the row is as tall as its longest form. */}
        <span className="wk-hash__cell">
          <code className="wk-hash__value" data-empty={item.digest === undefined || undefined}>
            {item.digest !== undefined ? value : item.noHmac ? "No HMAC for this algorithm" : state.error ? "—" : "…"}
          </code>
          <code className="wk-hash__ghost" aria-hidden="true">
            {"0".repeat(item.bytes * 2)}
          </code>
        </span>
        <CopyButton text={value} aria-label={`Copy ${item.label}`} tooltip={`Copy the ${item.label} value`} variant="quiet" icon iconOnly />
      </li>
    );
  }

  const toolbar = (
    <EditorToolbar>
      <Segmented label="Encoding" value={settings.encoding} options={ENCODINGS} onChange={(encoding) => update({ encoding })} />
      <label className="wk-ui-switch">
        <input type="checkbox" role="switch" checked={hmac} onChange={(event) => update({ hmac: event.target.checked })} />
        HMAC
      </label>
      {/* The key and its format keep their place while HMAC is off, so turning it on moves nothing. */}
      <span className="wk-hash__hmac" data-hidden={!hmac} inert={!hmac} aria-hidden={!hmac || undefined}>
        <span className="wk-ui-field" aria-hidden="true">
          Key
        </span>
        <input
          className="wk-ui-input wk-hash__key"
          aria-label="HMAC key"
          placeholder={settings.keyFormat === "hex" ? "Key in hex" : "Key"}
          spellCheck={false}
          autoComplete="off"
          maxLength={1024}
          readOnly={!hydrated}
          value={state.key}
          onChange={(event) => state.setKey(event.target.value)}
        />
        <Segmented label="Key format" size="sm" value={settings.keyFormat} options={KEY_FORMATS} onChange={(keyFormat) => update({ keyFormat })} />
      </span>
      <span className="wk-ui-spacer" />
      <ActionButton
        action="sample"
        words={{ target: "the text" }}
        onClick={() => {
          state.closeFile();
          update({ text: SAMPLE });
        }}
      />
      <ActionButton
        action="clear"
        words={{ target: "the text, the file, the HMAC key and the hash to verify" }}
        onClick={() => {
          state.closeFile();
          state.setVerify("");
          state.setKey("");
          update({ text: "" });
        }}
      />
      <ToolMenu
        toolKey="hash-generator"
        state={shared}
        onRestore={restore}
        urlTargets={[
          {
            label: "Load text from URL…",
            onText: (text) => {
              state.closeFile();
              update({ text });
            },
          },
        ]}
        shortcuts={[]}
        onNotice={setNotice}
        dropHint="Drop the file on Text to hash it"
        maxBytes={10 * 1024 * 1024}
      />
    </EditorToolbar>
  );

  const summary =
    state.error ??
    (pending !== null
      ? `Hashing ${pending.name}… ${Math.floor(pending.share * 100)}%`
      : file
        ? `Hashed ${file.name} (${formatSize(file.size)})`
        : `Hashed ${bytes.toLocaleString("en-US")} ${bytes === 1 ? "byte" : "bytes"} of text`);
  // Heard, not seen: a file's progress at its start and every 25 %, anything else once it has settled (after a pause in
  // typing), so a screen reader is not read every keystroke or every percent.
  const progress = pending === null ? null : `Hashing ${pending.name}…${pending.share < 0.25 ? "" : ` ${Math.min(75, Math.floor(pending.share * 4) * 25)}%`}`;
  const heard = useSettled(progress ?? summary, progress === null ? undefined : 0);
  const status = (
    <StatusLine state={state.error ? "error" : "idle"}>
      <span className="wk-hash__summary" title={summary}>
        {summary}
      </span>
      <span className="wk-ui-sr-only" role="status">
        {heard}
      </span>
      {state.note && (
        <span className="wk-hash__note" title={state.note}>
          {state.note}
        </span>
      )}
      {notice && (
        <span className="wk-hash__note" title={notice}>
          {notice}
        </span>
      )}
    </StatusLine>
  );

  return (
    <EditorShell className={["wk-hash", props.className].filter(Boolean).join(" ")} toolbar={toolbar} status={status}>
      <EditorPanes>
        <EditorPane
          kind="input"
          className="wk-hash__pane--input"
          title={
            file === null ? (
              "Text"
            ) : (
              <Tooltip content={file.name}>
                <span className="wk-hash__name">{file.name}</span>
              </Tooltip>
            )
          }
          labelFor={file === null ? `${id}-text` : undefined}
          meta={formatSize(bytes)}
          drop={drop}
          dropLabel="Drop the file to hash it"
          actions={
            <>
              <OpenFileButton aria-label="Open file" tooltip="Open any file (up to 512 MB), or drop it on Text" drop={drop} />
              <PasteButton
                aria-label="Paste"
                onText={(text) => {
                  state.closeFile();
                  update({ text });
                }}
                onError={setNotice}
              />
            </>
          }
        >
          {file === null ? (
            <textarea
              ref={textField}
              id={`${id}-text`}
              className="wk-ui-area"
              value={settings.text}
              readOnly={!hydrated}
              spellCheck={false}
              placeholder="Type or paste text, or drop a file"
              onChange={(event) => update({ text: event.target.value })}
            />
          ) : (
            <div className="wk-hash__file">
              <EmptyState size="sm" icon="open" title={file.name}>
                <span className="wk-hash__facts">{`${formatSize(file.size)} · ${file.size.toLocaleString("en-US")} bytes · ${file.type || "unknown type"}`}</span>
              </EmptyState>
              <Button
                variant="outline"
                icon="arrow-left"
                onClick={() => {
                  state.closeFile();
                  setFocusText(true);
                }}
              >
                Back to text
              </Button>
            </div>
          )}
        </EditorPane>
        <EditorPane
          kind="output"
          className="wk-hash__pane--output"
          title="Hashes"
          actions={
            <>
              <ActionButton action="download" words={{ what: "the hashes", file: "hashes.txt" }} disabled={sums === ""} onClick={() => downloadText(sums, "hashes.txt", "text/plain")} />
              <CopyButton text={sums} tooltip="Copy the hashes as hashes.txt has them" variant="quiet" icon />
            </>
          }
        >
          <div className="wk-hash__body">
            <div className="wk-hash__verify" data-state={verifyState}>
              <span className="wk-ui-field" aria-hidden="true">
                Verify
              </span>
              <input
                ref={verifyField}
                className="wk-ui-input wk-hash__expected"
                aria-label="Verify"
                placeholder="Paste a hash to verify"
                spellCheck={false}
                autoComplete="off"
                readOnly={!hydrated}
                value={state.verify}
                onChange={(event) => state.setVerify(event.target.value)}
              />
              {/* The verdict fits one line; which algorithms have the length is in its tooltip. */}
              {offeredList === "" ? (
                <span className="wk-hash__verdict">{verifyText}</span>
              ) : (
                <Tooltip content={offeredList}>
                  <span className="wk-hash__verdict" tabIndex={0}>
                    {verifyText}
                  </span>
                </Tooltip>
              )}
              <span className="wk-ui-sr-only" role="status">
                {settledVerdict}
              </span>
              {offered.length > 0 && pending === null && (
                <Button
                  className="wk-hash__check"
                  onClick={() => {
                    update({ expanded: true });
                    verifyField.current?.focus();
                  }}
                >
                  Check them
                </Button>
              )}
            </div>
            <div className="wk-hash__table" aria-busy={pending !== null}>
              <ul className="wk-hash__rows" aria-label="Hashes">
                {rows.slice(0, 6).map(row)}
              </ul>
              <div className="wk-hash__more-row">
                <Button
                  icon={settings.expanded ? "chevron-up" : "chevron-down"}
                  className="wk-hash__more"
                  aria-expanded={settings.expanded}
                  onClick={() => update({ expanded: !settings.expanded })}
                >
                  {settings.expanded ? "Fewer algorithms" : "More algorithms"}
                </Button>
              </div>
              {settings.expanded && (
                <ul className="wk-hash__rows" aria-label="More hashes">
                  {rows.slice(6).map(row)}
                </ul>
              )}
            </div>
          </div>
        </EditorPane>
      </EditorPanes>
    </EditorShell>
  );
}
