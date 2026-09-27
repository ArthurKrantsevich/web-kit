import { afterEach, describe, expect, it, vi } from "vitest";
import { compareTexts } from "./core/compare";
import { unpackDiff, type CompareWorkerResponse } from "./job";

const scope = globalThis as unknown as {
  onmessage?: ((event: { data: unknown }) => void) | null;
  postMessage?: (message: CompareWorkerResponse, transfer?: Transferable[]) => void;
};

afterEach(() => {
  delete scope.onmessage;
  delete scope.postMessage;
  vi.restoreAllMocks();
});

describe("the worker script", () => {
  it("answers each message with the diff and logs nothing", async () => {
    const posted: CompareWorkerResponse[] = [];
    const transfers: unknown[][] = [];
    scope.postMessage = (message, transfer = []) => {
      posted.push(message);
      transfers.push(transfer);
    };
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    await import("./worker");
    const job = { left: "a\nb\n", right: "a\nB\n", options: { ignoreCase: true } };
    scope.onmessage!({ data: { id: 1, job } });
    const [answer] = posted;
    if (answer === undefined || !("packed" in answer)) throw new Error("no diff");
    expect(unpackDiff(answer.packed)).toEqual(compareTexts(job.left, job.right, job.options));
    // The arrays are moved to the page, not copied.
    expect(transfers).toEqual([[answer.packed.blocks.buffer, answer.packed.pairs.buffer]]);
    expect([log.mock.calls, error.mock.calls]).toEqual([[], []]);
  });
});
