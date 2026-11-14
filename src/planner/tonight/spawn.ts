/** The one place that names the worker file; apart so that code paths without a Worker never parse `import.meta`. */
export function spawnTonightWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}
