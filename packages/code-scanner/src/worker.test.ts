// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { asImage, rasterize } from "../bench/distort";
import { encodeSymbol, segmentsFor } from "../test/encoders/qr";
import type { ScanResponse } from "./job";

const scope = globalThis as unknown as { onmessage?: ((event: { data: unknown }) => void) | null; postMessage?: (message: ScanResponse) => void };
afterEach(() => { delete scope.onmessage; delete scope.postMessage; vi.restoreAllMocks(); });

it("the worker script answers each message with the results, and logs nothing", async () => {
  const posted: ScanResponse[] = [];
  scope.postMessage = (message) => posted.push(message);
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
  await import("./worker");
  const image = asImage(rasterize(encodeSymbol("qr", 1, "M", segmentsFor("worker"))!.matrix, { module: 5 }));
  scope.onmessage!({ data: { id: 1, job: { image, symbologies: ["qr"], tryHarder: false, multiple: false, deadlineMs: 5000 } } });
  expect(posted).toHaveLength(1);
  expect("results" in posted[0]! && posted[0].results.map((r) => r.text)).toEqual(["worker"]);
  expect(spies.map((s) => s.mock.calls)).toEqual([[], [], [], [], []]);
});
