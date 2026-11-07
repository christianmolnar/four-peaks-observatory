import sample from '../data/sample-profile.json';
import { opticalTrain } from '../optics';
import { resolveTrain, validateProfile } from '../profile';
import type { ProfileFilter } from '../profile';
import {
  ESTIMATE,
  MODE_ORDER,
  NO_STOP_TIME_NOTE,
  SNR_ASSUMPTION,
  bandwidthOf,
  beamHalfAngleDeg,
  edgeShiftNm,
  filterWarnings,
  isOu4,
  marginalBenefit,
  moonFactor,
  overheadFor,
  planExposure,
  shortSessionPriority,
  skyLimitedSeconds,
  skyRate,
  snapSub,
  surfaceBrightnessOf,
} from './index';
import type { ExposureInput, ExposureReport, ModeEstimate } from './index';

const profile = validateProfile(sample);
const filter = (id: string): ProfileFilter => profile.equipment.filters.find((f) => f.id === id)!;
const camera = (id: string) => profile.equipment.cameras.find((c) => c.id === id)!;
const duo = camera('asi2600mc-duo');
const c533 = camera('asi533mc');
const hyperstar = opticalTrain(...(() => { const r = resolveTrain(profile, profile.trains.find((t) => t.id === 'wide-c11-hyperstar-2600')!); return [r.scope, r.camera, r.accessory] as const; })());
const codes = (ws: { code: string }[]) => ws.map((w) => w.code);

const START = new Date('2026-12-05T04:00:00Z');
const base = (over: Partial<ExposureInput> = {}): ExposureInput => ({
  target: { id: 'x', name: 'Test nebula', type: 'nebula' },
  train: { focalRatio: 1.93, imageScale: 1.4 },
  camera: duo,
  filter: filter('astronomik-cls-ccd'),
  sky: { bortle: 6, moonIllumination: 0, moonSeparationDeg: 90, moonUp: false },
  usableMinutes: 400,
  acquisitionStart: START,
  transitTime: null,
  ...over,
});
const ok = (r: ExposureReport) => {
  if (!r.ok) throw new Error(`not ok: ${r.missing}`);
  return r;
};
const plan = (over: Partial<ExposureInput> = {}) => ok(planExposure(base(over)));

describe('edge shift of a passband in a fast beam', () => {
  it('f/1.9 shifts Ha about 5.3 nm and OIII about 4.1 nm (values checked with Python math)', () => {
    expect(edgeShiftNm(1.9, 656.3)).toBeCloseTo(5.3, 1);
    expect(edgeShiftNm(1.9, 500.7)).toBeCloseTo(4.1, 1);
    // python3: th=atan(1/(2*1.9)); l*(1-sqrt(1-(sin(th)/2.0)**2))
    expect(edgeShiftNm(1.9, 656.3)).toBeCloseTo(5.334993384, 6);
    expect(edgeShiftNm(1.9, 500.7)).toBeCloseTo(4.070137418, 6);
  });
  it('reproduces the one vendor figure it is fitted to (Antlia: 2.2 nm at f/2.6, OIII)', () => {
    expect(edgeShiftNm(2.6, 500.7)).toBeCloseTo(2.2, 1);
  });
  it('shrinks with slower beams and grows with wavelength', () => {
    expect(edgeShiftNm(7, 656.3)).toBeCloseTo(0.42, 2);
    expect(edgeShiftNm(10, 656.3)).toBeCloseTo(0.20, 2);
    expect(edgeShiftNm(1.9, 656.3)).toBeGreaterThan(edgeShiftNm(2.8, 656.3));
    expect(edgeShiftNm(4, 656.3)).toBeGreaterThan(edgeShiftNm(4, 500.7));
  });
  it('beam half-angle at f/1.9 is 14.7 degrees', () => {
    expect(beamHalfAngleDeg(1.9)).toBeCloseTo(14.7, 1);
  });
  it('rejects a focal ratio that is not a positive number', () => {
    expect(() => edgeShiftNm(0, 656.3)).toThrow(RangeError);
    expect(() => edgeShiftNm(-2, 656.3)).toThrow(RangeError);
    expect(() => edgeShiftNm(NaN, 656.3)).toThrow(RangeError);
    expect(() => edgeShiftNm(Infinity, 656.3)).toThrow(RangeError);
  });
});

describe('filter warnings', () => {
  const N = hyperstar.focalRatio as number;
  it('the HyperStar train is f/1.93', () => {
    expect(N).toBeCloseTo(540 / 279.4, 6);
  });

  it('L-eXtreme (standard) at the HyperStar f-ratio raises the rated-slower warning, calculated', () => {
    const w = filterWarnings(N, filter('optolong-lextreme'), duo);
    expect(codes(w)).toEqual(['filter-rated-slower']);
    expect(w[0].text).toMatch(/no published f-ratio rating/);
    // the sample HyperStar train is f/1.93, a little slower than the f/1.9 figures above
    expect(w[0].text).toMatch(/about 5\.2 nm at Ha and 3\.9 nm at OIII/);
    expect(w[0].severity).toBe('warning');
  });
  it('the CLS CCD at the HyperStar f-ratio raises neither the rating nor the IR warning, on either camera', () => {
    expect(filterWarnings(N, filter('astronomik-cls-ccd'), duo)).toEqual([]);
    expect(filterWarnings(N, filter('astronomik-cls-ccd'), c533)).toEqual([]);
  });
  it('the L-eXtreme is fine at f/7 and f/10', () => {
    expect(codes(filterWarnings(7, filter('optolong-lextreme'), duo))).toEqual([]);
    expect(codes(filterWarnings(10, filter('optolong-lextreme'), duo))).toEqual([]);
  });
  it('the Optolong Ha 7 nm, the same shift against a 7 nm band, is flagged at f/1.9', () => {
    expect(codes(filterWarnings(1.9, filter('optolong-ha-7nm'), duo))).toEqual(['filter-rated-slower']);
  });
  it('the Duo-Band is flagged by its published 8 degree limit, not by the calculation', () => {
    const w = filterWarnings(N, filter('zwo-duo-band'), duo);
    expect(codes(w)).toEqual(['filter-rated-slower']);
    expect(w[0].text).toMatch(/up to 8 degrees \(published\)/);
    // Its 15 nm band would pass the calculated rule at this speed (5.3 < 7.5): the published limit decides.
    expect(edgeShiftNm(N, 656.3)).toBeLessThan(15 * 0.5);
    expect(filterWarnings(3.7, filter('zwo-duo-band'), duo)).toEqual([]); // 3.7 -> 7.7 degrees, inside 8
  });
  it('a published f-ratio rating decides: slower than the train warns, equal does not', () => {
    const f: ProfileFilter = { id: 'x', name: 'Rated 3', ratedMinFRatio: 3, narrowestBandNm: 100 };
    const w = filterWarnings(1.9, f, duo);
    expect(codes(w)).toEqual(['filter-rated-slower']);
    expect(w[0].text).toMatch(/rated for f\/3 and slower \(published\)/);
    expect(filterWarnings(3, f, duo)).toEqual([]);
    expect(filterWarnings(5, f, duo)).toEqual([]);
  });
  it('a satisfied published rating is not second-guessed by the calculation', () => {
    const f: ProfileFilter = { id: 'x', name: 'Rated 1.8 but narrow', ratedMinFRatio: 1.8, narrowestBandNm: 3 };
    expect(filterWarnings(1.9, f, duo)).toEqual([]);
  });
  it('without a rating, a band width or an angle limit, nothing is guessed', () => {
    expect(filterWarnings(1.9, { id: 'x', name: 'Mystery' }, duo)).toEqual([]);
    expect(filterWarnings(1.9, filter('idas-lps-p2'), duo)).toEqual([]);
  });

  it('ASI533MC with a filter that lacks UV/IR cut raises the IR warning', () => {
    const w = filterWarnings(7, filter('idas-lps-p2'), c533); // blocksUvIr unknown
    expect(codes(w)).toEqual(['filter-uvir-missing']);
    expect(w[0].text).toMatch(/not known that IDAS LPS-P2 blocks UV\/IR/);
    const explicit = filterWarnings(7, { id: 'x', name: 'Plain', blocksUvIr: false }, c533);
    expect(explicit[0].text).toMatch(/does not block UV\/IR/);
  });
  it('ASI533MC with a filter that blocks UV/IR gets no IR warning', () => {
    for (const id of ['astronomik-cls-ccd', 'idas-lps-p3', 'baader-uvir-cut', 'optolong-lextreme']) {
      expect(codes(filterWarnings(7, filter(id), c533))).not.toContain('filter-uvir-missing');
    }
  });
  it('ASI533MC with no filter raises the IR warning; cameras with a UV/IR window never do', () => {
    expect(codes(filterWarnings(7, null, c533))).toEqual(['filter-uvir-missing']);
    expect(filterWarnings(7, null, duo)).toEqual([]);
    expect(filterWarnings(7, filter('idas-lps-p2'), duo)).toEqual([]);
    expect(filterWarnings(7, filter('idas-lps-p2'), { colour: true })).toEqual([]); // window unknown: no claim
  });

  it('a visual-first filter on a colour camera is warned about', () => {
    for (const id of ['apertura-moon-skyglow', 'orion-skyglow-ultrablock', 'baader-neodymium']) {
      expect(codes(filterWarnings(10, filter(id), duo))).toContain('filter-visual-colour');
    }
    expect(codes(filterWarnings(10, filter('apertura-moon-skyglow'), { colour: false }))).toEqual([]);
    expect(codes(filterWarnings(10, filter('apertura-moon-skyglow'), {}))).toEqual([]);
    expect(codes(filterWarnings(10, filter('orion-sky-glow'), duo))).toEqual([]); // kind unknown
  });

  it('can raise several at once, each with its own code', () => {
    const w = filterWarnings(1.9, { id: 'v', name: 'Visual UHC', kind: 'visual-only', narrowestBandNm: 7 }, c533);
    expect(codes(w).sort()).toEqual(['filter-rated-slower', 'filter-uvir-missing', 'filter-visual-colour']);
  });
});

describe('sub length', () => {
  it('moon factor: 1 when down; 1 + 3 x lit x closeness when up', () => {
    expect(moonFactor({ moonUp: false, moonIllumination: 1, moonSeparationDeg: 0 })).toBe(1);
    expect(moonFactor({ moonUp: true, moonIllumination: 1, moonSeparationDeg: 0 })).toBe(4);
    expect(moonFactor({ moonUp: true, moonIllumination: 0.5, moonSeparationDeg: 45 })).toBeCloseTo(1 + 3 * 0.5 * 0.5, 10);
    expect(moonFactor({ moonUp: true, moonIllumination: 1, moonSeparationDeg: 90 })).toBe(1);
    expect(moonFactor({ moonUp: true, moonIllumination: 1, moonSeparationDeg: 170 })).toBe(1);
  });
  it('sky rate: the reference point gives the reference rate; it follows pixel area, 1/N^2, bandwidth and magnitudes', () => {
    const sky = { bortle: 5, moonIllumination: 0, moonSeparationDeg: 90, moonUp: false };
    const ref = { pixelUm: 3.76, fRatio: 5, bandwidthNm: 300, sky };
    expect(skyRate(ref)).toBeCloseTo(0.25, 10);
    expect(skyRate({ ...ref, pixelUm: 7.52 })).toBeCloseTo(1, 10);
    expect(skyRate({ ...ref, fRatio: 2.5 })).toBeCloseTo(1, 10);
    expect(skyRate({ ...ref, bandwidthNm: 150 })).toBeCloseTo(0.125, 10);
    expect(skyRate({ ...ref, sky: { ...sky, bortle: 6 } })).toBeCloseTo(0.25 * 10 ** (0.4 * 0.9), 10);
  });
  it('sky-limited seconds is 20 x read noise squared over the rate', () => {
    expect(skyLimitedSeconds(1.2, 0.25)).toBeCloseTo(115.2, 10);
  });
  it('snapSub clamps to 10..300 s and snaps to the nearest step on a log scale', () => {
    expect(snapSub(1)).toBe(10);
    expect(snapSub(5000)).toBe(300);
    expect(snapSub(18.7)).toBe(20);
    expect(snapSub(24)).toBe(20); // 24/20 = 1.2 < 30/24 = 1.25
    expect(snapSub(25)).toBe(30);
    expect(snapSub(60)).toBe(60);
    expect(snapSub(100)).toBe(90); // 100/90 = 1.11 < 120/100 = 1.2
  });
  it('bandwidth: none is 300 nm; a stated width is used; a kind default or an unknown kind is flagged assumed', () => {
    expect(bandwidthOf(null)).toEqual({ nm: 300, assumed: false });
    expect(bandwidthOf(filter('astronomik-cls-ccd'))).toEqual({ nm: 120, assumed: false });
    expect(bandwidthOf({ id: 'x', name: 'x', kind: 'dual-band' })).toEqual({ nm: 50, assumed: true });
    expect(bandwidthOf({ id: 'x', name: 'x' })).toEqual({ nm: 150, assumed: true });
  });
  it('a narrower filter or a darker sky means longer subs; a brighter pixel or faster beam, shorter', () => {
    const sub = (over: Partial<ExposureInput>) => plan(over).modes.balanced.subSeconds;
    expect(sub({ filter: filter('optolong-lextreme') })).toBeGreaterThan(sub({ filter: filter('astronomik-cls-ccd') }));
    expect(sub({ sky: { bortle: 3, moonIllumination: 0, moonSeparationDeg: 90, moonUp: false } })).toBeGreaterThan(
      sub({ sky: { bortle: 8, moonIllumination: 0, moonSeparationDeg: 90, moonUp: false } }),
    );
    expect(sub({ train: { focalRatio: 7 } })).toBeGreaterThan(sub({ train: { focalRatio: 1.9 } }));
    expect(sub({ camera: { ...duo, pixelSizeUm: 2 } })).toBeGreaterThan(sub({ camera: { ...duo, pixelSizeUm: 6 } }));
  });
  it('a lit Moon near the target shortens the subs', () => {
    const dark = plan().modes.deep.subSeconds;
    const moon = plan({ sky: { bortle: 6, moonIllumination: 1, moonSeparationDeg: 10, moonUp: true } }).modes.deep.subSeconds;
    expect(moon).toBeLessThan(dark);
  });
});

describe('overhead', () => {
  it('60 s subs: setup 30, a dither every 3 frames at 10 s, autofocus per hour at 3 min', () => {
    const o = overheadFor(60, 90, false); // 90 min of light
    expect(o).toEqual({ setupMin: 30, ditherMin: 5, autofocusMin: 3, meridianFlipMin: 0, totalMin: 38 });
  });
  it('a meridian flip adds 10 minutes', () => {
    expect(overheadFor(60, 90, true)).toEqual({ setupMin: 30, ditherMin: 5, autofocusMin: 3, meridianFlipMin: 10, totalMin: 48 });
  });
  it('short subs dither no more often than every 2 minutes; very long subs every 3 frames', () => {
    expect(overheadFor(10, 100, false).ditherMin).toBe(1.3); // every 12 frames: 8 dithers x 10 s
    expect(overheadFor(300, 9, false).ditherMin).toBe(0.5); // every 3 frames: 3 dithers
  });
  it('under an hour of light there is no autofocus run; each full hour adds one', () => {
    expect(overheadFor(60, 59, false).autofocusMin).toBe(0);
    expect(overheadFor(60, 60, false).autofocusMin).toBe(3);
    expect(overheadFor(60, 180, false).autofocusMin).toBe(9);
  });
  it('no frames means setup only', () => {
    expect(overheadFor(60, 0, false)).toEqual({ setupMin: 30, ditherMin: 0, autofocusMin: 0, meridianFlipMin: 0, totalMin: 30 });
  });
});

describe('marginal benefit', () => {
  const rows = marginalBenefit(400);
  it('is 30, 60, 90 and 120 minutes', () => {
    expect(rows.map((r) => r.minutes)).toEqual([30, 60, 90, 120]);
  });
  it('120 minutes is 4 times the time and 2 times the SNR of 30 minutes (sqrt, not linear)', () => {
    expect(rows[3].minutes / rows[0].minutes).toBe(4);
    expect(rows[3].relativeSnr / rows[0].relativeSnr).toBeCloseTo(2, 10);
    expect(rows.map((r) => r.relativeSnr)).toEqual([1, Math.SQRT2, Math.sqrt(3), 2]);
    expect(rows[3].relativeSnr).toBeLessThan(2.0000001);
  });
  it('each step adds less than the one before', () => {
    const g = rows.map((r) => r.gainPercent);
    expect(g[0]).toBeNull();
    expect(g[1]).toBeCloseTo(41.42, 1);
    expect(g[2]).toBeCloseTo(22.47, 1);
    expect(g[3]).toBeCloseTo(15.47, 1);
  });
  it('carries a range below the ideal value (none for the 30 minute baseline) and the estimate label', () => {
    expect(rows[0].relativeSnrRange).toEqual([1, 1]);
    for (const r of rows.slice(1)) {
      expect(r.relativeSnrRange[0]).toBeLessThan(r.relativeSnr);
      expect(r.relativeSnrRange[0]).toBeGreaterThan(1);
      expect(r.relativeSnrRange[1]).toBe(r.relativeSnr);
    }
    expect(rows[3].relativeSnrRange[0]).toBeCloseTo(1.7, 10);
    for (const r of rows) expect(r.label).toBe('estimate');
  });
  it('marks the rows tonight cannot reach', () => {
    expect(marginalBenefit(75).map((r) => r.availableTonight)).toEqual([true, true, false, false]);
    expect(marginalBenefit(120).map((r) => r.availableTonight)).toEqual([true, true, true, true]);
    expect(marginalBenefit(0).map((r) => r.availableTonight)).toEqual([false, false, false, false]);
  });
  it('states its assumption and refuses a universal stop time', () => {
    expect(SNR_ASSUMPTION).toMatch(/square root/);
    expect(SNR_ASSUMPTION).toMatch(/4 times the time gives 2 times/);
    expect(NO_STOP_TIME_NOTE).toMatch(/no universal best stop time/);
  });
});

describe('planExposure with fixed inputs', () => {
  // CLS CCD on the Duo at f/1.93, Bortle 6, no Moon, 400 usable minutes. By hand:
  // rate = 0.25 * (5/1.93)^2 * (120/300) * 10^(0.4*0.9) = 1.5376 e/px/s; floor = 20 * 1.2^2 / 1.5376 = 18.7 s.
  const r = plan();
  const { quick, balanced, deep } = r.modes;

  it('matches the hand calculation', () => {
    expect(r.skyElectronsPerPxS).toBeCloseTo(1.5376, 3);
    expect(r.skyLimitedSeconds).toBeCloseTo(18.73, 2);
    expect(r.readNoiseE).toBe(1.2);
    expect(r.bandwidthNm).toBe(120);
  });
  it('quick: 20 s x 135 = 45 min, overhead 33.7, elapsed 78.7', () => {
    expect([quick.subSeconds, quick.subCount, quick.integrationMin]).toEqual([20, 135, 45]);
    expect(quick.overhead).toEqual({ setupMin: 30, ditherMin: 3.7, autofocusMin: 0, meridianFlipMin: 0, totalMin: 33.7 });
    expect(quick.elapsedMin).toBe(78.7);
    // imaging starts at the first usable minute and ends after the integration plus dithers
    expect(quick.finish!.getTime()).toBe(START.getTime() + 48.7 * 60000);
  });
  it('balanced: 30 s x 180 = 90 min; deep: 45 s x 240 = 180 min', () => {
    expect([balanced.subSeconds, balanced.subCount, balanced.integrationMin]).toEqual([30, 180, 90]);
    expect([deep.subSeconds, deep.subCount, deep.integrationMin]).toEqual([45, 240, 180]);
    expect(balanced.overhead.autofocusMin).toBe(3);
    expect(deep.overhead.autofocusMin).toBe(9);
  });
  it('changing mode changes subs, count, total, overhead and finish time', () => {
    for (const [a, b] of [[quick, balanced], [balanced, deep], [quick, deep]] as [ModeEstimate, ModeEstimate][]) {
      expect(a.subSeconds).not.toBe(b.subSeconds);
      expect(a.subCount).not.toBe(b.subCount);
      expect(a.integrationMin).not.toBe(b.integrationMin);
      expect(a.overhead.totalMin).not.toBe(b.overhead.totalMin);
      expect(a.elapsedMin).not.toBe(b.elapsedMin);
      expect(a.finish!.getTime()).not.toBe(b.finish!.getTime());
    }
  });
  it('the three modes land in the owner ranges: quick 30-60, balanced 60-120', () => {
    expect(quick.integrationMin).toBeGreaterThanOrEqual(30);
    expect(quick.integrationMin).toBeLessThanOrEqual(60);
    expect(balanced.integrationMin).toBeGreaterThanOrEqual(60);
    expect(balanced.integrationMin).toBeLessThanOrEqual(120);
    expect(quick.modeRangeMin).toEqual([30, 60]);
    expect(balanced.modeRangeMin).toEqual([60, 120]);
    expect(MODE_ORDER).toEqual(['quick', 'balanced', 'deep']);
  });
  it('subs times count is the integration, and elapsed is integration plus overhead', () => {
    for (const m of [quick, balanced, deep]) {
      expect(m.integrationMin).toBeCloseTo((m.subSeconds * m.subCount) / 60, 1);
      expect(m.elapsedMin).toBeCloseTo(m.integrationMin + m.overhead.totalMin, 1);
      expect(m.overhead.totalMin).toBeCloseTo(m.overhead.setupMin + m.overhead.ditherMin + m.overhead.autofocusMin + m.overhead.meridianFlipMin, 1);
    }
  });
  it('every output is labelled "estimate" and carries a range around its value', () => {
    expect(r.label).toBe(ESTIMATE);
    expect(ESTIMATE).toBe('estimate');
    for (const m of [quick, balanced, deep]) {
      expect(m.label).toBe('estimate');
      const inside = (v: number, [lo, hi]: readonly [number, number]) => {
        expect(lo).toBeLessThanOrEqual(v);
        expect(hi).toBeGreaterThanOrEqual(v);
        expect(lo).toBeLessThan(hi);
      };
      inside(m.subSeconds, m.subSecondsRange);
      inside(m.overhead.totalMin, m.overheadRangeMin);
      inside(m.elapsedMin, m.elapsedRangeMin);
      expect(m.usableIntegrationRangeMin[1]).toBe(m.integrationMin);
      expect(m.usableIntegrationRangeMin[0]).toBeLessThan(m.integrationMin);
      expect(m.finishRange![0].getTime()).toBeLessThan(m.finish!.getTime());
      expect(m.finishRange![1].getTime()).toBeGreaterThan(m.finish!.getTime());
    }
    for (const row of r.marginal) expect(row.label).toBe('estimate');
  });
  it('the sub-length range is wider when an input had to be assumed', () => {
    const known = quick.subSecondsRange;
    const assumed = plan({ camera: { pixelSizeUm: 3.76 } }).modes.quick;
    expect(known).toEqual([13, 30]); // 20 / 1.5, 20 * 1.5
    expect(assumed.subSecondsRange[1] / assumed.subSeconds).toBeCloseTo(2, 5);
    expect(codes(plan({ camera: { pixelSizeUm: 3.76 } }).warnings)).toContain('inputs-assumed');
    expect(codes(r.warnings)).not.toContain('inputs-assumed');
  });
  it('a filter without a stated width is assumed from its kind and says so', () => {
    const w = plan({ filter: filter('idas-lps-p2') }).warnings.find((x) => x.code === 'inputs-assumed')!;
    expect(w.text).toMatch(/passband width \(assumed 150 nm\)/);
  });
  it('without a start time no clock times are given', () => {
    const m = plan({ acquisitionStart: null }).modes.quick;
    expect(m.finish).toBeNull();
    expect(m.finishRange).toBeNull();
    expect(m.elapsedMin).toBe(78.7);
  });
  it('narrowband at a slow beam hits the 300 s cap and says so', () => {
    const m = plan({ train: { focalRatio: 10 }, filter: filter('optolong-lextreme') }).modes;
    expect(m.quick.subSeconds).toBe(300);
    expect(m.deep.subSeconds).toBe(300);
    expect(codes(m.quick.warnings)).toContain('sub-capped');
  });
});

describe('usable time limits the plan', () => {
  it('fits the session (light, dithers, autofocus) inside the usable minutes and says so', () => {
    const m = plan({ usableMinutes: 100 }).modes.deep;
    expect(m.integrationMin).toBeLessThan(180);
    expect(m.integrationMin + m.overhead.ditherMin + m.overhead.autofocusMin + m.overhead.meridianFlipMin).toBeLessThanOrEqual(100);
    expect(m.integrationMin + m.overhead.ditherMin + m.overhead.autofocusMin).toBeGreaterThan(100 - 1);
    expect(codes(m.warnings)).toContain('limited-by-usable-time');
  });
  it('a roomy night leaves the plan alone and adds no limit note', () => {
    expect(codes(plan({ usableMinutes: 1000 }).modes.deep.warnings)).not.toContain('limited-by-usable-time');
  });
  it('below the mode range, say so', () => {
    const m = plan({ usableMinutes: 20 }).modes.quick;
    expect(m.integrationMin).toBeLessThan(20);
    expect(codes(m.warnings)).toEqual(expect.arrayContaining(['limited-by-usable-time', 'below-mode-range']));
  });
  it('no usable time: zero frames, no finish, one clear warning, no range note', () => {
    const r0 = plan({ usableMinutes: 0 });
    for (const m of Object.values(r0.modes)) {
      expect(m.subCount).toBe(0);
      expect(m.integrationMin).toBe(0);
      expect(m.finish).toBeNull();
      expect(m.finishRange).toBeNull();
      expect(codes(m.warnings)).not.toContain('below-mode-range');
      expect(codes(m.warnings)).not.toContain('limited-by-usable-time');
    }
    expect(codes(r0.warnings)).toContain('no-usable-time');
    expect(r0.marginal.every((row) => !row.availableTonight)).toBe(true);
  });
});

describe('meridian flip', () => {
  const at = (min: number) => new Date(START.getTime() + min * 60000);
  it('a crossing inside the session adds the flip and a note', () => {
    const m = plan({ transitTime: at(30) }).modes.quick;
    expect(m.overhead.meridianFlipMin).toBe(10);
    expect(m.overhead.totalMin).toBe(43.7);
    expect(codes(m.warnings)).toContain('meridian-flip');
  });
  it('a crossing before the start, after the finish, or unknown adds nothing', () => {
    for (const t of [at(-5), at(300), null]) {
      const m = plan({ transitTime: t }).modes.quick;
      expect(m.overhead.meridianFlipMin).toBe(0);
      expect(codes(m.warnings)).not.toContain('meridian-flip');
    }
  });
  it('without a start time the crossing cannot be placed', () => {
    expect(plan({ acquisitionStart: null, transitTime: at(30) }).modes.quick.overhead.meridianFlipMin).toBe(0);
  });
  it('the flip is counted inside the usable minutes', () => {
    const m = plan({ usableMinutes: 60, transitTime: at(20) }).modes.quick;
    expect(m.overhead.meridianFlipMin).toBe(10);
    expect(m.integrationMin + m.overhead.ditherMin + m.overhead.autofocusMin + m.overhead.meridianFlipMin).toBeLessThanOrEqual(60);
  });
});

describe('warnings from the target and the sky', () => {
  it('Ou4 is warned about by id, name or alias, in every mode', () => {
    for (const t of [{ id: 'ou4' }, { name: 'Ou 4' }, { id: 'squid', aliases: ['Squid Nebula', 'OU4'] }]) {
      const w = plan({ target: { type: 'nebula', ...t } }).warnings;
      expect(codes(w)).toContain('target-ou4');
      expect(w.find((x) => x.code === 'target-ou4')!.severity).toBe('warning');
    }
    expect(isOu4({ id: 'ngc4' })).toBe(false);
    expect(isOu4({ id: 'ou41', aliases: ['Ou 41'] })).toBe(false);
    expect(codes(plan().warnings)).not.toContain('target-ou4');
  });
  it('surface brightness: the catalog class wins; clusters and planetary nebulae are high; the rest unknown', () => {
    expect(surfaceBrightnessOf({ type: 'galaxy', surfaceBrightness: 'low' })).toBe('low');
    expect(surfaceBrightnessOf({ type: 'globular-cluster' })).toBe('high');
    expect(surfaceBrightnessOf({ type: 'open-cluster' })).toBe('high');
    expect(surfaceBrightnessOf({ type: 'planetary-nebula' })).toBe('high');
    expect(surfaceBrightnessOf({ type: 'nebula' })).toBe('unknown');
    expect(surfaceBrightnessOf({ type: 'galaxy' })).toBe('unknown');
    expect(surfaceBrightnessOf({})).toBe('unknown');
    expect(shortSessionPriority({ surfaceBrightness: 'high' })).toBe('high');
    expect(shortSessionPriority({ surfaceBrightness: 'medium' })).toBe('medium');
    expect(shortSessionPriority({ surfaceBrightness: 'low' })).toBe('low');
    expect(shortSessionPriority({ type: 'nebula' })).toBe('unknown');
  });
  it('short session: a faint target warns in Quick only; unknown brightness says it cannot rank; bright is silent', () => {
    const faint = plan({ target: { type: 'nebula', surfaceBrightness: 'low' } }).modes;
    expect(codes(faint.quick.warnings)).toContain('short-session-faint');
    expect(codes(faint.balanced.warnings)).not.toContain('short-session-faint');
    expect(codes(faint.deep.warnings)).not.toContain('short-session-faint');
    const unknown = plan({ target: { type: 'nebula' } }).modes;
    expect(codes(unknown.quick.warnings)).toContain('short-session-unknown');
    expect(codes(unknown.balanced.warnings)).not.toContain('short-session-unknown');
    const bright = plan({ target: { type: 'globular-cluster' } }).modes.quick;
    expect(codes(bright.warnings)).not.toEqual(expect.arrayContaining(['short-session-faint']));
    expect(codes(bright.warnings)).not.toContain('short-session-unknown');
    expect(codes(plan({ target: { type: 'galaxy', surfaceBrightness: 'medium' } }).modes.quick.warnings)).not.toContain('short-session-faint');
  });
  it('image scale notes: oversampled, undersampled, silent in between and when unknown', () => {
    expect(plan({ train: { focalRatio: 10, imageScale: 0.277 } }).warnings.find((w) => w.code === 'sampling')!.text).toMatch(/finer than typical seeing/);
    expect(plan({ train: { focalRatio: 10, imageScale: 2.5 } }).warnings.find((w) => w.code === 'sampling')!.text).toMatch(/coarse/);
    expect(codes(plan({ train: { focalRatio: 10, imageScale: 1.4 } }).warnings)).not.toContain('sampling');
    expect(codes(plan({ train: { focalRatio: 10 } }).warnings)).not.toContain('sampling');
    expect(codes(plan({ train: { focalRatio: 10, imageScale: 0.5 } }).warnings)).not.toContain('sampling'); // 0.5 is the edge, not below
    expect(codes(plan({ train: { focalRatio: 10, imageScale: 2 } }).warnings)).not.toContain('sampling');
  });
  it('a bright Moon close by is noted; a dim one, a far one and a set one are not', () => {
    const moon = (illum: number, sep: number, up = true) => codes(plan({ sky: { bortle: 6, moonIllumination: illum, moonSeparationDeg: sep, moonUp: up } }).warnings);
    expect(moon(0.8, 30)).toContain('moon-near');
    expect(moon(0.5, 59)).toContain('moon-near');
    expect(moon(0.49, 30)).not.toContain('moon-near');
    expect(moon(0.8, 60)).not.toContain('moon-near');
    expect(moon(0.8, 30, false)).not.toContain('moon-near');
  });
  it('filter warnings are part of the report', () => {
    expect(codes(plan({ filter: filter('optolong-lextreme') }).warnings)).toContain('filter-rated-slower');
    expect(codes(plan({ filter: null, camera: c533, train: { focalRatio: 7 } }).warnings)).toContain('filter-uvir-missing');
  });
});

describe('acceptance on the sample profile', () => {
  const f19 = hyperstar.focalRatio as number;
  it('f/1.9 with the L-eXtreme (standard) raises the rated-slower warning', () => {
    expect(codes(plan({ train: { focalRatio: f19 }, filter: filter('optolong-lextreme') }).warnings)).toContain('filter-rated-slower');
  });
  it('the ASI533MC with a filter that lacks UV/IR cut raises the IR warning', () => {
    for (const id of ['idas-lps-p2', 'ice-2in', 'zwo-duo-band', 'optolong-ha-7nm']) {
      expect(codes(plan({ camera: c533, train: { focalRatio: 7 }, filter: filter(id) }).warnings)).toContain('filter-uvir-missing');
    }
  });
  it('the CLS CCD at f/1.9 raises neither', () => {
    for (const cam of [duo, c533]) {
      const c = codes(plan({ camera: cam, train: { focalRatio: f19 }, filter: filter('astronomik-cls-ccd') }).warnings);
      expect(c).not.toContain('filter-rated-slower');
      expect(c).not.toContain('filter-uvir-missing');
    }
  });
});

describe('input checks fail loudly', () => {
  it('missing optics are named, not guessed', () => {
    expect(planExposure(base({ train: {} }))).toEqual({ ok: false, label: 'estimate', missing: ['train.focalRatio'] });
    expect(planExposure(base({ camera: { colour: true } }))).toEqual({ ok: false, label: 'estimate', missing: ['camera.pixelSizeUm'] });
    expect(planExposure(base({ train: {}, camera: {} }))).toEqual({ ok: false, label: 'estimate', missing: ['train.focalRatio', 'camera.pixelSizeUm'] });
  });
  it('rejects a bad Bortle class, usable time or Moon fraction', () => {
    const sky = (bortle: number) => ({ bortle, moonIllumination: 0, moonSeparationDeg: 90, moonUp: false });
    expect(() => planExposure(base({ sky: sky(0) }))).toThrow(RangeError);
    expect(() => planExposure(base({ sky: sky(10) }))).toThrow(RangeError);
    expect(() => planExposure(base({ sky: sky(5.5) }))).toThrow(RangeError);
    expect(() => planExposure(base({ usableMinutes: -1 }))).toThrow(RangeError);
    expect(() => planExposure(base({ usableMinutes: NaN }))).toThrow(RangeError);
    expect(() => planExposure(base({ sky: { bortle: 5, moonIllumination: 1.5, moonSeparationDeg: 90, moonUp: true } }))).toThrow(RangeError);
    expect(() => planExposure(base({ sky: { bortle: 5, moonIllumination: -0.1, moonSeparationDeg: 90, moonUp: true } }))).toThrow(RangeError);
  });
});
