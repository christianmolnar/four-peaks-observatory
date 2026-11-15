import { TYPE_GROUPS, groupCount, typeGroupOf } from './type-groups';
import { TARGET_TYPES } from '../catalog';

describe('the type selector\'s choices', () => {
  it('lists All first and Solar system last, with the choices a person names', () => {
    expect(TYPE_GROUPS.map((g) => g.label)).toEqual([
      'All',
      'Galaxies',
      'Nebulae',
      'Planetary nebulae',
      'Globular clusters',
      'Open clusters',
      'Supernova remnants',
      'Galaxy groups and pairs',
      'Solar system',
    ]);
  });

  it('names only real catalog types, each once, and none for double stars or asterisms', () => {
    const named = TYPE_GROUPS.flatMap((g) => g.types ?? []);
    for (const t of named) expect(TARGET_TYPES).toContain(t);
    expect(new Set(named).size).toBe(named.length);
    expect(named).not.toContain('double-star');
    expect(named).not.toContain('asterism');
    expect(TARGET_TYPES.filter((t) => !named.includes(t)).sort()).toEqual(['asterism', 'double-star']);
  });

  it('falls back to All for an id that does not exist', () => {
    expect(typeGroupOf('globular-clusters').types).toEqual(['globular-cluster']);
    expect(typeGroupOf('deep-sky').id).toBe('all');
    expect(typeGroupOf(undefined).id).toBe('all');
  });

  it('counts a choice from the per-type counts, All as every type plus the bodies up', () => {
    const counts = { galaxy: 40, nebula: 7, 'dark-nebula': 1, 'globular-cluster': 3, asterism: 2 };
    expect(groupCount(typeGroupOf('galaxies'), counts, 4)).toBe(40);
    expect(groupCount(typeGroupOf('nebulae'), counts, 4)).toBe(8);
    expect(groupCount(typeGroupOf('open-clusters'), counts, 4)).toBe(0);
    expect(groupCount(typeGroupOf('solar-system'), counts, 4)).toBe(4);
    expect(groupCount(typeGroupOf('all'), counts, 4)).toBe(57);
  });
});
