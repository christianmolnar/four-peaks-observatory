import sample from '../data/sample-profile.json';
import { starterTargets } from '../catalog';
import { opticalTrain } from '../optics';
import { horizonAltitudeAt } from '../horizon';
import { arcToHorizonPoints, resolveTrain, validateProfile } from './index';

describe('sample profile', () => {
  const profile = validateProfile(sample);

  it('validates and has the expected shape', () => {
    expect(profile.sites).toHaveLength(1);
    expect(profile.equipment.scopes).toHaveLength(1);
    expect(profile.equipment.accessories).toHaveLength(3);
    expect(profile.equipment.cameras).toHaveLength(3);
    expect(profile.equipment.smartScopes).toHaveLength(4);
    expect(profile.trains.map((t) => t.kind).filter((k) => k === 'smart')).toHaveLength(4);
  });

  it('references only catalog targets', () => {
    const ids = new Set(starterTargets.map((t) => t.id));
    for (const p of profile.plans) for (const id of p.targetIds) expect(ids.has(id)).toBe(true);
  });

  it('gives the blocked arc 120 to 320 at 42 deg', () => {
    const pts = arcToHorizonPoints(profile.sites[0].blockedArc);
    expect(horizonAltitudeAt(pts, 200)).toBe(42);
    expect(horizonAltitudeAt(pts, 90)).toBe(0);
  });

  it('computes image scale for the C11 + 676MC train: 206.265 * 2.0 / 2800 = 0.1473 arcsec/px', () => {
    const train = profile.trains.find((t) => t.id === 'planet-c11-676')!;
    const r = resolveTrain(profile, train);
    const optics = opticalTrain(r.scope, r.camera, r.accessory);
    expect(optics.imageScale).toBeCloseTo(0.1473, 3);
    expect(optics.focalRatio).toBeCloseTo(10.02, 2);
    expect(optics.missing).toEqual([]);
  });

  it('reports the HyperStar factor and unspecified smart-scope pixel size as missing, not guessed', () => {
    const hs = profile.trains.find((t) => t.id === 'wide-c11-hyperstar-2600')!;
    const r = resolveTrain(profile, hs);
    const o = opticalTrain(r.scope, r.camera, r.accessory);
    expect(o.missing).toEqual(['accessory.factor']);
    expect(o.imageScale).toBeUndefined();

    const s30 = resolveTrain(profile, profile.trains.find((t) => t.id === 'smart-seestar-s30-pro')!);
    const so = opticalTrain(s30.scope, s30.camera, s30.accessory);
    expect(so.missing).toContain('scope.focalLengthMm');
    expect(so.imageScale).toBeUndefined();
  });

  it('multiplies stacked accessories', () => {
    const p = validateProfile(sample);
    const t = { ...p.trains.find((x) => x.id === 'planet-c11-powermate-676')! } as typeof p.trains[number] & { accessoryIds: string[] };
    t.accessoryIds = ['powermate-25', 'reducer-07'];
    expect(resolveTrain(p, t).accessory?.factor).toBeCloseTo(1.75, 10);
  });
});
