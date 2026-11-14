import { screen } from '@testing-library/react';
import type { CatalogIndex } from '@/planner/catalog/search';
import { createCatalogLoader } from '@/planner/catalog/loader';
import type { CatalogObject } from '@/planner/catalog/openngc';
import type { CatalogPatches } from '@/planner/catalog/supplement';
import { createTonightRanker } from '@/planner/tonight';
import type { WorkerLike } from '@/planner/tonight';
import { createWorkerHandler } from '@/planner/tonight/handler';
import type { WorkerRequest, WorkerResponse } from '@/planner/tonight/handler';

/** An OpenNGC extract of exactly these objects, as the file served at CATALOG_URL has them. */
export const extractOf = (objects: readonly CatalogObject[]) => ({
  format: 1,
  source: { tag: 'test' },
  license: 'CC-BY-SA-4.0',
  count: objects.length,
  objects,
});

const NO_PATCHES: CatalogPatches = { supplement: [], overrides: [] };

/** A fake fetch that answers the catalog URL with `objects` (an empty list leaves just the curated 25). */
export function fakeCatalogFetch(objects: readonly CatalogObject[] = []): jest.Mock {
  return jest.fn(async () => ({ ok: true, status: 200, json: async () => extractOf(objects) }) as unknown as Response);
}

/** A catalog loader over a fake fetch: the curated targets plus `objects`, no patches. */
export function fakeCatalog(objects: readonly CatalogObject[] = []): { load: () => Promise<CatalogIndex>; fetch: jest.Mock } {
  const fetch = fakeCatalogFetch(objects);
  return { load: createCatalogLoader({ fetch: fetch as unknown as typeof globalThis.fetch, patches: NO_PATCHES }), fetch };
}

/**
 * A ranker backed by a fake worker: requests run the real worker handler (same ranking code, over `load`'s targets) but
 * the reply is held until `release` is called (unless `hold` is false), so a test can look at the loading state.
 */
export function fakeWorkerRanker(load: () => Promise<CatalogIndex>, { hold = true }: { hold?: boolean } = {}) {
  const held: (() => void)[] = [];
  const requests: WorkerRequest[] = [];
  const created: { count: number } = { count: 0 };
  let worker: WorkerLike | null = null;
  const rank = createTonightRanker({
    createWorker: () => {
      created.count++;
      const handle = createWorkerHandler(
        (response: WorkerResponse) => {
          const deliver = () => worker?.onmessage?.({ data: response });
          if (hold) held.push(deliver);
          else deliver();
        },
        async () => (await load()).targets,
        { yieldNow: async () => undefined },
      );
      worker = {
        onmessage: null,
        onerror: null,
        terminate: () => undefined,
        postMessage: (m: WorkerRequest) => {
          requests.push(m);
          void handle(m);
        },
      };
      return worker;
    },
  });
  return {
    rank,
    requests,
    created,
    /** Answers every reply held so far, in arrival order. */
    release: async () => {
      await new Promise((r) => setTimeout(r, 0));
      while (held.length > 0) (held.shift() as () => void)();
    },
    pending: () => held.length,
  };
}

const defaultCatalog = fakeCatalog();

/**
 * For a page test that does not care about the catalog: spread into `<PlannerApp>`. The catalog is the curated 25 (a fake
 * extract with no objects, no patches) and the ranking is the real one, run on this thread as it is where there is no Worker.
 * One object per test file, so the props stay the same between renders.
 */
export const pageProps = {
  rank: createTonightRanker({ createWorker: () => null, loadTargets: async () => (await defaultCatalog.load()).targets, yieldNow: async () => undefined }),
  loadCatalogIndex: defaultCatalog.load,
};

/** Waits for the ranked list to be on the page (the ranking runs off the render, so a page test awaits it). */
export const ready = async (): Promise<void> => {
  await screen.findByTestId('target-table', {}, { timeout: 20000 });
};
