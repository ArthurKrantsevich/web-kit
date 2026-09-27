import type { JsonWorkerRequest, JsonWorkerResponse } from "@web-kit/json-core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonFormatter } from "./JsonFormatter";
import { WORKER_FALLBACK_NOTE } from "./useJsonFormatter";

/** Stand-ins for the json-core worker: each answers only when the test calls answer(). */
const workers = vi.hoisted(() => {
  class FakeWorker {
    requests: JsonWorkerRequest[] = [];
    terminated = false;
    listeners: ((event: { data: JsonWorkerResponse }) => void)[] = [];
    postMessage(message: JsonWorkerRequest): void {
      this.requests.push(message);
    }
    terminate(): void {
      this.terminated = true;
    }
    addEventListener(type: string, listener: (event: { data: JsonWorkerResponse }) => void): void {
      if (type === "message") this.listeners.push(listener);
    }
  }
  return { FakeWorker, all: [] as FakeWorker[], available: true };
});

vi.mock("@web-kit/json-core/worker-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web-kit/json-core/worker-client")>();
  return {
    ...actual,
    createJsonWorker: () => {
      if (!workers.available) return null;
      const worker = new workers.FakeWorker();
      workers.all.push(worker);
      return worker;
    },
  };
});

afterEach(() => {
  cleanup();
  workers.all = [];
  workers.available = true;
});

/** Answers the last request of the last worker the way the real worker script does. */
async function answer(): Promise<void> {
  const { answerJsonJob } = await import("@web-kit/json-core");
  const worker = workers.all.at(-1)!;
  const response = answerJsonJob(worker.requests.at(-1)!);
  await act(async () => {
    for (const listener of worker.listeners) listener({ data: response });
  });
}

const alive = () => workers.all.filter((worker) => !worker.terminated);
const status = () => document.querySelector(".wk-ui-status")!.textContent;
const type = (value: string) => fireEvent.change(screen.getByLabelText("Input"), { target: { value } });

// 1.2 MB of JSON: over the 1 MB at which Format and Minify move to the worker.
const BIG = JSON.stringify(Array.from({ length: 40_000 }, (_, id) => ({ id, name: `user ${id}` })));

describe("JsonFormatter with a large input", () => {
  it("formats it in the worker and says so while the worker works", async () => {
    render(<JsonFormatter initialInput={BIG} />);
    expect(status()).toBe("Formatting 1.2 MB…");
    expect(screen.getByRole("status").textContent).toBe("Formatting 1.2 MB…");
    expect(workers.all[0]!.requests[0]!.job).toEqual({ input: BIG, mode: "format", indent: 2, sortKeys: false });
    await answer();
    expect(status()).toMatch(/^Valid JSON1\.2 MB · 80,000 keys · depth 2 · 40,000 objects/);
    expect(screen.getByLabelText("Output").textContent!.startsWith('[\n  {\n    "id": 0,')).toBe(true);
  });

  it("says Minifying in Minify mode", async () => {
    render(<JsonFormatter initialInput={BIG} />);
    fireEvent.click(screen.getByRole("button", { name: "Minify" }));
    expect(status()).toBe("Minifying 1.2 MB…");
    await answer();
    expect(screen.getByLabelText("Output").textContent).toBe(BIG);
  });

  it("cancels the running job on new input: its worker is terminated and only one worker is alive", async () => {
    render(<JsonFormatter initialInput={BIG} />);
    type(`${BIG} `);
    expect(workers.all.map((worker) => worker.terminated)).toEqual([true, false]);
    type(`${BIG}  `);
    expect(alive()).toHaveLength(1);
    await answer();
    expect(status()).toMatch(/^Valid JSON/);
  });

  it("cancels the job when the input becomes small, and stops the worker on unmount", async () => {
    const view = render(<JsonFormatter initialInput={BIG} />);
    type('{"small":true}');
    expect(alive()).toHaveLength(0);
    expect(screen.getByLabelText("Output").textContent).toBe('{\n  "small": true\n}');
    type(BIG);
    expect(alive()).toHaveLength(1);
    view.unmount();
    expect(alive()).toHaveLength(0);
  });

  it("gets the error and the checked fixes of a large input from the worker", async () => {
    render(<JsonFormatter initialInput={`${BIG.slice(0, -1)},]`} />);
    await answer();
    expect(screen.getByRole("status").textContent).toMatch(/^Line 1, column \d+: /);
    expect(screen.getByRole("list", { name: "Suggested fixes" }).textContent).toContain("Remove trailing comma");
  });

  it("works on the page with a visible note when no worker can start", async () => {
    workers.available = false;
    render(<JsonFormatter initialInput={BIG} />);
    await waitFor(() => expect(status()).toContain(WORKER_FALLBACK_NOTE));
    expect(status()).toMatch(/^Valid JSON/);
  });

  it("keeps small inputs on the page, without a worker", () => {
    render(<JsonFormatter initialInput='{"a":1}' />);
    expect(workers.all).toHaveLength(0);
  });
});
