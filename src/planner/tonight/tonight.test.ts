import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterTargets } from '../catalog';
import { parseExtract } from '../catalog/openngc';
import { createCatalogIndex } from '../catalog/search';
import { catalogPatches } from '../catalog/supplement';
import { opticalTrain } from '../optics';
import { rankTargets } from '../plan/rank';
import type { PlanTarget, PlanTrain } from '../plan';
import { createTonightRanker, createWorkerHandler, isSuperseded } from './index';
import type { TonightQuery, WorkerLike } from './index';
import type { WorkerRequest, WorkerResponse } from './handler';

const raw = JSON.parse(readFileSync(join(process.cwd(), 'public', 'catalog', 'openngc-v20260501-r3.json'), 'utf8'));
const targets: readonly PlanTarget[] = createCatalogIndex(parseExtract(raw).objects, starterTargets, catalogPatches).targets;
// A slice keeps these tests quick; the whole catalog is covered by the ranking tests and the benchmark.
const some = targets.filter((_, i) => i % 6 === 0);
const loadTargets = async () => some;

const train: PlanTrain = {
  kind: 'optical',
  name: 'wide',
  optics: opticalTrain({ focalLengthMm: 540, apertureMm: 80 }, { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 }),
};
const query = (over: Partial<TonightQuery> = {}): TonightQuery => ({
  site: { latitude: 33.5, longitude: -112, elevationM: 400 },
  horizon: null,
  minAltitude: 30,
  date: '2026-11-14',
  train,
  limit: 25,
  ...over,
});
const direct = (q: TonightQuery) => rankTargets({ ...q, targets: some });

/** A worker that runs the real worker-side handler in this process, with real message hops. */
function fakeWorker(log: WorkerRequest[] = []): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    terminate: () => undefined,
    postMessage: (m) => {
      log.push(m);
      void handle(m);
    },
  };
  const handle = createWorkerHandler(
    (r: WorkerResponse) => setTimeout(() => w.onmessage?.({ data: r }), 0),
    loadTargets,
    { chunkSize: 20, yieldNow: () => new Promise((r) => setTimeout(r, 0)) },
  );
  return w;
}

describe('without a Worker (jest, old browsers)', () => {
  it('runs the same ranking on this thread, in chunks', async () => {
    let yields = 0;
    const rankAsync = createTonightRanker({ loadTargets, chunkSize: 20, yieldNow: async () => { yields++; } });
    const r = await rankAsync(query());
    expect(r.entries).toEqual(direct(query()).entries);
    expect(r.entries.length).toBe(25);
    expect(yields).toBeGreaterThan(1);
  });

  it('yields after the night and the screen are prepared, before any scoring, and between planets', async () => {
    const events: string[] = [];
    const rankAsync = createTonightRanker({ loadTargets, chunkSize: 1000, yieldNow: async () => { events.push('yield'); } });
    const r = await rankAsync(query());
    // some / 1000 per chunk = 1 chunk: prepared, yield, chunk, yield, then 7 planets with a yield each.
    expect(events).toHaveLength(1 + 1 + 7);
    expect(r.entries).toEqual(direct(query()).entries);
    const noPlanets = createTonightRanker({ loadTargets, chunkSize: 1000, yieldNow: async () => { events.push('again'); }, });
    events.length = 0;
    await noPlanets(query({ includePlanets: false }));
    expect(events).toEqual(['again', 'again']);
  });

  it('falls back, with one warning, when the worker cannot be made', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rankAsync = createTonightRanker({ loadTargets, createWorker: () => { throw new Error('blocked'); } });
    expect((await rankAsync(query())).entries).toEqual(direct(query()).entries);
    await rankAsync(query());
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a failing catalog load is a rejection, not an empty list', async () => {
    const rankAsync = createTonightRanker({ loadTargets: async () => { throw new Error('catalog fetch failed'); } });
    await expect(rankAsync(query())).rejects.toThrow('catalog fetch failed');
  });

  it('a newer request supersedes an older one: the older rejects as superseded and stops, the newer completes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let first = true;
    let scoredByOlder = 0;
    const rankAsync = createTonightRanker({
      loadTargets,
      chunkSize: 10,
      yieldNow: async () => {
        if (first) { first = false; scoredByOlder++; await gate; }
      },
    });
    const older = rankAsync(query({ minAltitude: 30 }));
    const olderSettled = older.then(() => 'resolved', (e) => (isSuperseded(e) ? 'superseded' : `failed: ${String(e)}`));
    await new Promise((r) => setTimeout(r, 20)); // the older one is paused after its first chunk
    const newer = rankAsync(query({ minAltitude: 40 }));
    release();
    expect(await olderSettled).toBe('superseded');
    expect((await newer).entries).toEqual(direct(query({ minAltitude: 40 })).entries);
    expect(scoredByOlder).toBe(1);
  });
});

describe('with a worker', () => {
  it('posts the query (no targets: the worker loads the catalog itself) and returns the worker\'s result', async () => {
    const log: WorkerRequest[] = [];
    const rankAsync = createTonightRanker({ createWorker: () => fakeWorker(log), loadTargets: async () => { throw new Error('main thread must not load'); } });
    const r = await rankAsync(query());
    expect(r.entries).toEqual(direct(query()).entries);
    expect(log).toHaveLength(1);
    expect(log[0].query).not.toHaveProperty('targets');
  });

  it('uses one worker for many requests', async () => {
    let made = 0;
    const rankAsync = createTonightRanker({ createWorker: () => { made++; return fakeWorker(); } });
    await rankAsync(query());
    await rankAsync(query({ minAltitude: 35 }));
    expect(made).toBe(1);
  });

  it('a newer request supersedes an older one: the older rejects as superseded, the newer completes', async () => {
    const rankAsync = createTonightRanker({ createWorker: () => fakeWorker() });
    const older = rankAsync(query({ limit: 10 }));
    const olderOutcome = older.then(() => 'resolved', (e) => (isSuperseded(e) ? 'superseded' : `failed: ${String(e)}`));
    const newer = rankAsync(query({ limit: 12 }));
    expect(await olderOutcome).toBe('superseded');
    expect((await newer).entries).toHaveLength(12);
  });

  it('the worker side stops an older request when a newer one arrives', async () => {
    const out: WorkerResponse[] = [];
    const handle = createWorkerHandler((r) => out.push(r), loadTargets, { chunkSize: 5, yieldNow: () => new Promise((r) => setTimeout(r, 0)) });
    const a = handle({ id: 1, query: query() });
    const b = handle({ id: 2, query: query({ limit: 5 }) });
    await Promise.all([a, b]);
    expect(out.map((r) => `${r.id}:${r.kind}`).sort()).toEqual(['1:superseded', '2:result']);
  });

  it('a query by type goes through the worker and is answered as the direct ranking of that type; a newer type supersedes an older one', async () => {
    const log: WorkerRequest[] = [];
    const rankAsync = createTonightRanker({ createWorker: () => fakeWorker(log) });
    const galaxies = rankAsync(query({ types: ['galaxy'] }));
    const galaxiesOutcome = galaxies.then(() => 'resolved', (e) => (isSuperseded(e) ? 'superseded' : `failed: ${String(e)}`));
    const clusters = await rankAsync(query({ types: ['open-cluster', 'globular-cluster'] }));
    expect(await galaxiesOutcome).toBe('superseded');
    expect(log.at(-1)?.query.types).toEqual(['open-cluster', 'globular-cluster']); // the older one may never have been posted
    expect(clusters.entries).toEqual(direct(query({ types: ['open-cluster', 'globular-cluster'] })).entries);
    expect(clusters.entries.every((e) => e.type === 'open-cluster' || e.type === 'globular-cluster')).toBe(true);
    expect(clusters.typeCounts).toEqual(direct(query()).typeCounts);
    expect(clusters.typeNotFit).toEqual(direct(query()).typeNotFit);
  });

  it('a failure in the worker is a rejection with its message, not a silent fallback', async () => {
    const rankAsync = createTonightRanker({ createWorker: () => fakeWorker() });
    await expect(rankAsync(query({ limit: 0 }))).rejects.toThrow(/Tonight worker failed: limit must be a positive integer/);
  });

  it('a crashed worker rejects the waiting call, is terminated, and the next call starts a new worker', async () => {
    let made = 0;
    const terminate = jest.fn();
    const rankAsync = createTonightRanker({
      createWorker: () => {
        made++;
        if (made > 1) return fakeWorker();
        const crashing: WorkerLike = {
          onmessage: null,
          onerror: null,
          terminate,
          postMessage: () => { setTimeout(() => crashing.onerror?.({ message: 'boom' }), 0); },
        };
        return crashing;
      },
    });
    await expect(rankAsync(query())).rejects.toThrow('Tonight worker crashed: boom');
    expect(terminate).toHaveBeenCalledTimes(1);
    expect((await rankAsync(query())).entries).toHaveLength(25);
    expect(made).toBe(2);
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
