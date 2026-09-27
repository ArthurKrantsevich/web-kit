import { afterEach, describe, expect, it, vi } from "vitest";
import { answerJsonJob, runJsonJob, type JsonJob, type JsonWorkerRequest, type JsonWorkerResponse } from "./job";
import { createJsonJobRunner, createJsonWorker, JsonWorkerError, type WorkerLike } from "./worker-client";

/** A worker that answers only when the test says so. */
class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = [];
  requests: JsonWorkerRequest[] = [];
  terminated = false;
  private onMessage: ((event: { data: JsonWorkerResponse }) => void)[] = [];
  private onError: (() => void)[] = [];

  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(message: JsonWorkerRequest): void {
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
    const answer = answerJsonJob(this.requests.at(-1)!);
    for (const listener of this.onMessage) listener({ data: answer });
  }
  fail(): void {
    for (const listener of this.onError) listener();
  }
}

const alive = () => FakeWorker.all.filter((worker) => !worker.terminated);
const job = (input: string): JsonJob => ({ input, mode: "format", indent: 2, sortKeys: false });
const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (error: unknown) => (error instanceof JsonWorkerError ? error.reason : String(error)),
  );

afterEach(() => {
  FakeWorker.all = [];
  vi.unstubAllGlobals();
});

describe("createJsonJobRunner", () => {
  it("runs a job in the worker and resolves with its answer", async () => {
    const runner = createJsonJobRunner(() => new FakeWorker());
    const result = runner.run(job('{"a":1}'));
    FakeWorker.all[0]!.answer();
    expect(await result).toEqual(runJsonJob(job('{"a":1}')));
  });

  it("reuses an idle worker for the next job", async () => {
    const runner = createJsonJobRunner(() => new FakeWorker());
    const first = runner.run(job("[1]"));
    FakeWorker.all[0]!.answer();
    await first;
    const second = runner.run(job("[2]"));
    FakeWorker.all[0]!.answer();
    expect((await second).result).toEqual({ ok: true, value: "[\n  2\n]" });
    expect(FakeWorker.all).toHaveLength(1);
  });

  it("cancels a running job by terminating its worker, and runs the new job in a fresh one", async () => {
    const runner = createJsonJobRunner(() => new FakeWorker());
    const first = runner.run(job("[1]"));
    const second = runner.run(job("[2]"));
    expect(await reason(first)).toBe("cancelled");
    expect(FakeWorker.all.map((worker) => worker.terminated)).toEqual([true, false]);
    FakeWorker.all[1]!.answer();
    expect((await second).result).toEqual({ ok: true, value: "[\n  2\n]" });
  });

  it("never keeps more than one worker alive, and none after dispose", async () => {
    const runner = createJsonJobRunner(() => new FakeWorker());
    const runs = Array.from({ length: 5 }, (_, i) => runner.run(job(`[${i}]`)));
    expect(alive()).toHaveLength(1);
    runner.dispose();
    expect(alive()).toHaveLength(0);
    expect(await Promise.all(runs.map(reason))).toEqual(["cancelled", "cancelled", "cancelled", "cancelled", "cancelled"]);
  });

  it("cancel() stops the running job; an idle worker is left alone", async () => {
    const runner = createJsonJobRunner(() => new FakeWorker());
    runner.cancel();
    expect(FakeWorker.all).toHaveLength(0);
    const running = runner.run(job("[1]"));
    runner.cancel();
    expect(await reason(running)).toBe("cancelled");
    expect(alive()).toHaveLength(0);
  });

  it("drops a late answer from a worker it already terminated", async () => {
    const runner = createJsonJobRunner(() => new FakeWorker());
    void runner.run(job("[1]")).catch(() => {});
    const second = runner.run(job("[2]"));
    FakeWorker.all[0]!.answer();
    FakeWorker.all[1]!.answer();
    expect((await second).source).toBe("[2]");
  });

  it("says `unavailable` when no worker can be created, and does not try again", async () => {
    const create = vi.fn((): WorkerLike | null => null);
    const runner = createJsonJobRunner(create);
    expect(await reason(runner.run(job("[1]")))).toBe("unavailable");
    expect(await reason(runner.run(job("[2]")))).toBe("unavailable");
    expect(create).toHaveBeenCalledTimes(1);
    const throwing = createJsonJobRunner(() => {
      throw new Error("blocked by CSP");
    });
    expect(await reason(throwing.run(job("[1]")))).toBe("unavailable");
  });

  it("says `unavailable` when the worker fails to load, and terminates it", async () => {
    const runner = createJsonJobRunner(() => new FakeWorker());
    const running = runner.run(job("[1]"));
    FakeWorker.all[0]!.fail();
    expect(await reason(running)).toBe("unavailable");
    expect(alive()).toHaveLength(0);
    expect(await reason(runner.run(job("[2]")))).toBe("unavailable");
    expect(FakeWorker.all).toHaveLength(1);
  });

  it("says `failed` when the job threw inside the worker", async () => {
    const runner = createJsonJobRunner(() => new FakeWorker());
    const running = runner.run(job("[1]"));
    const worker = FakeWorker.all[0]!;
    (worker as unknown as { onMessage: ((event: { data: JsonWorkerResponse }) => void)[] }).onMessage[0]!({
      data: { id: worker.requests[0]!.id, error: "failed" },
    });
    expect(await reason(running)).toBe("failed");
  });
});

describe("createJsonWorker", () => {
  it("returns null where there are no workers", () => {
    vi.stubGlobal("Worker", undefined);
    expect(createJsonWorker()).toBeNull();
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
    expect(createJsonWorker()).not.toBeNull();
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
    expect(createJsonWorker()).toBeNull();
  });
});
