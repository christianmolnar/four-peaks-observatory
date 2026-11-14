/// <reference lib="webworker" />
import { loadCatalog } from '../catalog/loader';
import { createWorkerHandler } from './handler';
import type { WorkerRequest } from './handler';

// The worker loads the catalog itself, once, through the same lazy loader the search uses.
const handle = createWorkerHandler(
  (response) => self.postMessage(response),
  async () => (await loadCatalog()).targets,
);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data);
};
