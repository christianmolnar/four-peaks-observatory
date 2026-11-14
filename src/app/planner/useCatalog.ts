'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CatalogIndex } from '@/planner/catalog/search';

export type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; index: CatalogIndex }
  | { status: 'error'; message: string };

/** The bundled catalog, loaded once by the app-wide lazy loader (a failed load is not cached there, so `retry` asks again). */
export function useCatalog(load: () => Promise<CatalogIndex>): { state: CatalogState; retry: () => void } {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    load().then(
      (index) => {
        if (live) setState({ status: 'ready', index });
      },
      (e: unknown) => {
        if (live) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [load, attempt]);
  return { state, retry };
}
