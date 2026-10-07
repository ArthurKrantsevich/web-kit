import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanImage, ScanResult, Symbology } from "../core/types";
import { createScanJobRunner, ScanWorkerError, type ScanJobRunner } from "../worker-client";
import { MAX_IMAGE_BYTES, readImageFile } from "./image";
import { sampleImage, SAMPLE_QR } from "./samples";

/** What a share link carries and "Save input" keeps: the two switches, never an image or a result. */
export interface ScannerSettings {
  tryHarder: boolean;
  multiple: boolean;
}
export const DEFAULT_SETTINGS: ScannerSettings = { tryHarder: false, multiple: false };

/** The symbologies 7a decodes; the menu of 7b chooses among all of them. */
export const SYMBOLOGIES: readonly Symbology[] = ["qr", "micro-qr", "rmqr"];
export const SYMBOLOGY_LABELS: Readonly<Partial<Record<Symbology, string>>> = { qr: "QR Code", "micro-qr": "Micro QR", rmqr: "rMQR" };

export interface ScanEntry {
  /** symbology + bytes, the identity a repeated code is folded by. */
  key: string;
  result: ScanResult;
  /** How many times this code was read. */
  count: number;
  time: Date;
  ms: number;
}

export interface ScanSource {
  name: string;
  /** An object URL for the preview, or null for the sample (drawn from its matrix). */
  url: string | null;
  width: number;
  height: number;
}

export interface UseCodeScannerOptions {
  initialSettings?: Partial<ScannerSettings>;
  /** Makes the runner of scan jobs; tests pass one with a fake worker. */
  createRunner?: () => ScanJobRunner;
  /** Reads a file's pixels; tests pass a function that needs no canvas. */
  readImage?: (file: File) => Promise<ScanImage>;
  now?: () => Date;
}

export interface ScanStatus {
  state: "idle" | "scanning" | "found" | "none" | "error";
  /** The status line, e.g. "QR Code · 25×25 · corrected 3 of 7 · 28 ms". */
  text: string;
}

export interface UseCodeScanner {
  settings: ScannerSettings;
  update: (patch: Partial<ScannerSettings>) => void;
  source: ScanSource | null;
  /** Reads and scans a file; a file the reader refuses becomes a notice. */
  openFile: (file: File) => void;
  openSample: () => void;
  /** Scans the current image again (after a switch changed). */
  rescan: () => void;
  /** Empties the list and drops the image. */
  clear: () => void;
  entries: ScanEntry[];
  status: ScanStatus;
  busy: boolean;
  /** A short message for the status line (a refused file, a clipboard without an image). */
  notice: string;
  setNotice: (message: string) => void;
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const keyOf = (r: ScanResult): string => `${r.symbology}:${hex(r.bytes)}`;

/** The spec's status: "QR Code · 25×25 · corrected 3 of 7 · 28 ms", with "Try harder on" when it was. */
export function describeScan(results: readonly ScanResult[], ms: number, tryHarder: boolean): string {
  const tail = tryHarder ? `Try harder on · ${ms} ms` : `${ms} ms`;
  if (results.length === 0) return `No code found · ${tail}`;
  const r = results[0]!;
  return `${SYMBOLOGY_LABELS[r.symbology] ?? r.symbology} · ${r.symbol.cols}×${r.symbol.rows} · corrected ${r.ecc.corrected} of ${r.ecc.capacity}${results.length > 1 ? ` · ${results.length} codes` : ""} · ${tail}`;
}

export function resultsJson(entries: readonly ScanEntry[]): string {
  return JSON.stringify(
    entries.map(({ result: r, count, time }) => ({
      symbology: r.symbology, text: r.text, bytes: hex(r.bytes), time: time.toISOString(), count, confidence: Number(r.confidence.toFixed(3)),
      symbol: r.symbol, ecc: r.ecc, eci: r.eci, charset: r.charset, gs1: r.gs1, structuredAppend: r.structuredAppend, points: r.points, orientation: r.orientation, mirrored: r.mirrored, inverted: r.inverted,
    })),
    null,
    2,
  );
}
/**
 * One CSV cell: a text a spreadsheet would run as a formula (one starting with =, +, -, @, a tab or a CR) gets a
 * leading apostrophe, and a text with a quote, a comma or a line break is quoted.
 */
const csvCell = (text: string): string => {
  const v = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
export function resultsCsv(entries: readonly ScanEntry[]): string {
  return ["symbology,text,bytes,time,confidence", ...entries.map(({ result: r, time }) => [r.symbology, csvCell(r.text), hex(r.bytes), time.toISOString(), r.confidence.toFixed(3)].join(","))].join("\n") + "\n";
}
export const resultsText = (entries: readonly ScanEntry[]): string => entries.map((e) => e.result.text).join("\n");

const IDLE_TEXT = "Open an image, paste one or try the sample";
/** A still image may take this long in either mode (spec §6: 40 ms is the camera frame's budget, 500 ms a photo's). */
export const IMAGE_DEADLINE_MS = 500;

/** The scanner's state without markup: one image at a time, scanned in the worker, results folded by symbology and bytes. */
export function useCodeScanner(options: UseCodeScannerOptions = {}): UseCodeScanner {
  const [settings, setSettings] = useState<ScannerSettings>(() => ({ ...DEFAULT_SETTINGS, ...options.initialSettings }));
  const [source, setSource] = useState<ScanSource | null>(null);
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [status, setStatus] = useState<ScanStatus>({ state: "idle", text: IDLE_TEXT });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const runner = useRef<ScanJobRunner | null>(null);
  const image = useRef<ScanImage | null>(null);
  /** The scan whose answer counts: a newer scan, or Clear, supersedes it. */
  const scanId = useRef(0);
  /** The file read whose pixels count: a newer open, the sample or Clear supersedes it; a scan does not. */
  const openId = useRef(0);
  const mounted = useRef(true);
  // The options are read through a ref, so the callbacks below stay the same across renders however they are passed.
  const latest = useRef({ settings, options });
  latest.current = { settings, options };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      runner.current?.dispose();
    };
  }, []);
  const url = source?.url ?? null;
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const scanImage = useCallback((img: ScanImage, tryHarder: boolean, multiple: boolean) => {
    const id = ++scanId.current;
    runner.current ??= (latest.current.options.createRunner ?? createScanJobRunner)();
    setBusy(true);
    setStatus({ state: "scanning", text: "Scanning…" });
    // the worker takes the buffer: keep a copy for a rescan
    const copy = img.data.slice();
    runner.current.run({ image: { ...img, data: copy }, symbologies: [...SYMBOLOGIES], tryHarder, multiple, deadlineMs: IMAGE_DEADLINE_MS }).then(
      ({ results, ms }) => {
        if (id !== scanId.current) return;
        setBusy(false);
        const time = (latest.current.options.now ?? (() => new Date()))();
        setEntries((current) => {
          const next = [...current];
          for (const result of results) {
            const key = keyOf(result), i = next.findIndex((e) => e.key === key);
            if (i >= 0) next[i] = { ...next[i]!, count: next[i]!.count + 1, time, ms, result };
            else next.unshift({ key, result, count: 1, time, ms });
          }
          return next;
        });
        setStatus({ state: results.length ? "found" : "none", text: describeScan(results, ms, tryHarder) });
      },
      (failure: unknown) => {
        if (id !== scanId.current) return;
        if (failure instanceof ScanWorkerError && (failure.reason === "cancelled" || failure.reason === "dropped")) return;
        setBusy(false);
        setStatus({ state: "error", text: failure instanceof ScanWorkerError && failure.reason === "unavailable" ? "Scanning needs a Web Worker, which this browser blocked" : failure instanceof Error ? failure.message : "The image could not be scanned" });
      },
    );
  }, []);

  const openFile = useCallback((file: File) => {
    setNotice("");
    if (file.size > MAX_IMAGE_BYTES) { setNotice(`File is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`); return; }
    // The running scan goes on until this file's pixels arrive: a refused file leaves it, and its answer, alone.
    const id = ++openId.current;
    (latest.current.options.readImage ?? readImageFile)(file).then(
      (img) => {
        if (!mounted.current || id !== openId.current) return;
        image.current = img;
        setSource({ name: file.name, url: URL.createObjectURL(file), width: img.width, height: img.height });
        scanImage(img, latest.current.settings.tryHarder, latest.current.settings.multiple);
      },
      (failure: unknown) => {
        if (!mounted.current || id !== openId.current) return;
        setNotice(failure instanceof Error ? failure.message : `${file.name} could not be read`);
      },
    );
  }, [scanImage]);

  const openSample = useCallback(() => {
    setNotice("");
    openId.current++;
    const img = sampleImage();
    image.current = img;
    setSource({ name: `Sample: ${SAMPLE_QR.text}`, url: null, width: img.width, height: img.height });
    scanImage(img, latest.current.settings.tryHarder, latest.current.settings.multiple);
  }, [scanImage]);

  const rescan = useCallback(() => {
    if (image.current) scanImage(image.current, latest.current.settings.tryHarder, latest.current.settings.multiple);
  }, [scanImage]);

  const update = useCallback((patch: Partial<ScannerSettings>) => {
    const next = { ...latest.current.settings, ...patch };
    latest.current.settings = next;
    setSettings(next);
    if (image.current) scanImage(image.current, next.tryHarder, next.multiple);
  }, [scanImage]);

  const clear = useCallback(() => {
    scanId.current++;
    openId.current++;
    runner.current?.cancel();
    image.current = null;
    setSource(null);
    setEntries([]);
    setBusy(false);
    setNotice("");
    setStatus({ state: "idle", text: IDLE_TEXT });
  }, []);

  return { settings, update, source, openFile, openSample, rescan, clear, entries, status, busy, notice, setNotice };
}
