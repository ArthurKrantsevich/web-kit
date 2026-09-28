import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashAll } from "../core/hash";
import type { AlgorithmId, HashResults } from "../core/types";
import { ALL_ALGORITHMS, EXTRA_ALGORITHMS } from "../extra/index";
import type { HashJob } from "../job";
import { HashWorkerError, type HashJobRunner } from "../worker-client";
import { HashGenerator } from "./HashGenerator";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/hash-generator/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The visible status; its live region speaks at a slower pace (HashGenerator.a11y.test.tsx).
const status = () => document.querySelector(".wk-hash__summary")!.textContent;
const drop = (file: File) => fireEvent.drop(document.querySelector(".wk-hash__pane--input")!, { dataTransfer: { types: ["Files"], files: [file] } });
const loadExtra = () => Promise.resolve(EXTRA_ALGORITHMS);

/** A file whose parts are counted as they are read. */
function countedFile(bytes: number, name: string): { file: File; reads: () => number } {
  let reads = 0;
  const file = new File([new Uint8Array(bytes)], name);
  const slice = file.slice.bind(file);
  file.slice = (...args: Parameters<Blob["slice"]>) => {
    reads++;
    return slice(...args);
  };
  return { file, reads: () => reads };
}

// Real hashing on the page in jsdom: seconds on a CI runner 2–3 times slower under a full parallel verify.
describe("HashGenerator's jobs", { timeout: 20_000 }, () => {
  it("stops hashing a file on the page when there are no workers and the file is closed", async () => {
    const runner: HashJobRunner = { run: () => Promise.reject(new HashWorkerError("unavailable")), cancel: () => {}, dispose: () => {} };
    render(<HashGenerator createRunner={() => runner} />);
    const { file, reads } = countedFile(24 * 1024 * 1024, "big.bin");
    drop(file);
    await waitFor(() => expect(reads()).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Back to text" }));
    const atClose = reads();
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    // The part being read when it was closed may finish; no other part is read.
    expect(reads() - atClose).toBeLessThanOrEqual(1);
    expect(status()).toBe("Hashed 0 bytes of text");
  });

  it("opens More algorithms while a file is hashed without restarting it, and hashes the extra ones after it", async () => {
    const jobs: { job: HashJob; resolve: (results: HashResults) => void }[] = [];
    const cancel = vi.fn();
    const runner: HashJobRunner = { run: (job) => new Promise((resolve) => jobs.push({ job, resolve })), cancel, dispose: () => {} };
    const finish = async (index: number) => {
      const { job, resolve } = jobs[index]!;
      const result = await hashAll(job.blob, { algorithms: ALL_ALGORITHMS.filter((algorithm) => job.algorithms.includes(algorithm.id)) });
      await act(async () => resolve(result.ok ? result.value : {}));
    };
    render(<HashGenerator createRunner={() => runner} loadExtra={loadExtra} />);
    drop(new File(["abc"], "report.bin"));
    await waitFor(() => expect(jobs).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "More algorithms" }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect([jobs.length, cancel.mock.calls.length]).toEqual([1, 0]);
    await finish(0);
    await waitFor(() => expect(jobs).toHaveLength(2));
    expect(jobs[1]!.job.algorithms).toEqual(EXTRA_ALGORITHMS.map((algorithm) => algorithm.id) as AlgorithmId[]);
    await finish(1);
    await waitFor(() => expect(status()).toBe("Hashed report.bin (3 B)"));
    const values = [...document.querySelectorAll(".wk-hash__value")].map((node) => node.textContent);
    expect(values).toHaveLength(17);
    expect(values.every((text) => /^[0-9a-f]+$/.test(text ?? ""))).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
  });
});
