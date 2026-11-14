import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TARGET_TYPES, normalizeName, starterTargets } from './index';
import { createCatalogLoader } from './loader';
import { CATALOG_URL, parseExtract } from './openngc';
import { createCatalogIndex } from './search';
import type { CatalogIndex, SearchHit, SearchQuery, SearchTarget } from './search';

const ASSET = join(process.cwd(), 'public', 'catalog', 'openngc-v20260501-r2.json');
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
    const r = index.search({ text: 'nebul', limit: 500 });
    expect(r.hits.length).toBeGreaterThan(50);
    const kinds = r.hits.map((h) => h.match);
    const rank = ['designation', 'name-exact', 'name-prefix', 'word-prefix', 'substring', 'fuzzy'];
    const order = kinds.map((k) => rank.indexOf(k));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('prefix: "trifid" is the start of a name; word-prefix and substring reach further inside', () => {
    expect(index.search({ text: 'trifid' }).hits[0]).toMatchObject({ match: 'name-exact' });
    expect(index.search({ text: 'trif' }).hits[0]).toMatchObject({ match: 'name-prefix' });
    const word = index.search({ text: 'cluster' }).hits[0];
    expect(word.match).toBe('word-prefix');
    const sub = index.search({ text: 'ouble clus' });
    expect(sub.hits[0]).toMatchObject({ match: 'substring' });
    expect(sub.hits[0].target.id).toBe('c14');
  });

  it('is deterministic and capped by limit', () => {
    const a = index.search({ text: 'nebula', limit: 7 });
    const b = index.search({ text: 'nebula', limit: 7 });
    expect(a.hits).toHaveLength(7);
    expect(a.total).toBeGreaterThan(7);
    expect(a.hits.map((h) => h.target.id)).toEqual(b.hits.map((h) => h.target.id));
  });

  it('rejects a bad limit', () => {
    expect(() => index.search({ text: 'm31', limit: 0 })).toThrow('limit');
  });
});

describe('every Messier and Caldwell resolves', () => {
  it('M1..M110, and M102 is an alias of M101 as OpenNGC says', () => {
    const missing: number[] = [];
    for (let n = 1; n <= 110; n++) {
      if (index.search({ text: `M${n}` }).hits[0]?.match !== 'designation') missing.push(n);
    }
    expect(missing).toEqual([]);
    expect(ids({ text: 'M102' })).toEqual(['m101']);
    expect(ids({ text: 'Messier 102' })).toEqual(['m101']);
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
    // Each curated target stands for the catalog rows it shares a number with, plus two that only share its name and
    // place: NGC 2238 (Rosette Nebula) and IC 4703 (Eagle Nebula).
    expect(index.size).toBe(raw.count - claimedCount() - 2 + starterTargets.length);
    expect(index.size).toBe(4914);
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

  it('a curated name finds the curated target first, once: every name and alias of all 25', () => {
    for (const c of starterTargets) {
      for (const label of [c.name, ...c.aliases]) {
        const hits = index.search({ text: label, limit: 50 }).hits;
        expect(hits[0].target.id).toBe(c.id);
        expect(hits.filter((h) => h.target.id === c.id)).toHaveLength(1);
      }
    }
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
    expect(index.search({})).toMatchObject({ hits: [], notFoundLocally: false });
  });

  it.each(['🔭', '.*', '---', '?!'])('a query with nothing searchable in it (%s) is a miss', (text) => {
    expect(index.search({ text })).toMatchObject({ hits: [], total: 0, notFoundLocally: true });
    expect(index.search({ text, types: ['galaxy'] })).toMatchObject({ hits: [], notFoundLocally: true });
  });

  it('a complete designation with no exact hit is a miss, never a prefix hit: NGC 99999, NGC 65, IC 5, M11111', () => {
    for (const text of ['NGC 99999', 'NGC 65', 'IC 5', 'M11111', 'C 110']) {
      expect(index.search({ text })).toMatchObject({ hits: [], total: 0, notFoundLocally: true });
    }
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

describe('designations the first build lost (found as aliases)', () => {
  it.each([
    ['NGC 2244', 'ngc2239'], // the Rosette cluster, C 50
    ['NGC 1291', 'ngc1269'],
    ['NGC 6533', 'm8'], // a Dup row of the Lagoon: the curated M8 stands for it
    ['NGC 6634', 'ngc6637'], // M69
    ['IC 547', 'ngc2947'],
    ['IC 2494', 'ngc2947'],
    ['IC 843', 'ngc4913'],
    ['NGC 651', 'ngc650'], // M76
    ['NGC 2478', 'ngc2422'], // M47
    ['IC 1985', 'ic348'],
    ['NGC 4656', 'ngc4656-ned01'], // the Hockey Stick: its group number
  ])('%s -> %s first, as a designation', (text, id) => {
    const r = index.search({ text });
    expect(r.hits[0].target.id).toBe(id);
    expect(r.hits[0].match).toBe('designation');
    expect(r.notFoundLocally).toBe(false);
  });
});

describe('Dup rows whose primary is not in the extract', () => {
  it('stay unfound: IC 819 and IC 3543 duplicate NGC 4676A and NGC 4565C, which are below the cut', () => {
    for (const text of ['IC 819', 'IC 3543']) expect(index.search({ text })).toMatchObject({ hits: [], notFoundLocally: true });
  });
});

describe('a curated target is never listed twice', () => {
  it.each([
    ['rosette nebula', 'ngc2237'],
    ['eagle nebula', 'm16'],
    ['C 49', 'ngc2237'],
    ['NGC 2238', 'ngc2237'],
    ['IC 4703', 'm16'],
    ['rosette', 'ngc2237'],
  ])('%s -> only %s', (text, id) => {
    const hits = index.search({ text, limit: 50 }).hits.filter((h) => h.match === 'designation' || h.match === 'name-exact');
    expect(hits.map((h) => h.target.id)).toEqual([id]);
    expect(hits[0].target.curated).toBe(true);
  });

  const everything = (): SearchHit[] => index.search({ types: [...TARGET_TYPES], limit: 100000 }).hits;
  const sepArcmin = (a: SearchTarget, b: SearchTarget): number => {
    const dec = ((a.decDeg + b.decDeg) / 2) * (Math.PI / 180);
    return Math.hypot((a.raHours - b.raHours) * 15 * Math.cos(dec), a.decDeg - b.decDeg) * 60;
  };
  const nameKeys = (t: SearchTarget): Set<string> =>
    new Set([t.name, ...t.aliases].map(normalizeName).filter((k) => !/^[a-z]{1,4}\d+[a-z]{0,2}$/.test(k)));
  const FEW_ARCMIN = 5;

  it('no two results of any name search share a name within a few arcmin and are not the same curated target', () => {
    const labels = new Set<string>(starterTargets.flatMap((c) => [c.name, ...c.aliases]));
    // 100 catalog names, spread over the whole catalog
    const named = raw.objects.filter((o: { name: string; id: string }) => !/^(NGC|IC) \d+$/.test(o.name) && o.name !== o.id);
    for (let i = 0; i < 100; i++) labels.add(named[Math.floor((i * named.length) / 100)].name);
    expect(labels.size).toBeGreaterThan(100);
    const clashes: string[] = [];
    for (const text of labels) {
      const hits = index.search({ text, limit: 100 }).hits;
      for (let i = 0; i < hits.length; i++) {
        for (let j = i + 1; j < hits.length; j++) {
          const [a, b] = [hits[i].target, hits[j].target];
          if (!a.curated && !b.curated) continue; // two catalog rows that share a name (Antennae, Butterfly Galaxies) are two objects
          const shared = [...nameKeys(a)].filter((k) => nameKeys(b).has(k));
          if (shared.length > 0 && sepArcmin(a, b) < FEW_ARCMIN) clashes.push(`${text}: ${a.id} / ${b.id} (${shared[0]})`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  it('across the whole index: no catalog object shares a name with a curated target inside its footprint', () => {
    const all = everything().map((h) => h.target);
    const clashes: string[] = [];
    for (const c of all.filter((t) => t.curated)) {
      const keys = nameKeys(c);
      const radius = Math.max(FEW_ARCMIN, (c.sizeArcmin?.major ?? 0) / 2);
      for (const t of all) {
        if (t.id === c.id || t.curated) continue;
        if ([...nameKeys(t)].some((k) => keys.has(k)) && sepArcmin(c, t) <= radius) clashes.push(`${c.id} / ${t.id}`);
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe('names people type', () => {
  it.each([
    ['the andromeda galaxy', 'm31'],
    ['The Andromeda Galaxy', 'm31'],
    ['Barnard 33', 'b33'],
    ['barnard33', 'b33'],
    ['Sharpless 155', 'c9'],
    ['Sharpless 2-155', 'c9'],
    ['Sh2-155', 'c9'],
    ['47 Tucanae', 'ngc104'],
    ['47 Tuc', 'ngc104'],
    ['ω Cen', 'ngc5139'],
    ['Ω Centauri', 'ngc5139'],
    ['omega cen', 'ngc5139'],
    ['M３１', 'm31'],
    ['ＮＧＣ　２２４', 'm31'],
    ['the guitar', 'ngc3561'],
  ])('%s -> %s first', (text, id) => {
    const r = index.search({ text });
    expect(r.hits[0].target.id).toBe(id);
    expect(r.notFoundLocally).toBe(false);
  });

  it('a Greek letter is a Bayer abbreviation, not nothing: "tet Car" and "θ Car" agree', () => {
    expect(ids({ text: 'θ Car' })).toEqual(ids({ text: 'tet Car' }));
    expect(ids({ text: 'θ Car' })[0]).toBe('ic2602');
  });
});

describe('popular nicknames from the supplement', () => {
  const supplement = JSON.parse(readFileSync(join(process.cwd(), 'src', 'planner', 'data', 'catalog-supplement.json'), 'utf8')).entries as { id: string; names: string[] }[];
  const known = new Set<string>(raw.objects.map((o: { id: string }) => o.id));

  it('every entry is tied to an object of the catalog and finds it', () => {
    expect(supplement.length).toBeGreaterThan(10);
    for (const e of supplement) {
      expect(known.has(e.id)).toBe(true);
      for (const n of e.names) {
        const hit = index.search({ text: n, limit: 5 }).hits.find((h) => h.target.id === e.id || h.target.aliases.includes(n));
        expect(hit).toBeDefined();
      }
    }
  });

  it.each([
    ['heart nebula', 'ic1805'],
    ['heart', 'ic1805'],
    ['soul', 'ic1848'],
    ['pacman', 'ngc281'],
    ['elephant trunk', 'ic1396'],
    ["elephant's trunk", 'ic1396'],
    ['seven sisters', 'mel22'],
    ['wizard', 'ngc7380'],
    ['seagull', 'ic2177'],
    ['jellyfish', 'ic443'],
    ['hockey stick', 'ngc4656-ned01'],
    ["witch's broom", 'ngc6960'],
    // already in OpenNGC, so they must keep working
    ['pelican', 'ic5070'],
    ['cocoon nebula', 'ic5146'],
    ['bubble nebula', 'ngc7635'],
    ['crescent', 'ngc6888'],
    ['iris nebula', 'ngc7023'],
    ['cave', 'c9'],
    ['horsehead', 'b33'],
    ['needle galaxy', 'ngc4565'],
    ['whale', 'ngc4631'],
    ['sunflower', 'ngc5055'],
    ['black eye', 'ngc4826'],
    ['double cluster', 'c14'],
    ['cigar', 'm82'],
    ['leo triplet', 'leo-triplet'],
    ["markarian's chain", 'markarians-chain'],
    ['monkey head', 'ngc2174'],
    ['christmas tree', 'ngc2264'],
  ])('%s -> %s first', (text, id) => {
    expect(ids({ text })[0]).toBe(id);
  });
});

describe('overrides of upstream naming errors', () => {
  it('the Flame Nebula is NGC 2024, not IC 434', () => {
    expect(ids({ text: 'flame nebula' })[0]).toBe('ngc2024');
    expect(ids({ text: 'NGC 2024' })[0]).toBe('ngc2024');
    const ic434 = index.search({ text: 'IC 434' }).hits[0].target;
    expect(ic434.id).toBe('ic434');
    expect(ic434.name).toBe('IC 434');
    expect(ids({ text: 'flame nebula', limit: 50 } as SearchQuery, 50)).not.toContain('ic434');
  });
});

describe('number-only queries', () => {
  it('a number is that number in every catalog: M, NGC, IC, Caldwell, in that order', () => {
    expect(ids({ text: '31' }, 10)).toEqual(['m31', 'ic405']); // M31, then IC 405 (which is C 31)
    expect(ids({ text: '42' })[0]).toBe('m42');
    expect(ids({ text: '7000' })[0]).toBe('ngc7000');
  });

  it('every hit of a number carries that number, and none is a number inside another (7242 for 42)', () => {
    for (const text of ['42', '7000', '224', '13']) {
      const r = index.search({ text, limit: 50 });
      expect(r.hits.length).toBeGreaterThan(0);
      for (const h of r.hits) {
        const labels = [h.target.id, h.target.name, ...h.target.aliases].join(' ');
        expect(labels).toMatch(new RegExp(`(^|[^0-9])0*${text}([^0-9]|$)`, 'i'));
      }
    }
  });

  it('a number nobody has is a miss', () => {
    expect(index.search({ text: '99999' })).toMatchObject({ hits: [], notFoundLocally: true });
  });
});

describe('filter validation', () => {
  it.each([
    ['sizeArcmin.min NaN', { sizeArcmin: { min: NaN } }, 'sizeArcmin.min'],
    ['sizeArcmin.max Infinity', { sizeArcmin: { max: Infinity } }, 'sizeArcmin.max'],
    ['frame.minPercent NaN', { frame: { fovArcmin: 180, minPercent: NaN } }, 'frame.minPercent'],
    ['frame.maxPercent -Infinity', { frame: { fovArcmin: 180, maxPercent: -Infinity } }, 'frame.maxPercent'],
    ['frame.fovArcmin Infinity', { frame: { fovArcmin: Infinity } }, 'frame.fovArcmin'],
    ['frame.fovArcmin NaN', { frame: { fovArcmin: NaN } }, 'frame.fovArcmin'],
    ['frame.fovArcmin negative', { frame: { fovArcmin: -3 } }, 'frame.fovArcmin'],
    ['an unknown type', { types: ['star' as never] }, 'unknown target type'],
    ['limit 1.5', { limit: 1.5 }, 'limit'],
  ])('%s throws a clear error', (_label, query, where) => {
    expect(() => index.search(query as SearchQuery)).toThrow(where);
  });

  it('still accepts a plain range and a plain frame', () => {
    expect(index.search({ sizeArcmin: { min: 10 }, frame: { fovArcmin: 180, minPercent: 10, maxPercent: 90 } }).hits.length).toBeGreaterThan(0);
  });
});

describe('hits do not expose the index', () => {
  it('targets are frozen, deeply, and a later search is unchanged', () => {
    const before = JSON.stringify(index.search({ text: 'M31' }));
    const t = index.search({ text: 'M31' }).hits[0].target as unknown as { aliases: string[]; sizeArcmin: { major: number }; seasonMonths: number[]; name: string };
    expect(Object.isFrozen(t)).toBe(true);
    expect(() => t.aliases.push('Mutated')).toThrow(TypeError);
    expect(() => { t.sizeArcmin.major = 1; }).toThrow(TypeError);
    expect(() => t.seasonMonths.push(13)).toThrow(TypeError);
    expect(() => { t.name = 'Mutated'; }).toThrow(TypeError);
    expect(JSON.stringify(index.search({ text: 'M31' }))).toBe(before);
    expect(ids({ text: 'Mutated' })).toEqual([]);
  });

  it('catalog (not curated) targets are frozen too, and the curated source list is untouched', () => {
    const t = index.search({ text: 'NGC 1291' }).hits[0].target as unknown as { aliases: string[] };
    expect(() => t.aliases.push('Mutated')).toThrow(TypeError);
    expect(Object.isFrozen(starterTargets[0].aliases)).toBe(false);
  });
});
