import type { JsonJob, JsonJobResult, JsonWorkerRequest, JsonWorkerResponse } from "./job";

/** The parts of a Worker the runner uses. A real `Worker` fits; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: JsonWorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: { data: JsonWorkerResponse }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
}

// json-core is built without the DOM lib; these are the browser globals this file needs.
declare const Worker: new (url: unknown, options: { type: "module" }) => WorkerLike;
declare const URL: new (url: string, base: string) => unknown;

/**
 * Starts the json-core worker, or returns null where workers are missing or cannot start (strict CSP, old browser).
 * The call is written as `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })` on purpose:
 * webpack, Vite, Turbopack and Parcel find the worker file by that exact shape.
 */
export function createJsonWorker(): WorkerLike | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./worker.js", (import.meta as unknown as { url: string }).url), { type: "module" });
  } catch {
    return null;
  }
}

/** Why a job did not finish: a newer job replaced it, workers cannot run here, or the job threw in the worker. */
export type JsonWorkerFailure = "cancelled" | "unavailable" | "failed";

export class JsonWorkerError extends Error {
  readonly reason: JsonWorkerFailure;
  constructor(reason: JsonWorkerFailure) {
    super(`JSON worker job ${reason}`);
    this.name = "JsonWorkerError";
    this.reason = reason;
  }
}

export interface JsonJobRunner {
  /**
   * Runs `job` in the worker. A job that is still running is cancelled first: its worker is terminated (a worker
   * cannot be interrupted any other way), its promise rejects with reason "cancelled", and a fresh worker takes the
   * new job. An idle worker is reused.
   */
  run(job: JsonJob): Promise<JsonJobResult>;
  /** Cancels the running job, if any, and terminates its worker. */
  cancel(): void;
  /** Terminates the worker. Call it when the page no longer needs the runner. */
  dispose(): void;
}

interface Pending {
  id: number;
  resolve: (value: JsonJobResult) => void;
  reject: (error: JsonWorkerError) => void;
}

/**
 * Runs JSON jobs in a worker, one at a time, the newest winning. When the worker cannot be created or fails to load,
 * every job rejects with reason "unavailable"; the caller then does the work on the main thread.
 */
export function createJsonJobRunner(create: () => WorkerLike | null = createJsonWorker): JsonJobRunner {
  let worker: WorkerLike | null = null;
  let unavailable = false;
  let pending: Pending | null = null;
  let nextId = 0;

  function stop(): void {
    worker?.terminate();
    worker = null;
  }

  function settle(reason: JsonWorkerFailure): void {
    const job = pending;
    pending = null;
    job?.reject(new JsonWorkerError(reason));
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
      if ("error" in event.data) job.reject(new JsonWorkerError("failed"));
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
      if (current === null) return Promise.reject(new JsonWorkerError("unavailable"));
      const id = ++nextId;
      return new Promise<JsonJobResult>((resolve, reject) => {
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

export type { JsonJob, JsonJobResult } from "./job";
