// The worker script of @web-kit/json-core/worker: parses, formats, suggests fixes and counts off the main thread.
// Start it with createJsonWorker() from "@web-kit/json-core/worker-client". It logs nothing.
import { answerJsonJob, type JsonWorkerRequest, type JsonWorkerResponse } from "./job";

/** The parts of a dedicated worker's global scope used here (json-core is built without the DOM and worker libs). */
interface WorkerScope {
  onmessage: ((event: { data: JsonWorkerRequest }) => void) | null;
  postMessage(message: JsonWorkerResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
scope.onmessage = (event) => scope.postMessage(answerJsonJob(event.data));
