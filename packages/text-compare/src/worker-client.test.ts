// @vitest-environment node
// The browser transform would rewrite `new Worker(new URL(…))` into Vite's own worker import; the test checks the call.
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareTexts } from "./core/compare";
import { answerCompareJob, type CompareJob, type CompareWorkerRequest, type CompareWorkerResponse } from "./job";
import { CompareWorkerError, createCompareJobRunner, createCompareWorker, type WorkerLike } from "./worker-client";

/** A worker that answers only when the test says so. */
class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = [];
  requests: CompareWorkerRequest[] = [];
  terminated = false;
  onMessage: ((event: { data: CompareWorkerResponse }) => void)[] = [];
  private onError: (() => void)[] = [];

  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(message: CompareWorkerRequest): void {
    this.requests.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  addEventListener(type: "message" | "error", listener: never): void {
    if (type === "message") this.onMessage.push(listener);
    else this.onError.push(listener);
  }
  /** Answers the last request, as the real worker script would. */
  answer(): void {
    const answer = answerCompareJob(this.requests.at(-1)!);
    for (const listener of this.onMessage) listener({ data: answer });
  }
  fail(): void {
    for (const listener of this.onError) listener();
  }
}

const alive = () => FakeWorker.all.filter((worker) => !worker.terminated);
const job = (right: string): CompareJob => ({ left: "a\nb\n", right, options: {} });
const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (error: unknown) => (error instanceof CompareWorkerError ? error.reason : String(error)),
  );

afterEach(() => {
  FakeWorker.all = [];
  vi.unstubAllGlobals();
});

describe("answerCompareJob", () => {
  it("answers with the diff of the job", () => {
    expect(answerCompareJob({ id: 3, job: job("a\nc\n") })).toEqual({ id: 3, value: compareTexts("a\nb\n", "a\nc\n") });
  });

  it("answers `failed` without the texts when the comparison throws", () => {
    const broken = { left: null, right: "x", options: {} } as unknown as CompareJob;
    expect(answerCompareJob({ id: 4, job: broken })).toEqual({ id: 4, error: "failed" });
  });
});

describe("createCompareJobRunner", () => {
  it("runs a job in the worker and resolves with its answer", async () => {
    const runner = createCompareJobRunner(() => new FakeWorker());
    const result = runner.run(job("a\nc\n"));
    FakeWorker.all[0]!.answer();
    expect(await result).toEqual(compareTexts("a\nb\n", "a\nc\n"));
  });

  it("reuses an idle worker for the next job", async () => {
    const runner = createCompareJobRunner(() => new FakeWorker());
    const first = runner.run(job("x\n"));
    FakeWorker.all[0]!.answer();
    await first;
    const second = runner.run(job("a\nb\n"));
    FakeWorker.all[0]!.answer();
    expect((await second).counts).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(FakeWorker.all).toHaveLength(1);
  });

  it("cancels a running job by terminating its worker, and runs the new job in a fresh one", async () => {
    const runner = createCompareJobRunner(() => new FakeWorker());
    const first = runner.run(job("x\n"));
    const second = runner.run(job("a\nb\nc\n"));
    expect(await reason(first)).toBe("cancelled");
    expect(FakeWorker.all.map((worker) => worker.terminated)).toEqual([true, false]);
    FakeWorker.all[1]!.answer();
    expect((await second).counts).toEqual({ added: 1, removed: 0, changed: 0 });
  });

  it("never keeps more than one worker alive, and none after dispose", async () => {
    const runner = createCompareJobRunner(() => new FakeWorker());
    const runs = Array.from({ length: 5 }, (_, i) => runner.run(job(`${i}\n`)));
    expect(alive()).toHaveLength(1);
    runner.dispose();
    expect(alive()).toHaveLength(0);
    expect(await Promise.all(runs.map(reason))).toEqual(["cancelled", "cancelled", "cancelled", "cancelled", "cancelled"]);
  });

  it("cancel() stops the running job; an idle runner is left alone", async () => {
    const runner = createCompareJobRunner(() => new FakeWorker());
    runner.cancel();
    expect(FakeWorker.all).toHaveLength(0);
    const running = runner.run(job("x\n"));
    runner.cancel();
    expect(await reason(running)).toBe("cancelled");
    expect(alive()).toHaveLength(0);
  });

  it("drops a late answer from a worker it already terminated", async () => {
    const runner = createCompareJobRunner(() => new FakeWorker());
    void runner.run(job("x\n")).catch(() => {});
    const second = runner.run(job("a\nb\nc\n"));
    FakeWorker.all[0]!.answer();
    FakeWorker.all[1]!.answer();
    expect((await second).counts.added).toBe(1);
  });

  it("says `unavailable` when no worker can be created, and does not try again", async () => {
    const create = vi.fn((): WorkerLike | null => null);
    const runner = createCompareJobRunner(create);
    expect(await reason(runner.run(job("x\n")))).toBe("unavailable");
    expect(await reason(runner.run(job("y\n")))).toBe("unavailable");
    expect(create).toHaveBeenCalledTimes(1);
    const throwing = createCompareJobRunner(() => {
      throw new Error("blocked by CSP");
    });
    expect(await reason(throwing.run(job("x\n")))).toBe("unavailable");
  });

  it("says `unavailable` when the worker fails to load, and terminates it", async () => {
    const runner = createCompareJobRunner(() => new FakeWorker());
    const running = runner.run(job("x\n"));
    FakeWorker.all[0]!.fail();
    expect(await reason(running)).toBe("unavailable");
    expect(alive()).toHaveLength(0);
    expect(await reason(runner.run(job("y\n")))).toBe("unavailable");
    expect(FakeWorker.all).toHaveLength(1);
  });

  it("says `failed` when the job threw inside the worker", async () => {
    const runner = createCompareJobRunner(() => new FakeWorker());
    const running = runner.run(job("x\n"));
    const worker = FakeWorker.all[0]!;
    worker.onMessage[0]!({ data: { id: worker.requests[0]!.id, error: "failed" } });
    expect(await reason(running)).toBe("failed");
  });
});

describe("createCompareWorker", () => {
  it("returns null where there are no workers", () => {
    vi.stubGlobal("Worker", undefined);
    expect(createCompareWorker()).toBeNull();
  });

  it("starts ./worker.js next to itself as a module worker", () => {
    const calls: [string, unknown][] = [];
    vi.stubGlobal(
      "Worker",
      class {
        constructor(url: { href: string }, options: unknown) {
          calls.push([url.href, options]);
        }
      },
    );
    expect(createCompareWorker()).not.toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toMatch(/\/worker\.js$/);
    expect(calls[0]![1]).toEqual({ type: "module" });
  });

  it("returns null when the browser refuses to start it", () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("SecurityError");
        }
      },
    );
    expect(createCompareWorker()).toBeNull();
  });
});
