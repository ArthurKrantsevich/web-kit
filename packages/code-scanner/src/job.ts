import { scan } from "./core/scan";
import type { Roi, ScanImage, ScanResult, Symbology, SymbologyDecoder } from "./core/types";
import { qrFamily } from "./qr/index";

/** One frame to scan, with what to look for. */
export interface ScanJob {
  image: ScanImage;
  symbologies: Symbology[];
  tryHarder: boolean;
  multiple: boolean;
  roi?: Roi;
  deadlineMs?: number;
}

export interface ScanRequest {
  id: number;
  job: ScanJob;
}

/** The results with the time taken, or why the frame could not be scanned (a message, never the image). */
export type ScanResponse = { id: number; results: ScanResult[]; ms: number } | { id: number; error: string };

const QR_FAMILY: readonly Symbology[] = ["qr", "micro-qr", "rmqr"];

/** The decoders for a set of symbologies, each once, in the spec's priority. The other families arrive in 7b and 7c. */
export function decodersFor(symbologies: readonly Symbology[]): SymbologyDecoder[] {
  const out: SymbologyDecoder[] = [];
  if (symbologies.some((s) => QR_FAMILY.includes(s))) out.push(qrFamily);
  return out;
}

/** What the worker does with one message: scans and posts the answer; a thrown error becomes a message. */
export function answerScanJob(request: ScanRequest, post: (response: ScanResponse) => void): void {
  const { id, job } = request;
  try {
    const t0 = performance.now();
    const results = scan(job.image, { decoders: decodersFor(job.symbologies), tryHarder: job.tryHarder, multiple: job.multiple, roi: job.roi, deadlineMs: job.deadlineMs });
    post({ id, results, ms: Math.round(performance.now() - t0) });
  } catch (error) {
    post({ id, error: error instanceof Error ? error.message : "Could not scan the image" });
  }
}
