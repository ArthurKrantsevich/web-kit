import { useEffect, useMemo, useRef, useState } from "react";
import { compareTexts } from "../core/compare";
import type { TextDiff } from "../core/types";
import type { CompareJob } from "../job";
import { CompareWorkerError, createCompareJobRunner, createCompareWorker, type CompareJobRunner } from "../worker-client";

/**
 * How long a new job waits after the last change while another job is still running. Cancelling means terminating
 * the busy worker and starting a fresh one, so typing into a large text would otherwise start a worker per key.
 */
export const JOB_DELAY = 150;

export interface CompareJobState {
  /** The diff for `job`, or null while it runs. */
  value: TextDiff | null;
  /** True while the worker works on `job`. */
  running: boolean;
  /** True when no worker could start: jobs then run on the page. */
  fallback: boolean;
  /** True when `job` threw inside the worker. */
  failed: boolean;
}

/**
 * Runs `job` in the text-compare worker; null runs nothing and cancels a running job. A new job cancels the running
 * one at once and starts JOB_DELAY ms after the last change; with no job running it starts at once. The worker is
 * terminated on unmount. When no worker can start, the job runs on the page and `fallback` is true.
 */
export function useCompareJob(job: CompareJob | null): CompareJobState {
  const runner = useRef<CompareJobRunner | null>(null);
  const [done, setDone] = useState<{ job: CompareJob; value: TextDiff } | null>(null);
  const [failed, setFailed] = useState<CompareJob | null>(null);
  const [fallback, setFallback] = useState(false);
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
    // The imported createCompareWorker is passed on explicitly, so tests can replace it by mocking the module.
    const jobs = (runner.current ??= createCompareJobRunner(createCompareWorker));
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
          if (!(error instanceof CompareWorkerError)) return;
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

  const onPage = useMemo(() => (fallback && job !== null ? compareTexts(job.left, job.right, job.options) : null), [fallback, job]);
  if (fallback) return { value: onPage, running: false, fallback, failed: false };
  const value = done !== null && done.job === job ? done.value : null;
  return { value, running: job !== null && value === null && failed !== job, fallback, failed: job !== null && failed === job };
}
