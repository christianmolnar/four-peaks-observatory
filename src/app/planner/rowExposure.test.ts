import { checkNumber, choiceOf, differsText, exposureSummary, minutesText, splitWarnings, withNumber, withPreset } from './rowExposure';
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
      for (const text of ['0', '00', '0.0', '-5', '-0.5']) expect(checkNumber(field, text)).toMatchObject({ ok: false, message: expect.stringMatching(/must be above 0/) });
      for (const text of ['abc', '1e3', '12x', '1,5', 'NaN', 'Infinity', '--1']) expect(checkNumber(field, text).ok).toBe(false);
      expect(checkNumber(field, '')).toMatchObject({ ok: false, message: expect.stringMatching(/^Enter a /) });
    }
    expect(checkNumber('subSeconds', '3601')).toMatchObject({ ok: false, message: expect.stringMatching(/too long for one sub/) });
    expect(checkNumber('subSeconds', '3600').ok).toBe(true);
    expect(checkNumber('subCount', '5001')).toMatchObject({ ok: false, message: expect.stringMatching(/too many/) });
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

  it('says in words how Custom differs from its preset', () => {
    expect(differsText(result('balanced', true, ['subSeconds']))).toBe('Custom: differs from Balanced in sub length.');
    expect(differsText(result('deep', true, ['subSeconds', 'subCount']))).toBe('Custom: differs from Deep in sub length and number of subs.');
    expect(differsText(result('balanced', true, ['subSeconds', 'subCount', 'totalMin']))).toBe('Custom: differs from Balanced in sub length, number of subs and total light.');
    expect(differsText(result('balanced', false, []))).toBe('Custom: same as Balanced so far.');
  });

  it('splits the nine act-on codes from the notes', () => {
    const w = (code: string, severity: 'warning' | 'note' = 'note'): ExposureWarning => ({ code: code as ExposureWarning['code'], severity, text: code });
    const { act, notes } = splitWarnings([w('moon-near'), w('inputs-assumed'), w('target-ou4', 'warning'), w('sampling'), w('short-of-target', 'warning')]);
    expect(act.map((x) => x.code)).toEqual(['moon-near', 'target-ou4']);
    expect(notes.map((x) => x.code)).toEqual(['inputs-assumed', 'sampling', 'short-of-target']);
  });

  it('formats minutes and a saved exposure', () => {
    expect([minutesText(45), minutesText(60), minutesText(80), minutesText(125)]).toEqual(['45 min', '1 h', '1 h 20 min', '2 h 5 min']);
    expect(exposureSummary({ preset: 'deep', subSeconds: 120, subCount: 30 })).toBe('Deep, 120 s × 30 (1 h)');
    expect(exposureSummary({ preset: 'custom', base: 'quick', subSeconds: 90, subCount: 20 })).toBe('Custom (from Quick), 90 s × 20 (30 min)');
  });
});
