// @vitest-environment node
// The browser transform would rewrite `new Worker(new URL(…))` into Vite's own worker import; the test checks the call.
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashAll } from "./core/hash";
import type { AlgorithmId } from "./core/types";
import { ALL_ALGORITHMS } from "./extra/index";
import { answerHashJob, planGroups, type HashJob, type HashWorkerRequest, type HashWorkerResponse } from "./job";
import { createHashJobRunner, createHashWorker, HashWorkerError, poolSize, type WorkerLike } from "./worker-client";

/** A worker that answers only when the test says so, as the real worker script would. */
class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = [];
  requests: HashWorkerRequest[] = [];
  terminated = false;
  private onMessage: ((event: { data: HashWorkerResponse }) => void)[] = [];
  private onError: (() => void)[] = [];

  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(message: HashWorkerRequest): void {
    this.requests.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  addEventListener(type: "message" | "error", listener: never): void {
    if (type === "message") this.onMessage.push(listener);
    else this.onError.push(listener);
  }
  async answer(): Promise<void> {
    await answerHashJob(this.requests.at(-1)!, (data) => {
      for (const listener of this.onMessage) listener({ data });
    });
  }
  fail(): void {
    for (const listener of this.onError) listener();
  }
}

const IDS: AlgorithmId[] = ["md5", "sha1", "sha256", "sha384", "sha512", "crc32"];
const job = (text = "abc", algorithms = IDS): HashJob => ({ blob: new Blob([text]), algorithms, hmacKey: null });
const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (error: unknown) => (error instanceof HashWorkerError ? `${error.reason}: ${error.message}` : String(error)),
  );

afterEach(() => {
  FakeWorker.all = [];
  vi.unstubAllGlobals();
});

describe("planGroups", () => {
  it("keeps Web Crypto's four together and balances the rest by cost, in the given order", () => {
    expect(planGroups(IDS, 3)).toEqual([["sha1", "sha256", "sha384", "sha512"], ["md5"], ["crc32"]]);
    expect(planGroups(IDS, 1)).toEqual([IDS]);
    const all = ALL_ALGORITHMS.map((algorithm) => algorithm.id);
    const groups = planGroups(all, 4);
    expect(groups).toHaveLength(4);
    expect(groups.flat().sort()).toEqual([...all].sort());
    expect(groups.some((group) => (["sha1", "sha256", "sha384", "sha512"] as const).every((id) => group.includes(id)))).toBe(true);
  });

  it("never makes empty groups", () => {
    expect(planGroups(["md5"], 4)).toEqual([["md5"]]);
    expect(planGroups([], 4)).toEqual([]);
  });
});

describe("answerHashJob", () => {
  it("reports the bytes read, then the digests, the same as hashing on the page", async () => {
    const posted: HashWorkerResponse[] = [];
    await answerHashJob({ id: 7, job: job() }, (response) => posted.push(response));
    const expected = await hashAll("abc");
    expect(posted).toEqual([{ id: 7, done: 3 }, { id: 7, digests: expected.ok ? expected.value : {} }]);
  });

  it("answers with a message, never the data, when the key or the file cannot be read", async () => {
    const posted: HashWorkerResponse[] = [];
    await answerHashJob({ id: 8, job: { ...job(), hmacKey: { text: "xyz", format: "hex" } } }, (response) => posted.push(response));
    const broken = { size: 1, slice: () => ({ arrayBuffer: () => Promise.reject(new Error("gone")) }) } as unknown as Blob;
    await answerHashJob({ id: 9, job: { ...job(), blob: broken } }, (response) => posted.push(response));
    expect(posted).toEqual([
      { id: 8, error: 'The key is not hex: "x" is not a hexadecimal digit' },
      { id: 9, error: "Could not read the file" },
    ]);
  });
});

describe("createHashJobRunner", () => {
  it("splits a job between workers, reports progress and resolves with every digest in the job's order", async () => {
    const runner = createHashJobRunner(() => new FakeWorker(), 3);
    const progress: number[] = [];
    const result = runner.run(job("hello"), (share) => progress.push(share));
    expect(FakeWorker.all.map((worker) => worker.requests[0]!.job.algorithms)).toEqual([["sha1", "sha256", "sha384", "sha512"], ["md5"], ["crc32"]]);
    for (const worker of FakeWorker.all) await worker.answer();
    const expected = await hashAll("hello");
    expect(await result).toEqual(expected.ok ? expected.value : null);
    expect(Object.keys(await result)).toEqual(IDS);
    expect(progress.map((share) => Math.round(share * 3))).toEqual([1, 2, 3]);
  });

  it("reuses idle workers, and a new job cancels the running one by terminating its workers", async () => {
    const runner = createHashJobRunner(() => new FakeWorker(), 2);
    const first = runner.run(job("a"));
    const [a, b] = FakeWorker.all;
    const second = runner.run(job("b"));
    expect(await reason(first)).toBe("cancelled: Hash worker job cancelled");
    expect([a!.terminated, b!.terminated, FakeWorker.all.length]).toEqual([true, true, 4]);
    for (const worker of FakeWorker.all.slice(2)) await worker.answer();
    await second;
    const third = runner.run(job("c"));
    expect(FakeWorker.all.length).toBe(4);
    runner.dispose();
    expect(await reason(third)).toBe("cancelled: Hash worker job cancelled");
    expect(FakeWorker.all.every((worker) => worker.terminated)).toBe(true);
  });

  it("rejects with the worker's message when reading fails, and as unavailable when workers cannot start or crash", async () => {
    const failing = createHashJobRunner(() => new FakeWorker(), 1);
    const read = failing.run({ ...job(), hmacKey: { text: "", format: "text" } });
    await FakeWorker.all[0]!.answer();
    expect(await reason(read)).toBe("failed: Enter the HMAC key");

    expect(await reason(createHashJobRunner(() => null, 2).run(job()))).toBe("unavailable: Hash worker job unavailable");
    const crashing = createHashJobRunner(() => new FakeWorker(), 1);
    const crashed = crashing.run(job());
    FakeWorker.all.at(-1)!.fail();
    expect(await reason(crashed)).toBe("unavailable: Hash worker job unavailable");
    expect(await reason(crashing.run(job()))).toBe("unavailable: Hash worker job unavailable");
  });

  it("works with fewer workers than groups when some cannot start", async () => {
    let made = 0;
    const runner = createHashJobRunner(() => (made++ < 1 ? new FakeWorker() : null), 3);
    const result = runner.run(job());
    expect(FakeWorker.all[0]!.requests[0]!.job.algorithms).toEqual(IDS);
    await FakeWorker.all[0]!.answer();
    expect(Object.keys(await result)).toEqual(IDS);
  });
});

describe("createHashWorker and poolSize", () => {
  it("starts the worker file next to the module, and returns null where Worker is missing or throws", () => {
    const calls: unknown[][] = [];
    vi.stubGlobal(
      "Worker",
      class {
        constructor(...args: unknown[]) {
          calls.push(args);
        }
      },
    );
    expect(createHashWorker()).not.toBeNull();
    expect(String(calls[0]![0])).toMatch(/\/worker\.js$/);
    expect(calls[0]![1]).toEqual({ type: "module" });
    vi.stubGlobal("Worker", class {
      constructor() {
        throw new Error("blocked by CSP");
      }
    });
    expect(createHashWorker()).toBeNull();
    vi.stubGlobal("Worker", undefined);
    expect(createHashWorker()).toBeNull();
  });

  it("uses one worker less than the processor's threads, from 1 to 4", () => {
    for (const [threads, size] of [[1, 1], [2, 1], [4, 3], [16, 4], [0, 1]]) {
      vi.stubGlobal("navigator", { hardwareConcurrency: threads });
      expect([threads, poolSize()]).toEqual([threads, size]);
    }
  });
});
