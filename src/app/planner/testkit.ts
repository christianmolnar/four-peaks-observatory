import { fireEvent, screen } from '@testing-library/react';
import type { CatalogIndex } from '@/planner/catalog/search';
import { createCatalogLoader } from '@/planner/catalog/loader';
import type { CatalogObject } from '@/planner/catalog/openngc';
import type { CatalogPatches } from '@/planner/catalog/supplement';
import { createTonightRanker } from '@/planner/tonight';
import type { AuthState } from './authState';
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
  /** A guest: the page's one read of the session endpoint (for the owner's AI switch) is not the test's business. */
  loadAuth: async (): Promise<AuthState> => ({ kind: 'signedOut' }),
};

/** Opens the sticky strip's controls (Evening of, Site, Train, Filter, Minimum altitude), which start closed; does nothing when they are open. */
export const openControls = (): void => {
  const strip = document.querySelector<HTMLElement>('[aria-controls="controls-panel"]');
  if (strip !== null && strip.getAttribute('aria-expanded') === 'false') fireEvent.click(strip);
};

/**
 * Waits for the ranked list to be on the page (the ranking runs off the render, so a page test awaits it), and opens the
 * controls so the test can reach them.
 */
export const ready = async (): Promise<void> => {
  await screen.findByTestId('target-list', {}, { timeout: 20000 });
  openControls();
};

/** Chooses an item of the list's "More" menu ("Export CSV", "Print or save as PDF"). */
export const chooseMore = (item: string): void => {
  fireEvent.click(screen.getByRole('button', { name: /^More/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: item }));
};

/** The rows of a ranked list on the page (the list shows the best ten first). */
export const listRows = (testId = 'target-list'): HTMLElement[] => [...screen.getByTestId(testId).querySelectorAll<HTMLElement>(':scope > li')];

/** A row's target name, without the open/closed arrow and the place number. */
export const rowName = (li: HTMLElement): string =>
  (li.querySelector('button[aria-expanded]')!.textContent as string).replace(/^[▸▾]\s*\d+\.\s*/, '').trim();

/** The names of the rows on the page, best first. */
export const rowNames = (testId = 'target-list'): string[] => listRows(testId).map(rowName);

/** The button that opens a row's detail, for the row of this name. */
export const nameButton = (name: string | RegExp): HTMLElement => {
  showAll();
  const hit = screen.getAllByRole('button').find((b) => b.hasAttribute('aria-expanded') && (typeof name === 'string' ? rowOf(b) === name : name.test(rowOf(b))));
  if (!hit) throw new Error(`No row named ${String(name)} on the page`);
  return hit;
};
const rowOf = (b: HTMLElement): string => (b.textContent as string).replace(/^[▸▾]\s*\d+\.\s*/, '').trim();

/** Presses "Show N more" until every row of the lists on the page is there. */
export const showAll = (): void => {
  for (let b = screen.queryByRole('button', { name: /^Show \d+ more$/ }); b !== null; b = screen.queryByRole('button', { name: /^Show \d+ more$/ })) fireEvent.click(b);
};
