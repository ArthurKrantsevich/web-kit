// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { hashAll } from "./core/hash";
import type { HashWorkerResponse } from "./job";

const scope = globalThis as unknown as {
  onmessage?: ((event: { data: unknown }) => void) | null;
  postMessage?: (message: HashWorkerResponse) => void;
};

afterEach(() => {
  delete scope.onmessage;
  delete scope.postMessage;
  vi.restoreAllMocks();
});

it("the worker script answers each message with progress and digests, and logs nothing", async () => {
  const posted: HashWorkerResponse[] = [];
  const answered = new Promise<void>((resolve) => {
    scope.postMessage = (message) => {
      posted.push(message);
      if (!("done" in message)) resolve();
    };
  });
  const log = vi.spyOn(console, "log");
  const error = vi.spyOn(console, "error");
  await import("./worker");
  scope.onmessage!({ data: { id: 1, job: { blob: new Blob(["abc"]), algorithms: ["md5", "sha3-256"], hmacKey: null } } });
  await answered;
  const expected = await hashAll("abc");
  expect(posted[0]).toEqual({ id: 1, done: 3 });
  expect(posted[1]).toMatchObject({ id: 1, digests: { md5: expected.ok ? expected.value.md5 : null } });
  expect(Object.keys((posted[1] as { digests: object }).digests)).toEqual(["md5", "sha3-256"]);
  expect([log.mock.calls, error.mock.calls]).toEqual([[], []]);
});
