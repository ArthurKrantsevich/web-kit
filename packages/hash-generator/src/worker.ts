// The worker script of @web-kit/hash-generator/worker: hashes a file off the main thread, a few algorithms per worker.
// HashGenerator starts it by itself for files and for texts over 1 MB; it logs nothing.
import { answerHashJob, type HashWorkerRequest, type HashWorkerResponse } from "./job";

/** The parts of a dedicated worker's global scope used here. */
interface WorkerScope {
  onmessage: ((event: { data: HashWorkerRequest }) => void) | null;
  postMessage(message: HashWorkerResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
scope.onmessage = (event) => {
  void answerHashJob(event.data, (response) => scope.postMessage(response));
};
