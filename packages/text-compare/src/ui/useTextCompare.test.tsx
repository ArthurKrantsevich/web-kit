import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareTexts } from "../core/compare";
import { answerCompareJob, type CompareWorkerRequest, type CompareWorkerResponse } from "../job";
import { formatBytes, utf8Length } from "./format";
import { JOB_DELAY } from "./useCompareJob";
import { TextCompare } from "./TextCompare";
import { DEFAULT_OPTIONS, useTextCompare, WORKER_FALLBACK_NOTE } from "./useTextCompare";

/** Stand-ins for the text-compare worker: each answers only when the test calls answer(). */
const workers = vi.hoisted(() => {
  class FakeWorker {
    requests: CompareWorkerRequest[] = [];
    terminated = false;
    listeners: ((event: { data: CompareWorkerResponse }) => void)[] = [];
    postMessage(message: CompareWorkerRequest): void {
      this.requests.push(message);
    }
    terminate(): void {
      this.terminated = true;
    }
    addEventListener(type: string, listener: (event: { data: CompareWorkerResponse }) => void): void {
      if (type === "message") this.listeners.push(listener);
    }
  }
  return { FakeWorker, all: [] as FakeWorker[], available: true };
});

vi.mock("../worker-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker-client")>();
  return {
    ...actual,
    createCompareWorker: () => {
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
  vi.useRealTimers();
});

/** Answers the last request of the last worker the way the real worker script does. */
async function answer(): Promise<void> {
  const worker = workers.all.at(-1)!;
  const response = answerCompareJob(worker.requests.at(-1)!);
  await act(async () => {
    for (const listener of worker.listeners) listener({ data: response });
  });
}

/** The last worker says the last job threw. */
async function fail(): Promise<void> {
  const worker = workers.all.at(-1)!;
  const { id } = worker.requests.at(-1)!;
  await act(async () => {
    for (const listener of worker.listeners) listener({ data: { id, error: "failed" } });
  });
}

// 1.1 MB together: over the 1 MB at which comparing moves to the worker.
const BIG_LEFT = Array.from({ length: 14_000 }, (_, i) => `line ${i}: some text of the left side`).join("\n");
const BIG_RIGHT = BIG_LEFT.replace("line 5000:", "line five thousand:");

describe("useTextCompare", () => {
  it("compares small texts on the page, with the options it was given", () => {
    const { result } = renderHook(() => useTextCompare({ initialLeft: "a\nb\n", initialRight: "a\nB\n" }));
    expect(result.current.comparison).toEqual({
      diff: compareTexts("a\nb\n", "a\nB\n", DEFAULT_OPTIONS),
      left: "a\nb\n",
      right: "a\nB\n",
      options: DEFAULT_OPTIONS,
    });
    expect(result.current.fresh).toBe(true);
    act(() => result.current.setOptions({ ...DEFAULT_OPTIONS, ignoreCase: true }));
    expect(result.current.comparison!.diff.counts).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it("has no comparison while both sides are empty, and compares one empty side", () => {
    const { result } = renderHook(() => useTextCompare());
    expect(result.current.comparison).toBeNull();
    act(() => result.current.setRight("x\n"));
    expect(result.current.comparison!.diff.counts).toEqual({ added: 1, removed: 0, changed: 0 });
    act(() => result.current.setRight(""));
    expect(result.current.comparison).toBeNull();
  });

  it("keeps a side's file name until another name or null is given", () => {
    const { result } = renderHook(() => useTextCompare());
    act(() => result.current.setLeft("a", "old.txt"));
    act(() => result.current.setLeft("ab"));
    expect(result.current.leftName).toBe("old.txt");
    act(() => result.current.setLeft("", null));
    expect(result.current.leftName).toBeNull();
  });

  it("counts both sides in UTF-8 bytes", () => {
    const { result } = renderHook(() => useTextCompare({ initialLeft: "ж", initialRight: "👍" }));
    expect(result.current.bytes).toEqual({ left: 2, right: 4 });
    expect([utf8Length("aж👍"), formatBytes(1536), formatBytes(5.2 * 1024 * 1024)]).toEqual([7, "1.5 KB", "5.2 MB"]);
  });
});

describe("useTextCompare with large texts", () => {
  it("compares them in the worker and says so while it works", async () => {
    const { result } = renderHook(() => useTextCompare({ initialLeft: BIG_LEFT, initialRight: BIG_RIGHT }));
    const size = formatBytes(utf8Length(BIG_LEFT) + utf8Length(BIG_RIGHT));
    expect(result.current.pending).toBe(`Comparing ${size}…`);
    expect(result.current.comparison).toBeNull();
    expect(workers.all[0]!.requests[0]!.job).toEqual({ left: BIG_LEFT, right: BIG_RIGHT, options: DEFAULT_OPTIONS });
    await answer();
    expect(result.current.pending).toBeNull();
    expect(result.current.comparison!.diff.counts).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(result.current.fresh).toBe(true);
  });

  it("keeps the last result, marked stale, while the next one is computed; a new input cancels the running job", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTextCompare({ initialLeft: BIG_LEFT, initialRight: BIG_RIGHT }));
    await answer();
    const first = result.current.comparison;
    act(() => result.current.setRight(`${BIG_RIGHT}\nmore`));
    expect([result.current.comparison, result.current.fresh]).toEqual([first, false]);
    act(() => result.current.setRight(`${BIG_RIGHT}\nmore and more`));
    // The running job's worker is terminated; the next job waits for the typing to pause.
    expect(workers.all[0]!.terminated).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(JOB_DELAY);
    });
    expect(workers.all.at(-1)!.requests.at(-1)!.job.right).toBe(`${BIG_RIGHT}\nmore and more`);
    await answer();
    expect([result.current.comparison!.right, result.current.fresh]).toEqual([`${BIG_RIGHT}\nmore and more`, true]);
  });

  it("compares on the page, with a note, when no worker can start", () => {
    workers.available = false;
    const { result } = renderHook(() => useTextCompare({ initialLeft: BIG_LEFT, initialRight: BIG_RIGHT }));
    return vi.waitFor(() => {
      expect(result.current.workerNote).toBe(WORKER_FALLBACK_NOTE);
      expect(result.current.comparison!.diff.counts.changed).toBe(1);
    });
  });

  it("says when the worker failed, and the kept result is then not fresh", async () => {
    const { result } = renderHook(() => useTextCompare({ initialLeft: BIG_LEFT, initialRight: BIG_RIGHT }));
    await answer();
    act(() => result.current.setRight(`${BIG_RIGHT}\nmore`));
    await fail();
    expect([result.current.failed, result.current.fresh, result.current.pending]).toEqual([true, false, null]);
  });

  it("shows the old result dimmed under a message when the worker failed, at the same height", async () => {
    const { container } = render(<TextCompare initialLeft={BIG_LEFT} initialRight={BIG_RIGHT} />);
    await answer();
    act(() => {
      const right = screen.getByRole("textbox", { name: /^Right/ });
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(right, `${BIG_RIGHT}\nmore`);
      right.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await fail();
    const cover = container.querySelector(".wk-compare__pending")!;
    expect([...cover.querySelectorAll(".wk-ui-empty__title, .wk-ui-empty__text")].map((part) => part.textContent)).toEqual([
      "Could not compare these texts.",
      "The result below is for the texts before.",
    ]);
    expect(container.querySelector(".wk-compare__frame")!.contains(container.querySelector(".wk-compare__rows"))).toBe(true);
  });
});
