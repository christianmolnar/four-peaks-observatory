import { filterSub } from './subs';
import type { FilterSub } from './subs';
import { narrowbandHours } from './narrowband-hours';
import type { NbFilterInput, NbResult } from './narrowband-hours';
import { narrowbandMix } from './row';
import { bandwidthOf, exposureFor } from '../exposure';
import type { ExposureRig, ExposureTarget } from '../exposure';
import type { ProfileCamera, ProfileFilter } from '../profile';

const PIN = { f7none: 30, f7nbz: 300, f19none: 15, f19nbz: 45 };
const NBZ: NbFilterInput = { id: 'nbz', name: 'NBZ II', bands: [{ centreNm: 656.3, widthNm: 10 }, { centreNm: 500.7, widthNm: 8 }] };
const NB3: NbFilterInput = { id: 'nb3', name: 'NB3-PM', bands: [{ centreNm: 500.7, widthNm: 21 }, { centreNm: 672.4, widthNm: 19 }] };
const HA7: NbFilterInput = { id: 'ha7', name: 'Ha 7 nm', bands: [{ centreNm: 656.3, widthNm: 7 }] };
const LEX: NbFilterInput = { id: 'lex', name: 'L-eXtreme', bands: [{ centreNm: 656.3, widthNm: 7 }, { centreNm: 500.7, widthNm: 7 }] };
const ROSETTE = { lines: { Ha: 1, OIII: 0.4, SII: 0.15, NII: 0.2 }, continuum: 0.1, source: 't', confidence: 'type-default' as const };
const nebula: ExposureTarget = { id: 'ngc2237', name: 'Rosette', type: 'nebula', surfaceBrightnessMu: 22 };
const camera: ProfileCamera = { id: 'cam', name: 'Cam', pixelSizeUm: 3.76, readNoiseClass: 'low' };
const night = { moonIllumination: 0, moonSeparationDeg: 90, moonUp: false };
const asFilter = (f: NbFilterInput): ProfileFilter => ({ id: f.id, name: f.name, passbands: [...(f.bands ?? [])], passbandWidthNm: (f.bands ?? []).reduce((t, b) => t + b.widthNm, 0), kind: 'narrowband', blocksUvIr: true });
const rigAt = (focalRatio: number, cam: ProfileCamera = camera): ExposureRig => ({ train: { focalRatio, imageScale: (206.265 * 3.76) / (focalRatio * 280) }, camera: cam, filter: null });
const ok = (s: FilterSub) => {
  if (s.kind !== 'ok') throw new Error(s.text);
  return s;
};
const run = (f: ProfileFilter | null, focalRatio: number, bortle: number, minutes = 120) => ok(filterSub({ target: nebula, rig: rigAt(focalRatio), filter: f, bortle, night, preset: 'balanced', minutes }));

describe('a sub length for each filter, from the filter’s own bandwidth', () => {
  const nbz = asFilter(NBZ);
  it('NBZ II (18 nm) and no filter (full band) give different subs where their sky rates differ: pinned at f/7 and at f/1.9, Bortle 6', () => {
    const f7 = { none: run(null, 7, 6), nbz: run(nbz, 7, 6) };
    const f19 = { none: run(null, 1.9, 6), nbz: run(nbz, 1.9, 6) };
    expect(f7.none.subSeconds).not.toBe(f7.nbz.subSeconds);
    expect(f19.none.subSeconds).not.toBe(f19.nbz.subSeconds);
    expect([f7.none.subSeconds, f7.nbz.subSeconds, f19.none.subSeconds, f19.nbz.subSeconds]).toEqual([PIN.f7none, PIN.f7nbz, PIN.f19none, PIN.f19nbz]);
  });
  it('is the engine’s sub for that filter, and the count is the minutes over the sub rounded up as the engine does', () => {
    const r = run(nbz, 7, 6, 135);
    const engine = exposureFor(nebula, { ...rigAt(7), filter: nbz }, { bortle: 6 }, { ...night, usableMinutes: 5000, acquisitionStart: null, transitTime: null }, { preset: 'balanced', overrides: { totalMin: 135 } });
    if (!engine.ok) throw new Error('engine');
    expect(r.subSeconds).toBe(engine.subSeconds);
    expect(r.subCount).toBe(Math.ceil((135 * 60) / r.subSeconds - 1e-9));
    expect(bandwidthOf(nbz).nm).toBe(18);
  });
  it('a total longer than one night is not cut to the night', () => {
    const r = run(nbz, 7, 6, 900);
    expect(r.subCount * r.subSeconds).toBeGreaterThanOrEqual(900 * 60);
    expect(r.minutes).toBe(900);
  });
  it('names the read noise class it assumed, in the engine’s words, and gives no assumption when it is set', () => {
    const none = ok(filterSub({ target: nebula, rig: rigAt(7, { id: 'c', name: 'C', pixelSizeUm: 3.76 }), filter: nbz, bortle: 6, night, preset: 'balanced', minutes: 120 }));
    expect(none.assumed.join(' ')).toMatch(/read noise \(assumed medium\)/);
    expect(run(nbz, 7, 6).assumed).toEqual([]);
  });
  it('missing pixel size or focal ratio gives the words, never a number', () => {
    const noPixel = filterSub({ target: nebula, rig: rigAt(7, { id: 'c', name: 'C' }), filter: nbz, bortle: 6, night, preset: 'balanced', minutes: 120 });
    expect(noPixel).toEqual({ kind: 'missing', text: 'not worked out: the pixel size is not set' });
    const noRatio = filterSub({ target: nebula, rig: { train: {}, camera, filter: null }, filter: nbz, bortle: 6, night, preset: 'balanced', minutes: 120 });
    expect(noRatio.kind).toBe('missing');
    expect(noRatio.kind === 'missing' && noRatio.text).toMatch(/focal ratio/);
  });
});

describe('the row’s minutes are the plan’s minutes, in every order of four filters', () => {
  const permutations = <T,>(xs: T[]): T[][] => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  const f7 = { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1960 };
  const resultFor = (order: NbFilterInput[]): NbResult => narrowbandHours({ profile: ROSETTE, surfaceBrightnessMu: 22, broadbandHours: 2, bortle: 4, train: f7, readNoiseE: 1, knee: 'balanced', filters: order });
  it('Rosette f/7 Bortle 4: 24 orders, the line totals equal the plan’s 120 + 265 minutes and nothing changes', () => {
    const all = FILTERS_BY_ID;
    const orders = permutations([NBZ, NB3, HA7, LEX]);
    expect(orders).toHaveLength(24);
    const lines = (order: NbFilterInput[]) => {
      const mix = narrowbandMix({ result: resultFor(order), ticked: new Set(order.map((f) => f.id)), broadbandMin: 120 });
      if (mix === null) throw new Error('no mix');
      return mix.lines.map((l) => {
        const filter = l.filterId === null ? null : all[l.filterId];
        const s = ok(filterSub({ target: nebula, rig: rigAt(7), filter, bortle: 4, night, preset: 'balanced', minutes: l.minutes }));
        expect(s.minutes).toBe(l.minutes);
        return [l.filterId, l.minutes, s.subSeconds, s.subCount];
      });
    };
    const want = lines(orders[0]).sort();
    for (const order of orders) {
      const got = lines(order).sort();
      expect(got).toEqual(want);
      expect(got.reduce((t, l) => t + (l[1] as number), 0)).toBe(120 + 265);
    }
  });
});
const FILTERS_BY_ID: Record<string, ProfileFilter> = Object.fromEntries([NBZ, NB3, HA7, LEX].map((f) => [f.id, asFilter(f)]));
