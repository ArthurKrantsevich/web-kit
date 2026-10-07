// @vitest-environment node
// The browser transform would rewrite `new Worker(new URL(…))` into Vite's own worker import; the test checks the call.
import { afterEach, describe, expect, it, vi } from "vitest";
import { asImage, rasterize } from "../bench/distort";
import { encodeSymbol, segmentsFor } from "../test/encoders/qr";
import { answerScanJob, decodersFor, type ScanJob, type ScanRequest, type ScanResponse } from "./job";
import { createScanJobRunner, createScanWorker, ScanWorkerError, type WorkerLike } from "./worker-client";

/** A worker that answers when the test says so, through the real answerScanJob. */
class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = [];
  requests: ScanRequest[] = [];
  terminated = false;
  /** The next postMessage throws, as a real worker does for a detached buffer. */
  throwOnce = false;
  private onMessage: ((event: { data: ScanResponse }) => void)[] = [];
  private onError: (() => void)[] = [];
  private onMessageError: (() => void)[] = [];
  constructor() { FakeWorker.all.push(this); }
  postMessage(message: ScanRequest): void {
    if (this.throwOnce) { this.throwOnce = false; throw new Error("detached"); }
    this.requests.push(message);
  }
  terminate(): void { this.terminated = true; }
  addEventListener(type: "message" | "error" | "messageerror", listener: never): void {
    if (type === "message") this.onMessage.push(listener); else if (type === "error") this.onError.push(listener); else this.onMessageError.push(listener);
  }
  /** Answers a request (the last one by default) through the real answerScanJob. */
  answer(index: number = this.requests.length - 1): void { answerScanJob(this.requests[index]!, (data) => { for (const l of this.onMessage) l({ data }); }); }
  fail(): void { for (const l of this.onError) l(); }
  corrupt(): void { for (const l of this.onMessageError) l(); }
}
/** Whether a promise has settled, after the microtasks drain. */
const settled = async (p: Promise<unknown>): Promise<boolean> => { let done = false; p.then(() => { done = true; }, () => { done = true; }); await new Promise((r) => setTimeout(r, 0)); return done; };
const image = (text: string) => asImage(rasterize(encodeSymbol("qr", 2, "M", segmentsFor(text))!.matrix, { module: 5 }));
// A generous deadline: the default 40 ms expires under the whole suite's load on a slow machine, and these tests check the queue, not the clock.
const job = (text: string): ScanJob => ({ image: image(text), symbologies: ["qr", "micro-qr", "rmqr"], tryHarder: false, multiple: false, deadlineMs: 5000 });
const reason = (p: Promise<unknown>) => p.then(() => "resolved", (e: unknown) => (e instanceof ScanWorkerError ? e.reason : String(e)));

afterEach(() => { FakeWorker.all = []; vi.unstubAllGlobals(); });

describe("the job", () => {
  it("maps symbologies to decoders (the QR family in 7a) and answers with results and the time, or with a message", () => {
    expect(decodersFor(["qr"]).map((d) => d.id)).toEqual(["qr-family"]);
    expect(decodersFor(["micro-qr", "rmqr", "qr"]).map((d) => d.id)).toEqual(["qr-family"]);
    expect(decodersFor(["ean-13"])).toEqual([]);
    const posted: ScanResponse[] = [];
    answerScanJob({ id: 3, job: job("hello") }, (r) => posted.push(r));
    expect(posted).toHaveLength(1);
    expect("results" in posted[0]! && posted[0].results.map((r) => r.text)).toEqual(["hello"]);
    expect("results" in posted[0]! && posted[0].ms >= 0).toBe(true);
    answerScanJob({ id: 4, job: { ...job("x"), image: { width: 2, height: 2, data: new Uint8Array(3), format: "gray" } } }, (r) => posted.push(r));
    expect(posted[1]).toEqual({ id: 4, error: "A gray buffer of 2×2 needs 4 bytes, got 3" });
  });
});

describe("createScanJobRunner", () => {
  it("runs one frame at a time: a frame sent while one runs waits, a newer one replaces it (dropped), the running one finishes", async () => {
    const runner = createScanJobRunner(() => new FakeWorker());
    const first = runner.run(job("first"));
    const second = runner.run(job("second"));
    const third = runner.run(job("third"));
    expect(FakeWorker.all).toHaveLength(1);
    expect(FakeWorker.all[0]!.requests).toHaveLength(1);
    expect(await reason(second)).toBe("dropped");
    FakeWorker.all[0]!.answer();
    expect((await first).results.map((r) => r.text)).toEqual(["first"]);
    // the pending frame went out when the first answer came
    expect(FakeWorker.all[0]!.requests).toHaveLength(2);
    FakeWorker.all[0]!.answer();
    expect((await third).results.map((r) => r.text)).toEqual(["third"]);
    expect(FakeWorker.all[0]!.terminated).toBe(false);
  });

  it("cancel rejects the running and the waiting frame and ignores the late answer; dispose terminates", async () => {
    const runner = createScanJobRunner(() => new FakeWorker());
    const a = runner.run(job("a")), b = runner.run(job("b"));
    runner.cancel();
    expect([await reason(a), await reason(b)]).toEqual(["cancelled", "cancelled"]);
    FakeWorker.all[0]!.answer();
    const c = runner.run(job("c"));
    expect(FakeWorker.all[0]!.requests).toHaveLength(2);
    FakeWorker.all[0]!.answer();
    expect((await c).results.map((r) => r.text)).toEqual(["c"]);
    runner.dispose();
    expect(FakeWorker.all[0]!.terminated).toBe(true);
    expect(await reason(runner.run(job("d")))).toBe("unavailable");
  });

  it("ignores an answer to a cancelled frame while a newer one runs: the newer frame stays pending until its own answer", async () => {
    const runner = createScanJobRunner(() => new FakeWorker());
    const a = runner.run(job("a"));
    runner.cancel();
    expect(await reason(a)).toBe("cancelled");
    const c = runner.run(job("c"));
    expect(FakeWorker.all[0]!.requests).toHaveLength(2);
    FakeWorker.all[0]!.answer(0); // the late answer to "a"
    expect(await settled(c)).toBe(false);
    FakeWorker.all[0]!.answer(1);
    expect((await c).results.map((r) => r.text)).toEqual(["c"]);
  });

  it("a frame whose post throws fails at once with the message, and the runner goes on with the next frame", async () => {
    const runner = createScanJobRunner(() => new FakeWorker());
    const w = () => FakeWorker.all[0]!;
    const a = runner.run(job("a")), b = runner.run(job("b"));
    w().throwOnce = true;
    w().answer(); // "a" comes back; "b" goes out and its post throws, inside the message listener
    expect((await a).results.map((r) => r.text)).toEqual(["a"]);
    expect(await reason(b)).toBe("failed");
    expect(await b.catch((e: Error) => e.message)).toBe("detached");
    expect(w().requests).toHaveLength(1); // "b" never reached the worker
    const c = runner.run(job("c"));
    expect(w().requests).toHaveLength(2);
    w().answer();
    expect((await c).results.map((r) => r.text)).toEqual(["c"]);
    // a throw with a pending frame behind it: the pending frame goes out
    w().throwOnce = true;
    const d = runner.run(job("d")), e = runner.run(job("e"));
    expect(await reason(d)).toBe("failed");
    w().answer();
    expect((await e).results.map((r) => r.text)).toEqual(["e"]);
  });

  it("an answer that cannot be read (messageerror) fails the running frame only, and the waiting frame goes out", async () => {
    const runner = createScanJobRunner(() => new FakeWorker());
    const a = runner.run(job("a")), b = runner.run(job("b"));
    FakeWorker.all[0]!.corrupt();
    expect(await reason(a)).toBe("failed");
    expect(FakeWorker.all[0]!.requests).toHaveLength(2);
    FakeWorker.all[0]!.answer();
    expect((await b).results.map((r) => r.text)).toEqual(["b"]);
    expect(FakeWorker.all[0]!.terminated).toBe(false);
  });

  it("rejects as unavailable when no worker can start or when it crashes, and as failed with the worker's message", async () => {
    expect(await reason(createScanJobRunner(() => null).run(job("x")))).toBe("unavailable");
    const crashing = createScanJobRunner(() => new FakeWorker());
    const p = crashing.run(job("x"));
    FakeWorker.all.at(-1)!.fail();
    expect(await reason(p)).toBe("unavailable");
    // the crashed worker is terminated and not started again on this page
    expect(FakeWorker.all.at(-1)!.terminated).toBe(true);
    expect(await reason(crashing.run(job("y")))).toBe("unavailable");
    expect(FakeWorker.all).toHaveLength(1);
    const failing = createScanJobRunner(() => new FakeWorker());
    const q = failing.run({ ...job("x"), image: { width: 1, height: 1, data: new Uint8Array(0), format: "gray" } });
    FakeWorker.all.at(-1)!.answer();
    expect(await reason(q)).toBe("failed");
  });

  it("posts the frame's buffer as a transferable", () => {
    const transfers: unknown[] = [];
    const worker: WorkerLike = { postMessage: (_m, transfer) => transfers.push(transfer), terminate: () => {}, addEventListener: () => {} };
    const frame = job("t");
    void createScanJobRunner(() => worker).run(frame);
    expect(transfers[0]).toEqual([frame.image.data.buffer]);
    expect((transfers[0] as ArrayBuffer[])[0]).toBe(frame.image.data.buffer);
  });
});

describe("createScanWorker", () => {
  it("starts the worker file next to the module as a module worker, and returns null where Worker is missing or throws", () => {
    const calls: unknown[][] = [];
    vi.stubGlobal("Worker", class { constructor(...args: unknown[]) { calls.push(args); } });
    expect(createScanWorker()).not.toBeNull();
    expect(String(calls[0]![0])).toMatch(/\/worker\.js$/);
    expect(calls[0]![1]).toEqual({ type: "module" });
    vi.stubGlobal("Worker", class { constructor() { throw new Error("blocked"); } });
    expect(createScanWorker()).toBeNull();
    vi.stubGlobal("Worker", undefined);
    expect(createScanWorker()).toBeNull();
  });
});
