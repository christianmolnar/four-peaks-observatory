import { starterTargets } from './index';
import type { CatalogTarget } from './index';
import { CATALOG_URL, parseExtract } from './openngc';
import { createCatalogIndex } from './search';
import { catalogPatches } from './supplement';
import type { CatalogPatches } from './supplement';
import type { CatalogIndex, SearchQuery, SearchResult } from './search';

export interface CatalogLoaderOptions {
  /** Defaults to the global `fetch`, looked up at call time. Inject one in tests or on the server. */
  fetch?: typeof fetch;
  url?: string;
  curated?: readonly CatalogTarget[];
  /** The name supplement and overrides; defaults to the bundled data files. */
  patches?: CatalogPatches;
}

/**
 * Returns a loader that fetches the extract on first use, validates it and builds the index once.
 * Concurrent and later calls share the same promise. A failed load is not cached, so the next call retries.
 */
export function createCatalogLoader(options: CatalogLoaderOptions = {}): () => Promise<CatalogIndex> {
  let pending: Promise<CatalogIndex> | null = null;
  const load = async (): Promise<CatalogIndex> => {
    const doFetch = options.fetch ?? globalThis.fetch;
    const url = options.url ?? CATALOG_URL;
    const res = await doFetch(url);
    if (!res.ok) throw new Error(`Catalog fetch failed: ${url} returned HTTP ${res.status}`);
    const extract = parseExtract(await res.json());
    return createCatalogIndex(extract.objects, options.curated ?? starterTargets, options.patches ?? catalogPatches);
  };
  return () => {
    if (pending === null) {
      pending = load().catch((e: unknown) => {
        pending = null;
        throw e;
      });
    }
    return pending;
  };
}

/** The app-wide catalog: loaded from `CATALOG_URL` on first search. */
export const loadCatalog = createCatalogLoader();

export async function searchCatalog(query: SearchQuery): Promise<SearchResult> {
  return (await loadCatalog()).search(query);
}
