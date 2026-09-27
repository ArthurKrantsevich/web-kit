import { afterEach, describe, expect, it, vi } from "vitest";
import { runJsonJob, type JsonWorkerResponse } from "./job";

// json-core is typed without the DOM lib, so console is reached through globalThis.
const logger = (globalThis as unknown as { console: { log(...args: unknown[]): void; error(...args: unknown[]): void } }).console;
const scope = globalThis as unknown as {
  onmessage?: ((event: { data: unknown }) => void) | null;
  postMessage?: (message: JsonWorkerResponse) => void;
};

afterEach(() => {
  delete scope.onmessage;
  delete scope.postMessage;
  vi.restoreAllMocks();
});

describe("the worker script", () => {
  it("answers each message with the job's result and logs nothing", async () => {
    const posted: JsonWorkerResponse[] = [];
    scope.postMessage = (message) => posted.push(message);
    const log = vi.spyOn(logger, "log");
    const error = vi.spyOn(logger, "error");
    await import("./worker");
    const job = { input: '{"a":1}', mode: "format" as const, indent: 2 as const, sortKeys: false };
    scope.onmessage!({ data: { id: 1, job } });
    expect(posted).toEqual([{ id: 1, value: runJsonJob(job) }]);
    expect([log.mock.calls, error.mock.calls]).toEqual([[], []]);
  });
});
