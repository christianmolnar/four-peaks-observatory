import { planCampaign } from './schedule';
import type { CampaignRequest, CampaignResponse } from './handler';
import type { CampaignInput, CampaignResult } from './types';

/** The part of a Worker the runner uses, so a test can stand in for one. */
export interface CampaignWorkerLike {
  postMessage(message: CampaignRequest): void;
  onmessage: ((event: { data: CampaignResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  terminate(): void;
}

export interface CampaignRunOptions {
  /** Makes the worker; defaults to the bundled `worker.ts`. Return null for "no worker": the engine then runs on this thread. */
  createWorker?: () => CampaignWorkerLike | null | Promise<CampaignWorkerLike | null>;
}

/** The run was cancelled (or replaced) by the caller; not a failure. */
export class CampaignCancelled extends Error {
  constructor() {
    super('The campaign run was cancelled.');
  }
}

export const isCancelled = (e: unknown): boolean => e instanceof CampaignCancelled;

export interface CampaignRun {
  result: Promise<CampaignResult>;
  /** Stops the work now (the worker is terminated) and rejects `result` with `CampaignCancelled`. Does nothing once finished. */
  cancel(): void;
}

async function defaultWorker(): Promise<CampaignWorkerLike | null> {
  if (typeof Worker === 'undefined') return null;
  return (await import('./spawn')).spawnCampaignWorker() as unknown as CampaignWorkerLike;
}

/**
 * Runs `planCampaign` off the main thread: a worker of its own for this one run, ended when it answers or is cancelled
 * (a synchronous search can only be stopped by ending its thread). Where there is no Worker (jest, old browsers) or none
 * can be made, the engine runs on this thread after a turn of the event loop, and a warning says so once.
 */
export function startCampaign(input: CampaignInput, options: CampaignRunOptions = {}): CampaignRun {
  let worker: CampaignWorkerLike | null = null;
  let finished = false;
  let cancelled = false;
  let rejectRun: (e: unknown) => void = () => undefined;

  const result = new Promise<CampaignResult>((resolve, reject) => {
    rejectRun = reject;
    const done = (settle: () => void): void => {
      if (finished || cancelled) return; // a late word from a worker that was already ended
      finished = true;
      worker?.terminate();
      settle();
    };
    const run = async (): Promise<void> => {
      let w: CampaignWorkerLike | null;
      try {
        w = await Promise.resolve().then(options.createWorker ?? defaultWorker);
      } catch (e) {
        console.warn('Campaign worker unavailable, planning on the main thread:', e);
        w = null;
      }
      if (cancelled) {
        w?.terminate();
        return;
      }
      if (w === null) {
        await new Promise<void>((r) => setTimeout(r, 0));
        if (cancelled) return;
        done(() => resolve(planCampaign(input)));
        return;
      }
      worker = w;
      w.onmessage = ({ data }) => done(() => (data.kind === 'result' ? resolve(data.result) : reject(new Error(data.message))));
      w.onerror = (e) => done(() => reject(new Error(`The campaign worker crashed: ${e.message ?? 'unknown error'}`)));
      w.postMessage({ input });
    };
    run().catch((e: unknown) => {
      finished = true;
      reject(e);
    });
  });

  return {
    result,
    cancel: () => {
      if (finished || cancelled) return;
      cancelled = true;
      worker?.terminate();
      rejectRun(new CampaignCancelled());
    },
  };
}
