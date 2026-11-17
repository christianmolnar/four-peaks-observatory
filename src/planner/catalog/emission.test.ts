import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterTargets, TARGET_TYPES } from './index';
import { emissionProfileFor, judgeProfile, OBJECT_OVERRIDES, TYPE_DEFAULTS } from './emission';
import { parseExtract } from './openngc';
import { createCatalogIndex } from './search';
import { catalogPatches } from './supplement';

const extract = parseExtract(JSON.parse(readFileSync(join(process.cwd(), 'public', 'catalog', 'openngc-v20260501-r3.json'), 'utf8')));
const index = createCatalogIndex(extract.objects, starterTargets, catalogPatches);

describe('emission profiles', () => {
  it('gives every catalog object (curated and bundled) a good profile', () => {
    expect(index.targets.length).toBeGreaterThan(4000);
    for (const t of index.targets) {
      const p = emissionProfileFor(t.id, t.type);
      expect(p).not.toBeNull();
      expect(judgeProfile(p)).toEqual([]);
    }
  });

  it('has a default for every catalog type', () => {
    for (const type of TARGET_TYPES) expect(judgeProfile(TYPE_DEFAULTS[type])).toEqual([]);
    expect(Object.keys(TYPE_DEFAULTS).sort()).toEqual([...TARGET_TYPES].sort());
  });

  it('names a catalog id for every override', () => {
    const ids = new Set(index.targets.map((t) => t.id));
    for (const id of Object.keys(OBJECT_OVERRIDES)) expect([id, ids.has(id)]).toEqual([id, true]);
  });

  it('a measured override beats the type default', () => {
    const m42 = emissionProfileFor('m42', 'nebula')!;
    expect(m42.confidence).toBe('measured');
    expect(m42.lines.SII).toBe(0.034);
    expect(m42.source).toMatch(/Sanchez/);
    expect(TYPE_DEFAULTS.nebula.lines.SII).toBe(0.15);
    // The type default is what an object without an override gets.
    const plain = emissionProfileFor('ngc7822', 'nebula')!;
    expect(plain.confidence).toBe('type-default');
    expect(plain.source).toBe('type default');
  });

  it('gives each researched object its own numbers and a source', () => {
    for (const [id, type] of [['m42', 'nebula'], ['ngc6960', 'supernova-remnant'], ['ngc6992', 'supernova-remnant'], ['ngc6995', 'supernova-remnant'], ['ngc6720', 'planetary-nebula'], ['ngc7293', 'planetary-nebula'], ['ngc1499', 'nebula']] as const) {
      const p = emissionProfileFor(id, type)!;
      expect(p.confidence).not.toBe('type-default');
      expect(p.source.length).toBeGreaterThan(10);
    }
    expect(emissionProfileFor('ngc1499', 'nebula')!.confidence).toBe('amateur');
    expect(emissionProfileFor('ngc6720', 'planetary-nebula')!.lines).toMatchObject({ Ha: 0.25, OIII: 1, SII: 0.05, NII: 0.5 });
  });

  it('a type with no default and a prototype key give no profile', () => {
    expect(emissionProfileFor('m42', 'constructor')).toBeNull();
    expect(emissionProfileFor('m42', 'star')).toBeNull();
    expect(emissionProfileFor('constructor', 'galaxy')).toEqual(TYPE_DEFAULTS.galaxy);
  });

  it('judges ranges', () => {
    const ok = TYPE_DEFAULTS.nebula;
    expect(judgeProfile({ ...ok, lines: { Ha: 1.2 } })).not.toEqual([]);
    expect(judgeProfile({ ...ok, lines: { Ha: -0.1 } })).not.toEqual([]);
    expect(judgeProfile({ ...ok, lines: { Ha: Number.NaN } })).not.toEqual([]);
    expect(judgeProfile({ ...ok, lines: { Xx: 0.5 } })).not.toEqual([]);
    expect(judgeProfile({ ...ok, continuum: 2 })).not.toEqual([]);
    expect(judgeProfile({ ...ok, source: '' })).not.toEqual([]);
    expect(judgeProfile({ ...ok, confidence: 'guess' })).not.toEqual([]);
    expect(judgeProfile(null)).not.toEqual([]);
  });
});
