import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXTRA_INFO, MAIN_ALGORITHMS } from "../core/algorithms";
import { hashAll } from "../core/hash";
import { matchDigest, type DigestMatch } from "../core/match";
import type { AlgorithmId, DigestEncoding, HashAlgorithm, HashResults, HmacKey } from "../core/types";
import { keyBytes } from "../core/webcrypto";
import { createHashJobRunner, HashWorkerError, type HashJobRunner } from "../worker-client";

/** Files larger than this are refused. */
export const MAX_FILE_BYTES: number = 512 * 1024 * 1024;
/** Texts larger than this (UTF-8) are hashed in workers, like files. */
export const WORKER_THRESHOLD: number = 1024 * 1024;
/** Said when no worker can start and the page hashes the file itself. */
export const WORKER_FALLBACK_NOTE = "Workers are not available here: the file was hashed on the page";

/** What a share link carries and "Save input" keeps: never a file or the HMAC key. */
export interface HashSettings {
  text: string;
  encoding: DigestEncoding;
  hmac: boolean;
  keyFormat: HmacKey["format"];
  /** "More algorithms" is open. */
  expanded: boolean;
}

export const DEFAULT_SETTINGS: HashSettings = { text: "", encoding: "hex", hmac: false, keyFormat: "text", expanded: false };

export interface UseHashGeneratorOptions {
  initialSettings?: Partial<HashSettings>;
  /** Loads the algorithms behind "More algorithms"; by default the package's own `./extra` entry. */
  loadExtra?: () => Promise<readonly HashAlgorithm[]>;
  /** Makes the runner of file jobs; tests pass one with fake workers. */
  createRunner?: () => HashJobRunner;
}

export interface UseHashGenerator {
  settings: HashSettings;
  update: (patch: Partial<HashSettings>) => void;
  /** The HMAC key as typed; kept only in memory. */
  key: string;
  setKey: (key: string) => void;
  /** The open file, or null for the text. */
  file: File | null;
  /** Opens a file; one over 512 MB is refused with a message. */
  openFile: (file: File) => void;
  /** Back to the text. */
  closeFile: () => void;
  /** The algorithms the table shows, in order. */
  algorithms: readonly Pick<HashAlgorithm, "id" | "name" | "bytes" | "webCrypto">[];
  /** Digests of the current input; an algorithm still being computed (or without an HMAC) is missing. */
  results: HashResults;
  /** A file (or a large text) being hashed: its name and the share done, 0 to 1. */
  pending: { name: string; share: number } | null;
  /** Why nothing could be hashed, or null. */
  error: string | null;
  /** Something to know about the result, such as the page hashing a file itself. */
  note: string | null;
  verify: string;
  setVerify: (text: string) => void;
  match: DigestMatch;
}

const loadExtraAlgorithms = (): Promise<readonly HashAlgorithm[]> => import("../extra/index").then((module) => module.EXTRA_ALGORITHMS);
const WEB = new Set<AlgorithmId>(MAIN_ALGORITHMS.filter((algorithm) => algorithm.webCrypto).map((algorithm) => algorithm.id));

/** "12.4 MB", for messages. */
export function formatSize(bytes: number): string {
  // A whole number is written without ".0": the limit reads "512 MB" wherever it is named.
  const unit = (value: number, digits: number, name: string) => `${Number(value.toFixed(digits))} ${name}`;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return unit(bytes / 1024, 1, "KB");
  if (bytes < 1024 * 1024 * 1024) return unit(bytes / 1024 / 1024, 1, "MB");
  return unit(bytes / 1024 / 1024 / 1024, 2, "GB");
}

/** The hash generator's state without markup. Texts up to 1 MB are hashed on the page, files and larger texts in workers. */
export function useHashGenerator(options: UseHashGeneratorOptions = {}): UseHashGenerator {
  const [settings, setSettings] = useState<HashSettings>(() => ({ ...DEFAULT_SETTINGS, ...options.initialSettings }));
  const [key, setKeyState] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [extra, setExtra] = useState<readonly HashAlgorithm[] | null>(null);
  const [verify, setVerify] = useState("");
  // Every change of the input, the HMAC switch or the key starts a new version; results belong to one version.
  const [version, setVersion] = useState(0);
  const [computed, setComputed] = useState<{ version: number; results: HashResults }>({ version: -1, results: {} });
  const [pending, setPending] = useState<{ name: string; share: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const runner = useRef<HashJobRunner | null>(null);
  const latest = useRef(computed);
  latest.current = computed;
  const loadExtra = options.loadExtra ?? loadExtraAlgorithms;
  const createRunner = options.createRunner ?? createHashJobRunner;

  const bump = useCallback(() => setVersion((value) => value + 1), []);
  const update = useCallback(
    (patch: Partial<HashSettings>) => {
      setSettings((current) => ({ ...current, ...patch }));
      if ("text" in patch || "hmac" in patch || "keyFormat" in patch) bump();
    },
    [bump],
  );
  const setKey = useCallback(
    (next: string) => {
      setKeyState(next);
      bump();
    },
    [bump],
  );

  const { expanded } = settings;
  useEffect(() => {
    if (!expanded || extra !== null) return;
    let live = true;
    loadExtra().then(
      (list) => live && setExtra(list),
      () => live && setNote("The extra algorithms could not be loaded"),
    );
    return () => {
      live = false;
    };
  }, [expanded, extra, loadExtra]);

  useEffect(() => () => runner.current?.dispose(), []);

  // The job hashing the current version, if one runs: opening More algorithms never restarts it; the algorithms it
  // lacks follow as a job of their own once it ends. Only a new version (text, file, HMAC, key) cancels it.
  const active = useRef<{ version: number; stop: () => void } | null>(null);
  const current = useRef(version);
  current.current = version;
  useEffect(
    () => () => {
      active.current?.stop();
      active.current = null;
    },
    [version],
  );

  useEffect(() => {
    const hmacKey: HmacKey | undefined = settings.hmac ? { text: key, format: settings.keyFormat } : undefined;
    if (hmacKey) {
      const bytes = keyBytes(hmacKey);
      if (!bytes.ok) {
        // Once per version: `computed` is a dependency, and a new object each time would never settle.
        if (latest.current.version !== version) setComputed({ version, results: {} });
        setPending(null);
        setError(bytes.error.message);
        return;
      }
    }
    if (file && file.size > MAX_FILE_BYTES) {
      if (latest.current.version !== version) setComputed({ version, results: {} });
      setPending(null);
      setError(`${file.name} is ${formatSize(file.size)}; files up to ${formatSize(MAX_FILE_BYTES)} can be hashed`);
      return;
    }
    setError(null);
    // A job of this version still runs: what it lacks is asked for when it ends (its results change `computed`).
    if (active.current?.version === version) return;
    const base = latest.current.version === version ? latest.current.results : {};
    const wanted = [...MAIN_ALGORITHMS, ...(expanded ? EXTRA_INFO : [])].map((algorithm) => algorithm.id);
    // With a key, only Web Crypto's algorithms have an HMAC; the extra ones wait for their module.
    const available = new Set([...MAIN_ALGORITHMS, ...(extra ?? [])].map((algorithm) => algorithm.id));
    const missing = wanted.filter((id) => base[id] === undefined && (!hmacKey || WEB.has(id)));
    if (missing.length === 0) {
      setPending(null);
      if (latest.current.version !== version) setComputed({ version, results: base });
      return;
    }
    const encoded = file === null ? new TextEncoder().encode(settings.text) : null;
    const onPage = file === null && encoded!.length <= WORKER_THRESHOLD;
    // On the page, the extra algorithms wait for their module: nothing to do until it has loaded.
    const algorithms = [...MAIN_ALGORITHMS, ...(extra ?? [])].filter((algorithm) => missing.includes(algorithm.id) && available.has(algorithm.id));
    if (onPage && algorithms.length === 0) {
      setPending(null);
      return;
    }
    const mine = () => current.current === version;
    const job = { version, stop: () => {} };
    active.current = job;
    const end = () => {
      if (active.current === job) active.current = null;
    };
    const done = (results: HashResults) => {
      if (!mine()) return;
      end();
      setPending(null);
      setComputed((now) => ({ version, results: { ...(now.version === version ? now.results : {}), ...results } }));
    };
    const failed = (message: string) => {
      if (!mine()) return;
      end();
      setPending(null);
      setError(message);
    };
    if (!onPage) {
      const blob = file ?? new Blob([encoded!]);
      const name = file?.name ?? "the text";
      // Workers get every missing algorithm (they load the extra ones themselves).
      const ids = missing;
      setPending({ name, share: 0 });
      setNote(null);
      runner.current ??= createRunner();
      const controller = new AbortController();
      job.stop = () => {
        controller.abort();
        runner.current?.cancel();
      };
      runner.current.run({ blob, algorithms: ids, hmacKey: hmacKey ?? null }, (share) => mine() && setPending({ name, share })).then(done, (failure: unknown) => {
        if (!mine() || (failure instanceof HashWorkerError && failure.reason === "cancelled")) return;
        if (failure instanceof HashWorkerError && failure.reason === "unavailable") {
          // No worker: the page reads the file in 1 MB parts and lets a frame pass after each; a new version aborts it.
          setNote(WORKER_FALLBACK_NOTE);
          const list = [...MAIN_ALGORITHMS, ...(extra ?? [])].filter((algorithm) => ids.includes(algorithm.id));
          // Only extra algorithms whose module has not loaded yet: wait for it (`extra` then starts a new job).
          if (list.length === 0) {
            end();
            setPending(null);
            return;
          }
          void hashAll(blob, {
            algorithms: list,
            hmacKey,
            chunkSize: 1024 * 1024,
            signal: controller.signal,
            onProgress: (bytes) => mine() && setPending({ name, share: bytes / Math.max(1, blob.size) }),
            pause: () => new Promise((resolve) => setTimeout(resolve, 0)),
          }).then((result) => (result.ok ? done(result.value) : controller.signal.aborted ? undefined : failed(result.error.message)));
          return;
        }
        failed(failure instanceof Error ? failure.message : "Could not hash the file");
      });
      return;
    }
    // A text up to 1 MB: on the page. The extra algorithms join once their module has loaded.
    setPending(null);
    void hashAll(encoded!, { algorithms, hmacKey }).then((result) => (result.ok ? done(result.value) : failed(result.error.message)));
    // `version` stands for the text, the file, the HMAC switch and the key; `computed` brings the follow-up job.
  }, [version, expanded, extra, computed]);

  const algorithms = useMemo(() => [...MAIN_ALGORITHMS, ...(expanded ? EXTRA_INFO : [])], [expanded]);
  const results = computed.version === version ? computed.results : {};
  const match = useMemo(() => {
    const found = matchDigest(verify, results);
    // With a key only Web Crypto's algorithms have an HMAC: no other one can be offered to compute.
    return found.status === "none" && settings.hmac ? { ...found, uncomputed: found.uncomputed.filter((id) => WEB.has(id)) } : found;
  }, [verify, results, settings.hmac]);

  return {
    settings,
    update,
    key,
    setKey,
    file,
    openFile: (next) => {
      setFile(next);
      bump();
    },
    closeFile: () => {
      setFile(null);
      bump();
    },
    algorithms,
    results,
    pending,
    error,
    note,
    verify,
    setVerify,
    match,
  };
}
