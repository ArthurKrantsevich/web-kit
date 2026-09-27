import { runJsonJob, type JsonJob, type JsonJobResult } from "@web-kit/json-core";
import { createJsonJobRunner, createJsonWorker, JsonWorkerError, type JsonJobRunner } from "@web-kit/json-core/worker-client";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * How long a new job waits after the last change while another job is still running. Cancelling means terminating
 * the busy worker and starting a fresh one, so typing into a large input would otherwise start a worker per key.
 */
export const JOB_DELAY = 150;

export interface JsonJobState {
  /** The result for `job`, or null while it runs. */
  value: JsonJobResult | null;
  /** True while the worker works on `job`. */
  running: boolean;
  /** True when no worker could start: jobs then run on the page. */
  fallback: boolean;
  /** True when `job` threw inside the worker. */
  failed: boolean;
}

/**
 * Runs `job` in the json-core worker; null runs nothing and cancels a running job. A new job cancels the running
 * one at once (its worker is terminated, so at most one is alive) and starts JOB_DELAY ms after the last change, so a
 * burst of keystrokes starts one worker; with no job running it starts at once. The worker is terminated on unmount. When no worker can
 * start, the job runs on the page with the same code and `fallback` is true.
 */
export function useJsonJob(job: JsonJob | null): JsonJobState {
  const runner = useRef<JsonJobRunner | null>(null);
  const [done, setDone] = useState<{ job: JsonJob; value: JsonJobResult } | null>(null);
  const [failed, setFailed] = useState<JsonJob | null>(null);
  const [fallback, setFallback] = useState(false);
  // True from a job's start until its answer: a job arriving meanwhile cancels it and waits JOB_DELAY.
  const busy = useRef(false);

  useEffect(
    () => () => {
      runner.current?.dispose();
      runner.current = null;
    },
    [],
  );

  useEffect(() => {
    if (job === null || fallback) {
      runner.current?.cancel();
      busy.current = false;
      return;
    }
    // The imported createJsonWorker is passed on explicitly, so tests can replace it by mocking the module.
    const jobs = (runner.current ??= createJsonJobRunner(createJsonWorker));
    let live = true;
    const start = (): void => {
      busy.current = true;
      jobs.run(job).then(
        (value) => {
          if (!live) return;
          busy.current = false;
          setDone({ job, value });
        },
        (error: unknown) => {
          if (!live) return;
          busy.current = false;
          if (!(error instanceof JsonWorkerError)) return;
          if (error.reason === "unavailable") setFallback(true);
          else if (error.reason === "failed") setFailed(job);
        },
      );
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (busy.current) {
      jobs.cancel();
      timer = setTimeout(start, JOB_DELAY);
    } else start();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [job, fallback]);

  const onPage = useMemo(() => (fallback && job !== null ? runJsonJob(job) : null), [fallback, job]);
  if (fallback) return { value: onPage, running: false, fallback, failed: false };
  const value = done !== null && done.job === job ? done.value : null;
  return { value, running: job !== null && value === null && failed !== job, fallback, failed: job !== null && failed === job };
}
