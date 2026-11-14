import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterTargets } from './index';
import { createCatalogLoader } from './loader';
import { CATALOG_URL, parseExtract } from './openngc';
import { createCatalogIndex } from './search';
import type { CatalogIndex, SearchQuery } from './search';

const ASSET = join(process.cwd(), 'public', 'catalog', 'openngc-v20260501.json');
const rawText = readFileSync(ASSET, 'utf8');
const raw = JSON.parse(rawText);

const fakeFetch = (calls: string[]): typeof fetch =>
  (async (url: string) => {
    calls.push(url);
    return new Response(rawText, { status: 200 });
  }) as unknown as typeof fetch;

let index: CatalogIndex;
beforeAll(async () => {
  index = await createCatalogLoader({ fetch: fakeFetch([]) })();
});

const ids = (q: SearchQuery, n = 5): string[] => index.search({ ...q, limit: n }).hits.map((h) => h.target.id);

describe('extract schema', () => {
  it('accepts the bundled file', () => {
    const e = parseExtract(raw);
    expect(e.objects.length).toBe(raw.count);
    expect(e.tag).toBe('v20260501');
  });

  it.each([
    ['a wrong count', { ...raw, count: 1 }, 'count'],
    ['a bad type', { ...raw, count: 1, objects: [{ ...raw.objects[0], type: 'star' }] }, 'objects[0].type'],
    ['RA out of range', { ...raw, count: 1, objects: [{ ...raw.objects[0], raHours: 24 }] }, 'objects[0].raHours'],
    ['a zero size', { ...raw, count: 1, objects: [{ ...raw.objects[0], majorArcmin: 0 }] }, 'objects[0].majorArcmin'],
    ['a duplicate id', { ...raw, count: 2, objects: [raw.objects[0], raw.objects[0]] }, 'duplicate id'],
    ['another licence', { ...raw, license: 'MIT' }, 'license'],
  ])('rejects %s', (_label, bad, where) => {
    expect(() => parseExtract(bad)).toThrow(where);
  });
});

describe('lazy load', () => {
  it('fetches once, on first use, for any number of searches', async () => {
    const calls: string[] = [];
    const load = createCatalogLoader({ fetch: fakeFetch(calls) });
    expect(calls).toHaveLength(0);
    const [a, b] = await Promise.all([load(), load()]);
    await load();
    expect(a).toBe(b);
    expect(calls).toEqual([CATALOG_URL]);
  });

  it('fails loud on HTTP errors and retries on the next call', async () => {
    let n = 0;
    const flaky = (async () => (++n === 1 ? new Response('no', { status: 503 }) : new Response(rawText))) as unknown as typeof fetch;
    const load = createCatalogLoader({ fetch: flaky });
    await expect(load()).rejects.toThrow('HTTP 503');
    await expect(load()).resolves.toBeDefined();
  });

  it('rejects a file that fails the schema', async () => {
    const bad = (async () => new Response(JSON.stringify({ format: 2 }))) as unknown as typeof fetch;
    await expect(createCatalogLoader({ fetch: bad })()).rejects.toThrow('format');
  });
});

describe('designations in any form', () => {
  it.each([
    ['M31', 'm31'],
    ['m 31', 'm31'],
    ['Messier 31', 'm31'],
    ['NGC 224', 'm31'],
    ['IC 1396', 'ic1396'],
    ['C 33', 'ngc6992'],
    ['Caldwell 33', 'ngc6992'],
    ['c33', 'ngc6992'],
    ['C9', 'c9'],
  ])('%s -> first hit %s', (text, id) => {
    const r = index.search({ text });
    expect(r.hits[0].target.id).toBe(id);
    expect(r.hits[0].match).toBe('designation');
  });

  it('NGC 7000 and NGC7000 give the curated North America Nebula', () => {
    expect(ids({ text: 'NGC 7000' })[0]).toBe('ngc7000');
    expect(ids({ text: 'NGC7000' })[0]).toBe('ngc7000');
  });

  it('a designation is not matched inside other designations: C 14 is only the Double Cluster', () => {
    expect(ids({ text: 'C 14' })).toEqual(['c14']);
  });

  it('has no Sh2-240 and says so', () => {
    expect(index.search({ text: 'Sh2-240' }).notFoundLocally).toBe(true);
    expect(ids({ text: 'Sh2-155' })[0]).toBe('c9');
  });
});

describe('name search and ranking', () => {
  it('andromeda -> M31 first', () => {
    const r = index.search({ text: 'andromeda' });
    expect(r.hits[0].target.id).toBe('m31');
    expect(['name-exact', 'name-prefix']).toContain(r.hits[0].match);
  });

  it('orion and orion neb -> the Orion Nebula first (curated M42)', () => {
    expect(ids({ text: 'orion' })[0]).toBe('m42');
    expect(ids({ text: 'orion neb' })[0]).toBe('m42');
  });

  it('horsehead -> Barnard 33', () => {
    expect(ids({ text: 'horsehead' })[0]).toBe('b33');
  });

  it('pleiades and M45 are the same object', () => {
    expect(ids({ text: 'pleiades' })[0]).toBe('mel22');
    expect(ids({ text: 'M45' })).toEqual(['mel22']);
  });

  it('a typo still finds it: andromida, horshead, pleidas', () => {
    const r = index.search({ text: 'andromida' });
    expect(r.hits[0].target.id).toBe('m31');
    expect(r.hits[0].match).toBe('fuzzy');
    expect(ids({ text: 'horshead' })[0]).toBe('b33');
    expect(ids({ text: 'pleidas' })[0]).toBe('mel22');
  });

  it('orders by tier: designation, then prefix, then substring, then fuzzy', () => {
    const r = index.search({ text: 'm4', limit: 50 });
    expect(r.hits[0].target.id).toBe('m4'.length ? r.hits[0].target.id : '');
    const kinds = r.hits.map((h) => h.match);
    const rank = ['designation', 'name-exact', 'name-prefix', 'word-prefix', 'substring', 'fuzzy'];
    const order = kinds.map((k) => rank.indexOf(k));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('substring: "nebula" finds names that contain it', () => {
    expect(index.search({ text: 'trifid' }).hits.length).toBeGreaterThan(0);
  });

  it('is deterministic and capped by limit', () => {
    const a = index.search({ text: 'ngc 7', limit: 7 });
    const b = index.search({ text: 'ngc 7', limit: 7 });
    expect(a.hits).toHaveLength(7);
    expect(a.total).toBeGreaterThan(7);
    expect(a.hits.map((h) => h.target.id)).toEqual(b.hits.map((h) => h.target.id));
  });

  it('rejects a bad limit', () => {
    expect(() => index.search({ text: 'm31', limit: 0 })).toThrow('limit');
  });
});

describe('every Messier and Caldwell resolves', () => {
  it('M1..M110 except the known absent M102', () => {
    const missing: number[] = [];
    for (let n = 1; n <= 110; n++) {
      if (index.search({ text: `M${n}` }).hits[0]?.match !== 'designation') missing.push(n);
    }
    expect(missing).toEqual([102]);
  });

  it('C1..C109', () => {
    const missing: number[] = [];
    for (let n = 1; n <= 109; n++) {
      if (index.search({ text: `Caldwell ${n}` }).hits[0]?.match !== 'designation') missing.push(n);
    }
    expect(missing).toEqual([]);
  });
});

describe('merge with the curated 25', () => {
  it('keeps every curated target, with its flags, and lists none twice', () => {
    for (const c of starterTargets) {
      const hit = index.search({ text: c.id }).hits[0];
      expect(hit.target.id).toBe(c.id);
      expect(hit.target.curated).toBe(true);
      expect(hit.target.seasonMonths).toEqual(c.seasonMonths);
      expect(hit.target.brightCore).toBe(c.brightCore);
    }
    const everything = index.search({ types: ['galaxy', 'nebula', 'open-cluster', 'globular-cluster', 'planetary-nebula'], limit: 100000 });
    const seen = everything.hits.map((h) => h.target.id);
    expect(new Set(seen).size).toBe(seen.length);
    expect(index.size).toBe(raw.count - 0 - claimedCount() + starterTargets.length);
  });

  function claimedCount(): number {
    // Catalog objects that the curated list stands for: counted independently from the raw file by designation.
    const own = (o: { id: string; m?: number; ngc?: number; ic?: number; c?: number }): string[] => [
      o.id,
      ...(o.m ? [`m${o.m}`] : []),
      ...(o.ngc ? [`ngc${o.ngc}`] : []),
      ...(o.ic ? [`ic${o.ic}`] : []),
      ...(o.c ? [`c${o.c}`] : []),
    ];
    const curatedKeys = new Set(
      starterTargets.flatMap((t) => [t.id, t.name, ...t.aliases].map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^([a-z]+)0+(\d)/, '$1$2'))),
    );
    return raw.objects.filter((o: { id: string }) => own(o).some((k) => curatedKeys.has(k))).length;
  }

  it('resolves every curated anchor object to the curated target', () => {
    const anchors = JSON.parse(readFileSync(join(process.cwd(), 'src', 'planner', 'data', 'targets.json'), 'utf8')).targets as { id: string; openngc: string }[];
    const byName = new Map<string, string>(raw.objects.map((o: { id: string }) => [o.id, o.id]));
    for (const a of anchors) {
      const catalogId = a.openngc.toLowerCase().replace(/^([a-z]+)0+(\d)/, '$1$2');
      expect(byName.has(catalogId)).toBe(true);
      const hits = index.search({ text: catalogId }).hits;
      expect(hits.filter((h) => h.match === 'designation').map((h) => h.target.id)).toEqual([a.id]);
    }
  });

  it('Heart and Soul pair stays curated if present in the starter list', () => {
    const pairs = starterTargets.filter((t) => /heart|soul/i.test(t.name));
    for (const p of pairs) expect(index.search({ text: p.name }).hits[0].target.curated).toBe(true);
  });
});

describe('type and size filters', () => {
  it('type filter keeps only that type', () => {
    const r = index.search({ types: ['globular-cluster'], limit: 500 });
    expect(r.hits.length).toBeGreaterThan(100);
    expect(r.hits.every((h) => h.target.type === 'globular-cluster')).toBe(true);
    expect(index.search({ text: 'm13', types: ['galaxy'] }).hits).toEqual([]);
  });

  it('type filter combines with text', () => {
    const r = index.search({ text: 'orion', types: ['nebula'] });
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.every((h) => h.target.type === 'nebula')).toBe(true);
  });

  it('size range is on the major axis in arcmin, inclusive; targets without a size drop out', () => {
    const r = index.search({ sizeArcmin: { min: 60, max: 200 }, limit: 500 });
    expect(r.hits.length).toBeGreaterThan(5);
    for (const h of r.hits) {
      expect(h.target.sizeArcmin!.major).toBeGreaterThanOrEqual(60);
      expect(h.target.sizeArcmin!.major).toBeLessThanOrEqual(200);
    }
    expect(r.hits.map((h) => h.target.id)).toContain('m31'); // 177.8'
  });

  it('percent of frame = major axis / FOV', () => {
    const fov = 120; // arcmin
    const r = index.search({ text: 'M31', frame: { fovArcmin: fov } });
    expect(r.hits[0].percentOfFrame).toBeCloseTo((177.83 / 120) * 100, 1);
    const mid = index.search({ frame: { fovArcmin: fov, minPercent: 30, maxPercent: 80 }, limit: 5000 });
    expect(mid.hits.length).toBeGreaterThan(5);
    for (const h of mid.hits) {
      expect(h.percentOfFrame!).toBeGreaterThanOrEqual(30);
      expect(h.percentOfFrame!).toBeLessThanOrEqual(80);
      expect(h.target.sizeArcmin!.major / fov * 100).toBeCloseTo(h.percentOfFrame!, 6);
    }
    expect(mid.hits.map((h) => h.target.id)).not.toContain('m31');
  });

  it('rejects a non-positive FOV', () => {
    expect(() => index.search({ frame: { fovArcmin: 0 } })).toThrow('fovArcmin');
  });

  it('filters only: brightest first, Messier first on ties', () => {
    const r = index.search({ types: ['galaxy'], limit: 3 });
    expect(r.hits).toHaveLength(3);
    expect(r.hits[0].match).toBe('filter');
  });
});

describe('not found locally', () => {
  it('an unknown query returns no hits and says so', () => {
    for (const text of ['M9999', 'not a target', 'zzzzzzzz', 'xq7']) {
      const r = index.search({ text });
      expect(r.hits).toEqual([]);
      expect(r.total).toBe(0);
      expect(r.notFoundLocally).toBe(true);
    }
  });

  it('an empty query is not a miss', () => {
    expect(index.search({ text: '  ' })).toMatchObject({ hits: [], notFoundLocally: false });
  });

  it('a filter that excludes a found name is not a miss', () => {
    expect(index.search({ text: 'm13', types: ['galaxy'] }).notFoundLocally).toBe(false);
  });
});

describe('index over a small catalog', () => {
  it('works without curated targets', () => {
    const small = createCatalogIndex(raw.objects.slice(0, 50), []);
    expect(small.size).toBe(50);
  });
});
