// The worker script of @web-kit/code-scanner/worker: scans frames off the main thread. The QR family loads with it;
// the other symbology entries will be imported on demand (7b, 7c). It logs nothing: frames and results stay private.
import { answerScanJob, type ScanRequest, type ScanResponse } from "./job";

interface WorkerScope {
  onmessage: ((event: { data: ScanRequest }) => void) | null;
  postMessage(message: ScanResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
scope.onmessage = (event) => answerScanJob(event.data, (response) => scope.postMessage(response));
