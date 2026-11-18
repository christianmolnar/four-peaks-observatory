import { mixSummary } from './index';
import { narrowbandHours } from './narrowband-hours';
import type { NbFilterInput } from './narrowband-hours';
import { narrowbandMix, rowMix } from './row';

const NBZ: NbFilterInput = { id: 'nbz', name: 'NBZ II', bands: [{ centreNm: 656.3, widthNm: 10 }, { centreNm: 500.7, widthNm: 8 }] };
const NB3: NbFilterInput = { id: 'nb3', name: 'NB3-PM', bands: [{ centreNm: 500.7, widthNm: 21 }, { centreNm: 672.4, widthNm: 19 }] };
const rosette = { lines: { Ha: 1, OIII: 0.4, SII: 0.15, NII: 0.2 }, continuum: 0.1, source: 't', confidence: 'type-default' as const };
const result = narrowbandHours({ profile: rosette, surfaceBrightnessMu: 22, broadbandHours: 2, bortle: 6, train: { fRatio: 1.9, pixelUm: 3.76, focalLengthMm: 560 }, readNoiseE: 1, knee: 'balanced', filters: [NBZ, NB3] });

describe('the mix with ticked narrowband', () => {
  it('is the broadband time plus each ticked filter, and drops an unticked one', () => {
    const both = narrowbandMix({ result, ticked: new Set(['nbz', 'nb3']), broadbandMin: 120 });
    expect(both?.availableMin).toBe(120 + 135 + 135);
    expect(both?.narrowbandAdded).toBe(true);
    expect(both?.lines.map((l) => [l.name, l.minutes])).toEqual([['Broadband (no narrowband filter)', 120], ['NBZ II', 135], ['NB3-PM', 135]]);
    const one = narrowbandMix({ result, ticked: new Set(['nbz']), broadbandMin: 120 });
    expect(one?.availableMin).toBe(120 + 135);
    expect(one?.lines.map((l) => l.name)).toEqual(['Broadband (no narrowband filter)', 'NBZ II']);
  });
  it('is null when nothing with minutes is ticked, so the usual mix stands', () => {
    expect(narrowbandMix({ result, ticked: new Set(), broadbandMin: 120 })).toBeNull();
    expect(narrowbandMix({ result, ticked: new Set(['missing']), broadbandMin: 120 })).toBeNull();
  });
  it('reads in the plan text the same as any mix', () => {
    const m = narrowbandMix({ result, ticked: new Set(['nbz']), broadbandMin: 120 });
    expect(mixSummary('Rosette', m as NonNullable<typeof m>, (n) => `${n} min`)).toMatch(/Rosette \(255 min of light\): Broadband \(no narrowband filter\) 120 min; NBZ II 135 min \(adds Ha and OIII\)/);
  });
  it('rowMix returns it for a catalog nebula, and the old mix when nothing is ticked', () => {
    const base = { body: false, target: { id: 'ngc2237', type: 'nebula' }, light: { kind: 'ok' as const, minutes: 120, usableMinutes: 300 }, filters: [{ id: 'nbz', name: 'NBZ II', bands: NBZ.bands }], noFilters: 'none' };
    const without = rowMix(base);
    const withNone = rowMix({ ...base, narrowband: { result, ticked: new Set(), broadbandMin: 120 } });
    expect(withNone).toEqual(without);
    const added = rowMix({ ...base, narrowband: { result, ticked: new Set(['nbz']), broadbandMin: 120 } });
    expect(added.kind === 'mix' && added.narrowbandAdded).toBe(true);
    // Even with no filter in the setup, a ticked gear filter makes a mix.
    const noSetup = rowMix({ ...base, filters: [], narrowband: { result, ticked: new Set(['nbz']), broadbandMin: 120 } });
    expect(noSetup.kind).toBe('mix');
  });
  it('rowMix keeps its own messages for a body, an unknown target and no light', () => {
    const nb = { result, ticked: new Set(['nbz']), broadbandMin: 120 };
    expect(rowMix({ body: true, target: null, light: { kind: 'none', reason: '' }, filters: [], noFilters: '', narrowband: nb }).kind).toBe('message');
    expect(rowMix({ body: false, target: null, light: { kind: 'ok', minutes: 60, usableMinutes: 60 }, filters: [], noFilters: '', narrowband: nb }).kind).toBe('message');
    expect(rowMix({ body: false, target: { id: 'ngc2237', type: 'nebula' }, light: { kind: 'ok', minutes: 60, usableMinutes: 0 }, filters: [], noFilters: '', narrowband: nb }).kind).toBe('message');
  });
});
