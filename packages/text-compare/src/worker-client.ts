import type { TextDiff } from "./core/types";
import type { CompareJob, CompareWorkerRequest, CompareWorkerResponse } from "./job";

// The runner follows @web-kit/json-core's createJsonJobRunner; that one is typed for JSON jobs and starts json-core's
// own worker file, so this package has its own (see the iteration 5 plan, decision 1).

/** The parts of a Worker the runner uses. A real `Worker` fits; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: CompareWorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: { data: CompareWorkerResponse }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
}

/**
 * Starts the text-compare worker, or returns null where workers are missing or cannot start (strict CSP, old browser).
 * The call is written as `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })` on purpose:
 * webpack, Vite, Turbopack and Parcel find the worker file by that exact shape.
 */
export function createCompareWorker(): WorkerLike | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./worker.js", import.meta.url), { type: "module" }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}

/** Why a job did not finish: a newer job replaced it, workers cannot run here, or the job threw in the worker. */
export type CompareWorkerFailure = "cancelled" | "unavailable" | "failed";

export class CompareWorkerError extends Error {
  readonly reason: CompareWorkerFailure;
  constructor(reason: CompareWorkerFailure) {
    super(`Compare worker job ${reason}`);
    this.name = "CompareWorkerError";
    this.reason = reason;
  }
}

export interface CompareJobRunner {
  /**
   * Runs `job` in the worker. A job that is still running is cancelled first: its worker is terminated (a worker
   * cannot be interrupted any other way), its promise rejects with reason "cancelled", and a fresh worker takes the
   * new job. An idle worker is reused.
   */
  run(job: CompareJob): Promise<TextDiff>;
  /** Cancels the running job, if any, and terminates its worker. */
  cancel(): void;
  /** Terminates the worker. Call it when the page no longer needs the runner. */
  dispose(): void;
}

interface Pending {
  id: number;
  resolve: (value: TextDiff) => void;
  reject: (error: CompareWorkerError) => void;
}

/**
 * Runs comparisons in a worker, one at a time, the newest winning. When the worker cannot be created or fails to load,
 * every job rejects with reason "unavailable"; the caller then compares on the main thread.
 */
export function createCompareJobRunner(create: () => WorkerLike | null = createCompareWorker): CompareJobRunner {
  let worker: WorkerLike | null = null;
  let unavailable = false;
  let pending: Pending | null = null;
  let nextId = 0;

  function stop(): void {
    worker?.terminate();
    worker = null;
  }

  function settle(reason: CompareWorkerFailure): void {
    const job = pending;
    pending = null;
    job?.reject(new CompareWorkerError(reason));
  }

  function start(): WorkerLike | null {
    if (worker !== null || unavailable) return worker;
    let created: WorkerLike | null;
    try {
      created = create();
    } catch {
      created = null;
    }
    if (created === null) {
      unavailable = true;
      return null;
    }
    const instance = created;
    instance.addEventListener("message", (event) => {
      // A terminated worker's late answer, or an answer to a cancelled job, is dropped.
      if (instance !== worker || pending === null || event.data.id !== pending.id) return;
      const job = pending;
      pending = null;
      if ("error" in event.data) job.reject(new CompareWorkerError("failed"));
      else job.resolve(event.data.value);
    });
    instance.addEventListener("error", () => {
      // The script did not load or the worker crashed: do not try again on this page.
      if (instance !== worker) return;
      unavailable = true;
      stop();
      settle("unavailable");
    });
    worker = instance;
    return instance;
  }

  return {
    run(job) {
      if (pending !== null) {
        stop();
        settle("cancelled");
      }
      const current = start();
      if (current === null) return Promise.reject(new CompareWorkerError("unavailable"));
      const id = ++nextId;
      return new Promise<TextDiff>((resolve, reject) => {
        pending = { id, resolve, reject };
        current.postMessage({ id, job });
      });
    },
    cancel() {
      if (pending === null) return;
      stop();
      settle("cancelled");
    },
    dispose() {
      stop();
      settle("cancelled");
    },
  };
}
