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
  StatusLine,
  ToolMenu,
  useFileDrop,
  useHydrated,
  useSettled,
} from "@web-kit/ui";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES, readClipboardImage } from "./image";
import { SAMPLE_QR } from "./samples";
import { resultsCsv, resultsJson, resultsText, SYMBOLOGY_LABELS, useCodeScanner, type ScanEntry, type ScannerSettings, type UseCodeScannerOptions } from "./useCodeScanner";

export interface CodeScannerProps extends UseCodeScannerOptions {
  className?: string;
}

const TIME = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const NO_CODE = "No code found. Try “Try harder” or a sharper image.";

/** The sample's dark modules as one SVG path, in module units, inside a quiet zone of 4. */
const SAMPLE_QUIET = 4;
const SAMPLE_SPAN = SAMPLE_QR.size + 2 * SAMPLE_QUIET;
const SAMPLE_PATH = SAMPLE_QR.rows.map((row, y) => [...row].map((bit, x) => (bit === "1" ? `M${x + SAMPLE_QUIET} ${y + SAMPLE_QUIET}h1v1h-1z` : "")).join("")).join("");

/** The sample drawn from its matrix as an SVG, so the preview needs no file and no canvas (it also renders on the server). */
function SamplePreview({ size }: { size: number }): ReactElement {
  return (
    <svg className="wk-scanner__image" width={size} height={size} viewBox={`0 0 ${SAMPLE_SPAN} ${SAMPLE_SPAN}`} shapeRendering="crispEdges" role="img" aria-label={`Sample: ${SAMPLE_QR.text}`}>
      <rect width={SAMPLE_SPAN} height={SAMPLE_SPAN} fill="#fff" />
      <path d={SAMPLE_PATH} fill="#000" />
    </svg>
  );
}

/** Paste reads an image from the clipboard; the button keeps its place hidden where the clipboard cannot be read. */
function PasteImageButton({ onFile, onNotice }: { onFile: (file: File) => void; onNotice: (message: string) => void }): ReactElement {
  const [canPaste, setCanPaste] = useState(false);
  useEffect(() => { setCanPaste(typeof navigator !== "undefined" && typeof navigator.clipboard?.read === "function"); }, []);
  if (!canPaste) return <ActionButton action="paste" className="wk-ui-button--pending" aria-hidden="true" tabIndex={-1} disabled />;
  return (
    <ActionButton
      action="paste"
      tooltip="Paste an image from the clipboard"
      onClick={() => {
        void readClipboardImage().then(
          (file) => (file ? onFile(file) : onNotice("The clipboard holds no image")),
          () => onNotice("Clipboard access was denied"),
        );
      }}
    />
  );
}

/** Ready-made scanner for images: Open file, drop, Paste or Sample, decoded in a Web Worker. Import "@web-kit/code-scanner/styles.css" once. */
export function CodeScanner(props: CodeScannerProps): ReactElement {
  const state = useCodeScanner(props);
  const { settings, update, source, entries, status, busy, notice } = state;
  const hydrated = useHydrated();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const drop = useFileDrop({ accept: IMAGE_ACCEPT, maxBytes: MAX_IMAGE_BYTES, label: "Open image", onFile: state.openFile, onError: state.setNotice });
  // Ctrl+Enter is registered by ToolMenu (its `shortcuts`), scoped to the editor, and listed under "?"

  const shared = useMemo(() => ({ tryHarder: settings.tryHarder, multiple: settings.multiple }), [settings]);
  /** Puts back a shared or saved state. It comes from outside, so every field is checked; nothing else is read. */
  function restore(value: Record<string, unknown>): void {
    const patch: Partial<ScannerSettings> = {};
    if (typeof value.tryHarder === "boolean") patch.tryHarder = value.tryHarder;
    if (typeof value.multiple === "boolean") patch.multiple = value.multiple;
    if (Object.keys(patch).length > 0) update(patch);
  }

  const json = useMemo(() => (entries.length ? resultsJson(entries) : ""), [entries]);
  const text = useMemo(() => resultsText(entries), [entries]);
  const summary = notice || status.text;
  const heard = useSettled(summary);

  const toolbar = (
    <EditorToolbar>
      <label className="wk-ui-switch">
        <input type="checkbox" role="switch" checked={settings.tryHarder} onChange={(event) => update({ tryHarder: event.target.checked })} />
        Try harder
      </label>
      <label className="wk-ui-switch">
        <input type="checkbox" role="switch" checked={settings.multiple} onChange={(event) => update({ multiple: event.target.checked })} />
        Multiple codes
      </label>
      <span className="wk-ui-spacer" />
      <span className="wk-scanner__actions">
        <ActionButton action="sample" words={{ target: "the image" }} onClick={state.openSample} />
        <ActionButton action="clear" words={{ target: "the image and the results" }} onClick={state.clear} />
        <ToolMenu
          toolKey="code-scanner"
          state={shared}
          onRestore={restore}
          urlTargets={[]}
          extraItems={[{ label: "Download as CSV", description: "scan-results.csv: symbology, text, bytes, time, confidence", disabled: entries.length === 0, onSelect: () => downloadText(resultsCsv(entries), "scan-results.csv", "text/csv") }]}
          shortcuts={[{ keys: "Mod+Enter", label: "Scan the image again", run: state.rescan }]}
          onNotice={state.setNotice}
          dropHint="Drop the image on Image to scan it"
        />
      </span>
    </EditorToolbar>
  );

  function entry(e: ScanEntry): ReactElement {
    const open = expanded.has(e.key), long = e.result.text.length > 160 || e.result.text.split("\n").length > 3;
    const label = SYMBOLOGY_LABELS[e.result.symbology] ?? e.result.symbology;
    return (
      <li key={e.key} className="wk-scanner__entry">
        <div className="wk-scanner__head">
          <span className="wk-scanner__badge">{label}</span>
          {e.count > 1 && <span className="wk-scanner__count" aria-label={`read ${e.count} times`}>×{e.count}</span>}
          <span className="wk-scanner__time">{TIME.format(e.time)}</span>
          <span className="wk-ui-spacer" />
          <CopyButton text={e.result.text} aria-label={`Copy ${label} text`} tooltip="Copy this code's text" variant="quiet" icon iconOnly />
        </div>
        <p className="wk-scanner__text" data-clamped={long && !open ? "true" : undefined}>{e.result.text}</p>
        {long && (
          <Button className="wk-scanner__more" icon={open ? "chevron-up" : "chevron-down"} aria-expanded={open} onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(e.key)) n.delete(e.key); else n.add(e.key); return n; })}>
            {open ? "Less" : "More"}
          </Button>
        )}
      </li>
    );
  }

  return (
    <div className={["wk-scanner", props.className].filter(Boolean).join(" ")}>
      <EditorShell toolbar={toolbar} status={
        <StatusLine state={status.state === "error" || notice ? "error" : status.state === "found" ? "valid" : "idle"}>
          <span className="wk-scanner__summary" title={summary}><span className="wk-scanner__summary-text">{summary}</span></span>
          <span className="wk-ui-sr-only" role="status">{heard}</span>
        </StatusLine>
      }>
        <EditorPanes>
          <EditorPane
            kind="input"
            className="wk-scanner__pane--image"
            title="Image"
            meta={source ? `${source.width}×${source.height}` : undefined}
            drop={drop}
            dropLabel="Drop the image to scan it"
            actions={
              <>
                <OpenFileButton aria-label="Open image" tooltip="Open a PNG, JPEG, WebP, GIF, BMP or SVG image (up to 25 MB), or drop it on Image" drop={drop} />
                <PasteImageButton onFile={state.openFile} onNotice={state.setNotice} />
              </>
            }
          >
            <div className="wk-scanner__stage" aria-busy={busy}>
              {source === null ? (
                <EmptyState size="sm" icon="open" title="Open an image with a code" action={<Button variant="outline" icon="sample" onClick={state.openSample}>Try the sample</Button>}>
                  PNG, JPEG, WebP, GIF, BMP or SVG, up to 25 MB. Drop it here, open it or paste it.
                </EmptyState>
              ) : source.url === null ? (
                <SamplePreview size={328} />
              ) : (
                <img className="wk-scanner__image" src={source.url} alt={source.name} />
              )}
            </div>
          </EditorPane>
          <EditorPane
            kind="output"
            className="wk-scanner__pane--results"
            title="Results"
            meta={entries.length ? `${entries.length} ${entries.length === 1 ? "code" : "codes"}` : undefined}
            actions={
              <>
                <ActionButton action="download" words={{ what: "the results", file: "scan-results.json" }} disabled={json === ""} onClick={() => downloadText(json, "scan-results.json", "application/json")} />
                <CopyButton text={text} tooltip="Copy the texts of every result, one per line" variant="quiet" icon />
              </>
            }
          >
            <div className="wk-scanner__results">
              {entries.length === 0 ? (
                <EmptyState size="sm" icon="search" title={status.state === "none" ? "No code found" : status.state === "scanning" ? "Scanning…" : "Nothing scanned yet"}>
                  {status.state === "none" ? NO_CODE : "Results of this session appear here, newest first."}
                </EmptyState>
              ) : (
                <>
                  {/* The note keeps its line above the list in every state, so a scan without a code moves no entry. */}
                  <p className="wk-scanner__note" data-hidden={status.state !== "none"} aria-hidden={status.state !== "none" || undefined}>
                    {NO_CODE}
                  </p>
                  <ul className="wk-scanner__list" aria-label="Results">{entries.map(entry)}</ul>
                </>
              )}
            </div>
          </EditorPane>
        </EditorPanes>
      </EditorShell>
      {!hydrated && <span className="wk-ui-sr-only">Loading</span>}
    </div>
  );
}
