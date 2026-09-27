// The worker script of @web-kit/text-compare/worker: compares large texts off the main thread. TextCompare starts it
// by itself for texts over 1 MB; it logs nothing.
import { answerCompareJob, type CompareWorkerRequest, type CompareWorkerResponse } from "./job";

/** The parts of a dedicated worker's global scope used here. */
interface WorkerScope {
  onmessage: ((event: { data: CompareWorkerRequest }) => void) | null;
  postMessage(message: CompareWorkerResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
scope.onmessage = (event) => scope.postMessage(answerCompareJob(event.data));
