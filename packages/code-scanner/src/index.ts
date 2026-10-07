"use client";

export * from "./core/index";
export {
  DEFAULT_SETTINGS,
  describeScan,
  IMAGE_DEADLINE_MS,
  resultsCsv,
  resultsJson,
  resultsText,
  SYMBOLOGIES,
  SYMBOLOGY_LABELS,
  useCodeScanner,
  type ScanEntry,
  type ScannerSettings,
  type ScanSource,
  type ScanStatus,
  type UseCodeScanner,
  type UseCodeScannerOptions,
} from "./ui/useCodeScanner";
export { IMAGE_ACCEPT, ImageReadError, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, readClipboardImage, readImageFile } from "./ui/image";
export { SAMPLE_QR, sampleImage } from "./ui/samples";
export { CodeScanner, type CodeScannerProps } from "./ui/CodeScanner";
export { createScanJobRunner, createScanWorker, ScanWorkerError, type ScanJobRunner, type ScanOutcome, type ScanWorkerFailure, type WorkerLike } from "./worker-client";
// Types only: the decoders stay on the worker's side (./worker), the page does not import them (spec §6).
export type { ScanJob, ScanRequest, ScanResponse } from "./job";
