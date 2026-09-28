import type { AlgorithmId, HashResults } from "./core/types";
import { planGroups, type HashJob, type HashWorkerRequest, type HashWorkerResponse } from "./job";

// Follows @web-kit/text-compare's runner (one job at a time, the newest wins by terminating the old workers), with a
// small pool: a file's algorithms are split between a few workers, each reading the file once.

/** The parts of a Worker the runner uses. A real `Worker` fits; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: HashWorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: { data: HashWorkerResponse }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
}

/**
 * Starts a hash worker, or returns null where workers are missing or cannot start (strict CSP, old browser). The call
 * is written as `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })` on purpose: webpack, Vite,
 * Turbopack and Parcel find the worker file by that exact shape.
 */
export function createHashWorker(): WorkerLike | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./worker.js", import.meta.url), { type: "module" }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}

/** Why a job did not finish: a newer job replaced it, workers cannot run here, or reading or hashing failed. */
export type HashWorkerFailure = "cancelled" | "unavailable" | "failed";

export class HashWorkerError extends Error {
  readonly reason: HashWorkerFailure;
  constructor(reason: HashWorkerFailure, message: string = `Hash worker job ${reason}`) {
    super(message);
    this.name = "HashWorkerError";
    this.reason = reason;
  }
}

export interface HashJobRunner {
  /**
   * Hashes `job.blob` with `job.algorithms`, split between the pool's workers. `onProgress` gets the share of the
   * work done, 0 to 1. A job that is still running is cancelled first: its workers are terminated and its promise
   * rejects with reason "cancelled".
   */
  run(job: HashJob, onProgress?: (share: number) => void): Promise<HashResults>;
  cancel(): void;
  dispose(): void;
}

/** One worker less than the processor's threads, 1 to 4. */
export function poolSize(): number {
  const threads = typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(4, threads - 1));
}

interface Handler {
  message: (data: HashWorkerResponse) => void;
  error: () => void;
}

export function createHashJobRunner(create: () => WorkerLike | null = createHashWorker, size: number = poolSize()): HashJobRunner {
  const idle: WorkerLike[] = [];
  /** The workers of the running job, each with what to do with its messages. */
  const handlers = new Map<WorkerLike, Handler>();
  let unavailable = false;
  let reject: ((error: HashWorkerError) => void) | null = null;
  let nextId = 0;

  function stop(reason: HashWorkerFailure, message?: string): void {
    for (const worker of handlers.keys()) worker.terminate();
    handlers.clear();
    const fail = reject;
    reject = null;
    fail?.(new HashWorkerError(reason, message));
  }

  function take(): WorkerLike | null {
    const reused = idle.pop();
    if (reused) return reused;
    if (unavailable) return null;
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
    const worker = created;
    worker.addEventListener("message", (event) => handlers.get(worker)?.message(event.data));
    worker.addEventListener("error", () => handlers.get(worker)?.error());
    return worker;
  }

  return {
    run(job, onProgress) {
      if (reject !== null) stop("cancelled");
      const groups = planGroups(job.algorithms, size);
      const workers: WorkerLike[] = [];
      for (let i = 0; i < groups.length; i++) {
        const worker = take();
        if (worker === null) break;
        workers.push(worker);
      }
      if (workers.length === 0) return Promise.reject(new HashWorkerError("unavailable"));
      // Fewer workers than groups (some could not start): plan again for the ones there are.
      const plan = workers.length === groups.length ? groups : planGroups(job.algorithms, workers.length);
      const id = ++nextId;
      return new Promise<HashResults>((resolve, fail) => {
        reject = fail;
        const done = new Array<number>(plan.length).fill(0);
        const total = Math.max(1, job.blob.size) * plan.length;
        const results: HashResults = {};
        plan.forEach((algorithms: AlgorithmId[], index) => {
          const worker = workers[index]!;
          handlers.set(worker, {
            message(data) {
              if (data.id !== id) return;
              if ("done" in data) {
                done[index] = data.done;
                onProgress?.(done.reduce((sum, value) => sum + value, 0) / total);
              } else if ("digests" in data) {
                Object.assign(results, data.digests);
                handlers.delete(worker);
                idle.push(worker);
                if (handlers.size > 0) return;
                reject = null;
                const ordered: HashResults = {};
                for (const algorithm of job.algorithms) if (results[algorithm]) ordered[algorithm] = results[algorithm];
                resolve(ordered);
              } else stop("failed", data.error);
            },
            error() {
              // The script did not load or the worker crashed: do not try again on this page.
              unavailable = true;
              for (const spare of idle.splice(0)) spare.terminate();
              stop("unavailable");
            },
          });
          worker.postMessage({ id, job: { ...job, algorithms } });
        });
      });
    },
    cancel() {
      if (reject !== null) stop("cancelled");
    },
    dispose() {
      for (const worker of idle.splice(0)) worker.terminate();
      stop("cancelled");
    },
  };
}
