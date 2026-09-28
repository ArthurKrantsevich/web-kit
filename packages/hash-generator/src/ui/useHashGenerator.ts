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
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
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

  useEffect(() => {
    let live = true;
    const hmacKey: HmacKey | undefined = settings.hmac ? { text: key, format: settings.keyFormat } : undefined;
    const base = latest.current.version === version ? latest.current.results : {};
    const wanted = [...MAIN_ALGORITHMS, ...(expanded ? EXTRA_INFO : [])].map((algorithm) => algorithm.id);
    // With a key, only Web Crypto's algorithms have an HMAC.
    const missing = wanted.filter((id) => base[id] === undefined && (!hmacKey || WEB.has(id)));
    setError(null);
    if (hmacKey) {
      const bytes = keyBytes(hmacKey);
      if (!bytes.ok) {
        setComputed({ version, results: {} });
        setPending(null);
        setError(bytes.error.message);
        return;
      }
    }
    if (file && file.size > MAX_FILE_BYTES) {
      setComputed({ version, results: {} });
      setPending(null);
      setError(`${file.name} is ${formatSize(file.size)}; files up to ${formatSize(MAX_FILE_BYTES)} can be hashed`);
      return;
    }
    if (missing.length === 0) {
      setPending(null);
      if (latest.current.version !== version) setComputed({ version, results: base });
      return;
    }
    const done = (results: HashResults) => {
      if (!live) return;
      setComputed({ version, results: { ...base, ...results } });
      setPending(null);
    };
    const encoded = file === null ? new TextEncoder().encode(settings.text) : null;
    if (file !== null || encoded!.length > WORKER_THRESHOLD) {
      const blob = file ?? new Blob([encoded!]);
      const name = file?.name ?? "the text";
      setPending({ name, share: 0 });
      setNote(null);
      runner.current ??= createRunner();
      const job = { blob, algorithms: missing, hmacKey: hmacKey ?? null };
      runner.current.run(job, (share) => live && setPending({ name, share })).then(done, (failure: unknown) => {
        if (!live || (failure instanceof HashWorkerError && failure.reason === "cancelled")) return;
        if (failure instanceof HashWorkerError && failure.reason === "unavailable") {
          // No worker: the page reads the file in 1 MB parts and lets a frame pass after each.
          setNote(WORKER_FALLBACK_NOTE);
          const all = [...MAIN_ALGORITHMS, ...(extra ?? [])].filter((algorithm) => missing.includes(algorithm.id));
          void hashAll(blob, {
            algorithms: all,
            hmacKey,
            chunkSize: 1024 * 1024,
            onProgress: (bytes) => live && setPending({ name, share: bytes / Math.max(1, blob.size) }),
            pause: () => new Promise((resolve) => setTimeout(resolve, 0)),
          }).then((result) => {
            if (!live) return;
            if (result.ok) done(result.value);
            else {
              setPending(null);
              setError(result.error.message);
            }
          });
          return;
        }
        setPending(null);
        setError(failure instanceof Error ? failure.message : "Could not hash the file");
      });
      return () => {
        live = false;
        runner.current?.cancel();
      };
    }
    // A text up to 1 MB: on the page. The extra algorithms join once their module has loaded.
    const algorithms = [...MAIN_ALGORITHMS, ...(extra ?? [])].filter((algorithm) => missing.includes(algorithm.id));
    setPending(null);
    void hashAll(encoded!, { algorithms, hmacKey }).then((result) => {
      if (!live) return;
      if (result.ok) done(result.value);
      else setError(result.error.message);
    });
    return () => {
      live = false;
    };
    // `version` stands for the text, the file, the HMAC switch and the key.
  }, [version, expanded, extra]);

  const algorithms = useMemo(() => [...MAIN_ALGORITHMS, ...(expanded ? EXTRA_INFO : [])], [expanded]);
  const results = computed.version === version ? computed.results : {};
  const match = useMemo(() => matchDigest(verify, results), [verify, results]);

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
