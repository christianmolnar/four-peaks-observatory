import { MAX_SUBS, MAX_SUB_S } from '@/planner/exposure';
import { checkNumber, choiceOf, differsText, minutesText, rowExposure, splitWarnings, withNumber, withPreset } from './rowExposure';
import type { SlotInput } from '@/planner/itinerary';
import type { PlanEntry } from '@/planner/plan';
import type { ProfileFilter } from '@/planner/profile';
import type { PlanTargetRef } from '@/planner/state/plans';
import { PLANS_VERSION, validatePlans } from '@/planner/state/plans';
import type { ExposureResult, ExposureWarning } from '@/planner/exposure';

const ref = (extra: Partial<PlanTargetRef> = {}): PlanTargetRef => ({ id: 'm31', preset: 'balanced', ...extra });

describe('typed numbers', () => {
  it('accepts a plain sub length and a whole count', () => {
    expect(checkNumber('subSeconds', '120')).toEqual({ ok: true, value: 120 });
    expect(checkNumber('subSeconds', ' 2.5 ')).toEqual({ ok: true, value: 2.5 });
    expect(checkNumber('subCount', '30')).toEqual({ ok: true, value: 30 });
  });

  it('rejects zero, negative, non-numeric, empty and absurd input with a plain message', () => {
    for (const field of ['subSeconds', 'subCount'] as const) {
      for (const text of ['0', '00', '0.0', '-5', '-0.5']) expect(checkNumber(field, text)).toMatchObject({ ok: false, message: 'Above 0' });
      for (const text of ['abc', '1e3', '12x', '1,5', 'NaN', 'Infinity', '--1']) expect(checkNumber(field, text).ok).toBe(false);
      expect(checkNumber(field, '')).toMatchObject({ ok: false, message: expect.stringMatching(/^Enter a /) });
    }
    expect(checkNumber('subSeconds', '0.999')).toMatchObject({ ok: false, message: 'Sub: 1 to 300 s' });
    expect(checkNumber('subSeconds', '1').ok).toBe(true);
    expect(checkNumber('subSeconds', String(MAX_SUB_S + 1))).toMatchObject({ ok: false, message: 'Sub: 1 to 300 s' });
    expect(checkNumber('subSeconds', '3600')).toMatchObject({ ok: false, message: 'Sub: 1 to 300 s' });
    expect(checkNumber('subSeconds', String(MAX_SUB_S)).ok).toBe(true);
    expect(checkNumber('subCount', String(MAX_SUBS + 1))).toMatchObject({ ok: false, message: `Max ${MAX_SUBS} subs` });
    expect(checkNumber('subCount', String(MAX_SUBS)).ok).toBe(true);
    expect(checkNumber('subCount', '2.5').ok).toBe(false);
    expect(checkNumber('subCount', '99999999999999999999').ok).toBe(false);
  });
});

describe('a target\'s exposure choice', () => {
  it('a preset target is its preset alone; a Custom one is its numbers over the preset it differs from (Balanced when none is kept)', () => {
    expect(choiceOf(ref({ preset: 'deep' }))).toEqual({ preset: 'deep' });
    expect(choiceOf(ref({ preset: 'custom', base: 'quick', custom: { subSeconds: 90 } }))).toEqual({ preset: 'quick', overrides: { subSeconds: 90 } });
    expect(choiceOf(ref({ preset: 'custom' }))).toEqual({ preset: 'balanced', overrides: {} });
  });

  it('choosing Custom keeps the preset it came from; choosing a preset drops the custom numbers and the favorite flag', () => {
    const c = withPreset(ref({ preset: 'deep', favorite: 'ask' }), 'custom');
    expect(c).toEqual({ id: 'm31', preset: 'custom', base: 'deep', custom: {} });
    const back = withPreset({ ...c, custom: { subSeconds: 60 }, favorite: 'restored' }, 'quick');
    expect(back).toEqual({ id: 'm31', preset: 'quick' });
    expect(withPreset(ref({ preset: 'custom', base: 'deep', custom: { subCount: 9 } }), 'custom')).toMatchObject({ base: 'deep', custom: { subCount: 9 } });
  });

  it('editing a sub length or count makes the target Custom from its preset and keeps a number already set', () => {
    const a = withNumber(ref({ preset: 'deep' }), 'subSeconds', 90);
    expect(a).toEqual({ id: 'm31', preset: 'custom', base: 'deep', custom: { subSeconds: 90 } });
    expect(withNumber(a, 'subCount', 12)).toMatchObject({ preset: 'custom', base: 'deep', custom: { subSeconds: 90, subCount: 12 } });
  });

  it('every stored shape passes the plan validator, and a bad base or favorite flag does not', () => {
    const plan = (t: object) => ({ version: PLANS_VERSION, openId: 'p', plans: [{ id: 'p', name: 'P', createdAt: '2026-12-01T00:00:00Z', updatedAt: '2026-12-01T00:00:00Z', date: '2026-12-15', siteId: 's', trainId: 't', startTime: null, targets: [t], notes: '' }] });
    expect(() => validatePlans(plan(withNumber(ref(), 'subSeconds', 90)))).not.toThrow();
    expect(() => validatePlans(plan({ ...ref(), favorite: 'ask' }))).not.toThrow();
    expect(() => validatePlans(plan({ ...ref({ preset: 'custom' }), base: 'ultra' }))).toThrow(/base/);
    expect(() => validatePlans(plan({ ...ref(), favorite: 'maybe' }))).toThrow(/favorite/);
    expect(() => validatePlans(plan({ ...ref({ preset: 'custom' }), custom: { subSeconds: -1 } }))).toThrow(/above 0/);
  });
});

describe('words', () => {
  const result = (mode: 'balanced' | 'deep', custom: boolean, fields: ('subSeconds' | 'subCount' | 'totalMin')[]) =>
    ({ mode, custom, differs: fields.map((field) => ({ field, preset: 1, chosen: 2 })) }) as unknown as ExposureResult;

  it('says Custom', () => {
    expect(differsText()).toBe('Custom');
  });

  it('splits the act-on codes from the notes', () => {
    const w = (code: string, severity: 'warning' | 'note' = 'note'): ExposureWarning => ({ code: code as ExposureWarning['code'], severity, text: code });
    const { act, notes } = splitWarnings([w('moon-near'), w('meridian-flip'), w('count-capped')]);
    expect(act.map((x) => x.code)).toEqual(['moon-near', 'meridian-flip']);
    expect(notes.map((x) => x.code)).toEqual(['count-capped']);
  });

  it('formats minutes', () => {
    expect([minutesText(45), minutesText(60), minutesText(80), minutesText(125)]).toEqual(['45 min', '1 h', '1 h 20 min', '2 h 5 min']);
  });
});

describe('the broadband line of the filter mix', () => {
  const lp: ProfileFilter = { id: 'lp', name: 'LPS-P2', kind: 'broadband-LP', passbandWidthNm: 120, blocksUvIr: true };
  const slotWith = (filter: ProfileFilter | null): SlotInput =>
    ({
      item: {},
      name: 'Rosette',
      source: { kind: 'fixed', raHours: 6.5, decDeg: 5 },
      exposureTarget: { id: 'rosette', type: 'nebula', surfaceBrightness: 'low' },
      trainName: 'C11 f/10',
      filterName: filter?.name ?? 'No filter',
      optics: { focalRatio: 10, imageScale: 0.5 },
      camera: { id: 'c', name: 'ASI533MC', pixelSizeUm: 3.76, colour: true, hasUvIrCut: true, readNoiseClass: 'low' },
      filter,
    }) as unknown as SlotInput;
  const entry = {
    windows: [{ start: new Date('2026-12-15T04:00:00Z'), end: new Date('2026-12-15T11:00:00Z') }],
    usableMinutes: 420,
    moonIllumination: 0,
    moonSeparation: 90,
    moonUp: false,
  } as unknown as PlanEntry;
  const site = { latitude: 33.5, longitude: -112, elevationM: 330 } as never;
  const subSeconds = (s: string | undefined) => Number(/Subs: ([\d.]+) s x/.exec(s ?? '')?.[1]);

  const view = (filter: ProfileFilter | null) => {
    const v = rowExposure({ id: 'rosette', preset: 'balanced' }, slotWith(filter), entry, site, 7);
    if (v.kind !== 'ok') throw new Error(`row exposure is ${v.kind}`);
    return v;
  };

  it('uses the train\'s filter: its sub length equals the row\'s own for the same minutes', () => {
    const v = view(lp);
    const line = v.forFilter(null, v.chosen.integrationMin);
    expect(subSeconds(line?.subs)).toBe(v.chosen.subSeconds);
  });

  it('with no filter in the train it stays at no filter, and still equals the row\'s own', () => {
    const v = view(null);
    const line = v.forFilter(null, v.chosen.integrationMin);
    expect(subSeconds(line?.subs)).toBe(v.chosen.subSeconds);
    expect(line?.warning).toBeNull();
  });
});
