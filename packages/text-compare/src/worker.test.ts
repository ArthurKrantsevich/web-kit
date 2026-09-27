import { afterEach, describe, expect, it, vi } from "vitest";
import { compareTexts } from "./core/compare";
import type { CompareWorkerResponse } from "./job";

const scope = globalThis as unknown as {
  onmessage?: ((event: { data: unknown }) => void) | null;
  postMessage?: (message: CompareWorkerResponse) => void;
};

afterEach(() => {
  delete scope.onmessage;
  delete scope.postMessage;
  vi.restoreAllMocks();
});

describe("the worker script", () => {
  it("answers each message with the diff and logs nothing", async () => {
    const posted: CompareWorkerResponse[] = [];
    scope.postMessage = (message) => posted.push(message);
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    await import("./worker");
    const job = { left: "a\nb\n", right: "a\nB\n", options: { ignoreCase: true } };
    scope.onmessage!({ data: { id: 1, job } });
    expect(posted).toEqual([{ id: 1, value: compareTexts(job.left, job.right, job.options) }]);
    expect([log.mock.calls, error.mock.calls]).toEqual([[], []]);
  });
});
