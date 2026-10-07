import type { ScanJob, ScanRequest, ScanResponse } from "./job";
import type { ScanResult } from "./core/types";

/** The parts of a Worker the runner uses. A real `Worker` fits; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: ScanRequest, transfer?: Transferable[]): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: { data: ScanResponse }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
}

/**
 * Starts the scan worker, or returns null where workers are missing or cannot start. The call is written as
 * `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })` on purpose: bundlers find the worker file
 * by that exact shape.
 */
export function createScanWorker(): WorkerLike | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./worker.js", import.meta.url), { type: "module" }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}

/** Why a frame was not scanned: cancelled by the caller, replaced by a newer waiting frame, no worker, or the worker said why. */
export type ScanWorkerFailure = "cancelled" | "dropped" | "unavailable" | "failed";

export class ScanWorkerError extends Error {
  readonly reason: ScanWorkerFailure;
  constructor(reason: ScanWorkerFailure, message: string = `Scan ${reason}`) {
    super(message);
    this.name = "ScanWorkerError";
    this.reason = reason;
  }
}

export interface ScanOutcome {
  results: ScanResult[];
  ms: number;
}

export interface ScanJobRunner {
  /**
   * Scans a frame in the worker. One frame runs at a time; a frame given while one runs waits as the single pending
   * frame, and a newer one replaces it (the replaced promise rejects with reason "dropped"). The frame's buffer is
   * transferred, not copied.
   */
  run(job: ScanJob): Promise<ScanOutcome>;
  /** Rejects the running and the waiting frame with "cancelled"; the worker stays for the next frame. */
  cancel(): void;
  /** Terminates the worker; later frames reject as "unavailable". */
  dispose(): void;
}

interface Waiting {
  job: ScanJob;
  resolve: (outcome: ScanOutcome) => void;
  reject: (error: ScanWorkerError) => void;
}

export function createScanJobRunner(create: () => WorkerLike | null = createScanWorker): ScanJobRunner {
  let worker: WorkerLike | null = null, unavailable = false, disposed = false, nextId = 0;
  let running: (Waiting & { id: number }) | null = null, pending: Waiting | null = null;

  function send(w: Waiting): void {
    const id = ++nextId;
    running = { ...w, id };
    const data = w.job.image.data;
    worker!.postMessage({ id, job: w.job }, [data.buffer as ArrayBuffer]);
  }
  function next(): void {
    if (pending === null || worker === null) return;
    const w = pending;
    pending = null;
    send(w);
  }
  function fail(reason: ScanWorkerFailure, message?: string): void {
    const r = running, p = pending;
    running = null;
    pending = null;
    r?.reject(new ScanWorkerError(reason, message));
    p?.reject(new ScanWorkerError(reason, message));
  }
  function start(): WorkerLike | null {
    if (worker !== null || unavailable || disposed) return worker;
    let created: WorkerLike | null;
    try { created = create(); } catch { created = null; }
    if (created === null) { unavailable = true; return null; }
    worker = created;
    worker.addEventListener("message", (event) => {
      const data = event.data;
      if (running === null || data.id !== running.id) return; // a cancelled frame's late answer
      const r = running;
      running = null;
      if ("results" in data) r.resolve({ results: data.results, ms: data.ms }); else r.reject(new ScanWorkerError("failed", data.error));
      next();
    });
    worker.addEventListener("error", () => {
      unavailable = true;
      worker = null;
      fail("unavailable");
    });
    return worker;
  }

  return {
    run(job) {
      return new Promise<ScanOutcome>((resolve, reject) => {
        if (start() === null) { reject(new ScanWorkerError("unavailable")); return; }
        const w: Waiting = { job, resolve, reject };
        if (running === null) send(w);
        else { pending?.reject(new ScanWorkerError("dropped")); pending = w; }
      });
    },
    cancel() { fail("cancelled"); },
    dispose() {
      disposed = true;
      fail("cancelled");
      worker?.terminate();
      worker = null;
    },
  };
}
