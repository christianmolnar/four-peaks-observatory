import sample from '../data/sample-profile.json';
import { parseItinerary, ITINERARY_VERSION } from '../itinerary';
import { validateProfile } from '../profile';
import type { ProfileFilter } from '../profile';
import {
  BRIGHT_CORE_SUB_CAP_S,
  MODE_ORDER,
  PRESETS,
  SKY_LIMIT_K,
  exposureFor,
  exposureTargetFrom,
  marginalKneeMin,
  needText,
  planExposure,
  presetForSavedMode,
  presetNominalMin,
  readNoisePenalty,
  secondsToSnr,
  snapSubDown,
  starSaturationCapS,
  surfaceBrightnessClassOf,
} from './index';
import type { ExposureChoice, ExposureNight, ExposureResult, ExposureRig, ExposureTarget, ExposureWarning } from './index';

const profile = validateProfile(sample);
const duo = profile.equipment.cameras.find((c) => c.id === 'asi2600mc-duo')!;
const c533 = profile.equipment.cameras.find((c) => c.id === 'asi533mc')!;
const filter = (id: string): ProfileFilter => profile.equipment.filters.find((f) => f.id === id)!;
const codes = (ws: ExposureWarning[]) => ws.map((w) => w.code);

// The three trains of the research table on the ASI2600MC Duo (3.76 um): C11 f/10 (2800 mm), the research's f/6.3 reducer (1764 mm),
// HyperStar f/1.93 (540 mm). Image scale = 206.265 * 3.76 / focal length.
const TRAINS = {
  f10: { focalRatio: 10, imageScale: 0.277 },
  f63: { focalRatio: 6.3, imageScale: 0.44 },
  hs: { focalRatio: 1.93, imageScale: 1.436 },
};
// Filters by passband: none = 300 nm broadband; dual = 50 nm (the research's 15 + 35 nm Duo-Band); 7+7 = 14 nm.
const bandFilter = (nm: number): ProfileFilter => ({ id: `b${nm}`, name: `Test ${nm} nm`, passbandWidthNm: nm, kind: nm <= 14 ? 'narrowband' : 'dual-band', blocksUvIr: true });
const START = new Date('2026-12-05T04:00:00Z');
const night = (over: Partial<ExposureNight> = {}): ExposureNight => ({ moonIllumination: 0, moonSeparationDeg: 90, moonUp: false, usableMinutes: 600, acquisitionStart: START, transitTime: null, ...over });
const rig = (train: ExposureRig['train'], f: ProfileFilter | null = null, camera: ExposureRig['camera'] = duo): ExposureRig => ({ train, camera, filter: f });
const galaxy = (mu?: number): ExposureTarget => ({ id: 'g', name: 'A galaxy', type: 'galaxy', ...(mu === undefined ? {} : { surfaceBrightnessMu: mu }) });
const nebula = (mu?: number): ExposureTarget => ({ id: 'n', name: 'A nebula', type: 'nebula', ...(mu === undefined ? {} : { surfaceBrightnessMu: mu }) });
const run = (t: ExposureTarget, r: ExposureRig, bortle: number, n: ExposureNight, c: ExposureChoice): ExposureResult => {
  const out = exposureFor(t, r, { bortle }, n, c);
  if (!out.ok) throw new Error(`not ok: ${out.missing}`);
  return out;
};
const MOON3 = { moonUp: true, moonIllumination: 1, moonSeparationDeg: 30 }; // factor 1 + 3 * 1 * (1 - 30/90) = 3

describe('sub length: the swamp rule against the research table (K = 10, 1.0 e, 3.76 um; python ~/.cache/fourpeaks-exposure/hand.py)', () => {
  // Rows: [train, band nm, [Bortle 4, 6, 8], [Bortle 4, 6, 8 with the Moon, M = 3]] seconds before clamping.
  const TABLE: [keyof typeof TRAINS, number | null, number[], number[]][] = [
    ['f10', null, [278, 70, 18], [93, 23, 6]],
    ['f10', 50, [1668, 419, 105], [556, 140, 35]],
    ['f10', 14, [5958, 1497, 376], [1986, 499, 125]],
    ['f63', null, [110, 28, 7], [37, 9, 2]],
    ['f63', 50, [662, 166, 42], [221, 55, 14]],
    ['hs', null, [10, 3, 1], [3, 1, 0]], // the research rounds with f/1.9; f/1.93 is 3% slower per pixel, so 10.4 -> 10, 2.6 -> 3
    ['hs', 50, [62, 16, 4], [21, 5, 1]],
  ];
  it.each(TABLE)('%s, band %s nm: swamp seconds per Bortle, without and with the Moon', (tr, nm, dark, moon) => {
    const r = rig(TRAINS[tr], nm === null ? null : bandFilter(nm));
    for (const [i, b] of [4, 6, 8].entries()) {
      expect(Math.round(run(galaxy(22), r, b, night(), { preset: 'balanced' }).swampSeconds)).toBe(dark[i]);
      expect(Math.round(run(galaxy(22), r, b, night(MOON3), { preset: 'balanced' }).swampSeconds)).toBe(moon[i]);
    }
  });
  it('K scales it: quick (5) is half and deep (20) is double the standard (10)', () => {
    const at = (preset: 'quick' | 'balanced' | 'deep') => run(galaxy(22), rig(TRAINS.f10), 6, night(), { preset }).swampSeconds;
    expect(at('quick') / at('balanced')).toBeCloseTo(0.5, 10);
    expect(at('deep') / at('balanced')).toBeCloseTo(2, 10);
    expect(PRESETS.balanced.swampK).toBe(SKY_LIMIT_K);
  });
});

describe('sub length: the clamps', () => {
  it('C11 f/10 broadband, Bortle 6, standard: 70 s snaps to 60 s, read noise sets it', () => {
    const r = run(galaxy(22), rig(TRAINS.f10), 6, night(), { preset: 'balanced' });
    expect(r.subSeconds).toBe(60);
    expect(r.limitedBy.sub).toBe('read-noise');
    expect(r.readNoisePenalty).toBeCloseTo(readNoisePenalty(1.0, 0.25 * 0.25 * 10 ** (0.4 * 0.9), 60), 10);
    expect(r.readNoisePenalty * 100).toBeCloseTo(5.4, 0); // sqrt(1 + 1/(60/7.0)) - 1 for the 70 s swamp length
  });
  it('dual-narrowband at f/10 breaks the swamp rule: Bortle 6 wants 419 s, standard caps at 300 s (6.8% penalty), quick at 180 s (11%)', () => {
    const r = rig(TRAINS.f10, bandFilter(50));
    const std = run(nebula(22), r, 6, night(), { preset: 'balanced' });
    expect(std.swampSeconds).toBeCloseTo(419.3, 0);
    expect([std.subSeconds, std.limitedBy.sub]).toEqual([300, 'risk-cap']);
    expect(std.readNoisePenalty).toBeCloseTo(0.068, 2);
    const quick = run(nebula(22), r, 6, night(), { preset: 'quick' });
    expect([quick.subSeconds, quick.limitedBy.sub]).toEqual([180, 'risk-cap']);
    expect(quick.readNoisePenalty).toBeCloseTo(0.11, 2);
    expect(std.warnings.find((w) => w.code === 'sub-capped')!.text).toMatch(/about 419 s; capped at 300 s .* about 7% /);
  });
  it('the Moon shortens the sub-limited length (Bortle 6 broadband f/10: 70 s dark, 23 s with the Moon)', () => {
    const r = rig(TRAINS.f10);
    expect(run(galaxy(22), r, 6, night(), { preset: 'balanced' }).subSeconds).toBe(60);
    expect(run(galaxy(22), r, 6, night(MOON3), { preset: 'balanced' }).subSeconds).toBe(20); // 23 s -> 20 s
  });
  it('HyperStar broadband in Bortle 6 asks for 3 s by the swamp rule; the overhead floor holds it at 15 s', () => {
    const r = run(galaxy(22), rig(TRAINS.hs), 6, night(), { preset: 'balanced' });
    expect(r.swampSeconds).toBeLessThan(4);
    expect([r.subSeconds, r.limitedBy.sub]).toEqual([15, 'floor']);
  });
  it('star saturation caps a fast beam with no filter: f/1.93 broadband is held at 20 s (27.9 s), though the floor and swamp rule are lower', () => {
    expect(starSaturationCapS(2)).toBe(30);
    expect(starSaturationCapS(1.93)).toBeCloseTo(27.94, 2);
    expect(starSaturationCapS(10)).toBe(750);
    expect(starSaturationCapS(2, 300)).toBe(30);
  });
  it('stars are continuum, so a filter lifts the saturation cap by 300 nm over its passband (50 nm: 6x, 14 nm: 21x)', () => {
    expect(starSaturationCapS(2, 50)).toBeCloseTo(180, 6);
    expect(starSaturationCapS(1.93, 50)).toBeCloseTo(167.6, 1);
    expect(starSaturationCapS(2, 14)).toBeCloseTo(642.86, 1);
    expect(() => starSaturationCapS(2, 0)).toThrow(RangeError);
  });
  it('HyperStar with a 50 nm dual-band is sky-limited, not saturation-limited: Bortle 4 about 60 s, Bortle 6 15 to 30 s (research: 60 to 120 s, up to 60 s)', () => {
    const at = (b: number, preset: 'quick' | 'balanced' | 'deep') => run(nebula(22), rig(TRAINS.hs, bandFilter(50)), b, night(), { preset });
    const b4 = at(4, 'balanced');
    expect(b4.swampSeconds).toBeCloseTo(62.3, 0);
    expect([b4.subSeconds, b4.limitedBy.sub]).toEqual([60, 'read-noise']);
    expect(b4.readNoisePenalty).toBeLessThan(0.06);
    expect(at(4, 'quick').subSeconds).toBe(30);
    expect(at(4, 'deep').subSeconds).toBe(120);
    const b6 = at(6, 'balanced');
    expect([b6.subSeconds, b6.limitedBy.sub]).toEqual([15, 'read-noise']);
    expect(at(6, 'deep').subSeconds).toBe(30);
    expect(codes(b4.warnings)).not.toContain('sub-capped');
  });
  it('HyperStar with an f/2-rated 7+7 nm filter: the 222 s the sky asks for at Bortle 4 is kept (saturation cap about 600 s)', () => {
    const f = { ...bandFilter(14), ratedMinFRatio: 2, narrowestBandNm: 7 };
    const r = run(nebula(22), rig(TRAINS.hs, f), 4, night(), { preset: 'balanced' });
    expect(r.swampSeconds).toBeCloseTo(222, 0);
    expect([r.subSeconds, r.limitedBy.sub]).toEqual([240, 'read-noise']);
    expect(r.readNoisePenalty).toBeLessThan(0.05);
    const deep = run(nebula(22), rig(TRAINS.hs, f), 4, night(), { preset: 'deep' });
    expect([deep.subSeconds, deep.limitedBy.sub]).toEqual([300, 'risk-cap']); // 445 s asked, the 300 s guiding ceiling holds it, not saturation
    expect(run(nebula(22), rig(TRAINS.hs, f), 6, night(), { preset: 'balanced' }).subSeconds).toBe(60); // 56 s asked
  });
  it('an unfiltered fast beam is still saturation-limited', () => {
    const r = run(galaxy(22), rig(TRAINS.hs), 1, night(), { preset: 'deep' });
    expect(r.subSeconds).toBeLessThanOrEqual(starSaturationCapS(1.93));
  });
  it('a bright core caps the long sub at BRIGHT_CORE_SUB_CAP_S: M42-like at f/10, Bortle 4 wants 278 s, gets 120 s', () => {
    const plain = run(nebula(20), rig(TRAINS.f10), 4, night(), { preset: 'balanced' });
    expect([plain.subSeconds, plain.limitedBy.sub]).toEqual([300, 'read-noise']);
    const core = run({ ...nebula(20), brightCore: true }, rig(TRAINS.f10), 4, night(), { preset: 'balanced' });
    expect(BRIGHT_CORE_SUB_CAP_S).toBe(120);
    expect([core.subSeconds, core.limitedBy.sub]).toEqual([120, 'saturation']);
  });
  it('snapSubDown never goes above the cap', () => {
    expect(snapSubDown(27.9)).toBe(20);
    expect(snapSubDown(30)).toBe(30);
    expect(snapSubDown(5)).toBe(15);
  });
  it('the dither interval follows the sub: 15 s every 8, 30 s every 4, 90 s every 3', () => {
    const at = (tr: keyof typeof TRAINS, f?: ProfileFilter) => run(galaxy(22), rig(TRAINS[tr], f ?? null), 6, night(), { preset: 'balanced' }).ditherEveryFrames;
    expect(at('hs')).toBe(8);
    expect(run(galaxy(22), rig(TRAINS.f63), 6, night(), { preset: 'balanced' })).toMatchObject({ subSeconds: 30, ditherEveryFrames: 4 });
    expect(at('f10', bandFilter(50))).toBe(3);
  });
});

describe('total light: the knee comes from the object, not the mode', () => {
  // C11 f/10 broadband (no filter), quick preset (SNR 20 per 2.5" element): the research table, minutes. A galaxy is continuum.
  const kneeAt = (mu: number, bortle: number, preset: 'quick' | 'balanced' | 'deep' = 'quick', train = TRAINS.f10, f: ProfileFilter | null = null) =>
    run(galaxy(mu), rig(train, f), bortle, night(), { preset }).knee;
  it.each([
    [20, [0.72, 1.14, 2.85]],
    [22, [9.32, 26.36, 94.2]],
    [24, [250.32, 928.72, 3629.44]],
  ])('surface brightness %i: time to SNR 20 in Bortle 4, 6, 8', (mu, mins) => {
    [4, 6, 8].forEach((b, i) => expect(kneeAt(mu, b).snrTimeMin).toBeCloseTo(mins[i], 1));
  });
  it('the knee is the sooner of the SNR target and the diminishing-returns point (68 min at 20%)', () => {
    expect(marginalKneeMin(0.2)).toBeCloseTo(68.18, 2);
    expect(marginalKneeMin(0.1)).toBeCloseTo(142.86, 2);
    expect(marginalKneeMin(0.05)).toBeCloseTo(292.68, 2);
    const medium = kneeAt(22, 6);
    expect([medium.minutes, medium.setBy]).toEqual([medium.snrTimeMin, 'snr-target']);
    const faint = kneeAt(24, 6);
    expect(faint.minutes).toBeCloseTo(68.18, 2);
    expect(faint.setBy).toBe('diminishing-returns');
  });
  it('halving the contrast about quadruples the time: T is proportional to (1 + C) / C^2', () => {
    // C = 10^(0.4 (SQM - mu)); mu 22 -> 24 at Bortle 6 is a factor 6.3 in C
    const c = (mu: number) => 10 ** (0.4 * (20 - mu));
    expect(secondsToSnr(20, c(24), 1) / secondsToSnr(20, c(22), 1)).toBeCloseTo(((1 + c(24)) / c(24) ** 2) / ((1 + c(22)) / c(22) ** 2), 10);
    expect(secondsToSnr(20, 1, 1)).toBe(400 * 2);
    expect(secondsToSnr(20, 0.5, 1)).toBeCloseTo(400 * 1.5 / 0.25, 10);
  });
  it('the same aperture gives the same minutes at f/10 and at f/1.93 (the f-ratio changes the sub, not the hours)', () => {
    const a = kneeAt(22, 6, 'quick', TRAINS.f10).snrTimeMin;
    const b = kneeAt(22, 6, 'quick', TRAINS.hs).snrTimeMin;
    expect(Math.abs(a - b) / a).toBeLessThan(0.01);
    expect(kneeAt(22, 6, 'quick', TRAINS.f63).snrTimeMin / a).toBeCloseTo(1, 1);
  });
  it('the SNR target sets the preset: 40 is 4x and 60 is 9x the minutes of 20', () => {
    const q = kneeAt(22, 6, 'quick').snrTimeMin;
    expect(kneeAt(22, 6, 'balanced').snrTimeMin / q).toBeCloseTo(4, 5);
    expect(kneeAt(22, 6, 'deep').snrTimeMin / q).toBeCloseTo(9, 5);
  });
  it('a dual-band filter raises an emission object\'s contrast: 26.4 min broadband becomes 9.5 min at 50 nm; a continuum object gains nothing and loses light (214 min)', () => {
    const emission = run(nebula(22), rig(TRAINS.f10, bandFilter(50)), 6, night(), { preset: 'quick' }).knee.snrTimeMin;
    const continuum = run(galaxy(22), rig(TRAINS.f10, bandFilter(50)), 6, night(), { preset: 'quick' }).knee.snrTimeMin;
    expect(emission).toBeCloseTo(9.49, 1);
    expect(continuum).toBeCloseTo(214.4, 0);
    expect(run(nebula(22), rig(TRAINS.f10), 6, night(), { preset: 'quick' }).knee.snrTimeMin).toBeCloseTo(26.36, 1);
  });
  it('the Moon brightens the sky and lengthens the time for a broadband object', () => {
    const dark = kneeAt(22, 6).snrTimeMin;
    const moon = run(galaxy(22), rig(TRAINS.f10), 6, night(MOON3), { preset: 'quick' }).knee.snrTimeMin;
    expect(moon).toBeGreaterThan(dark);
  });
  it('a bright object plans the 30 minute minimum; a faint one stops at the preset\'s diminishing-returns point, not the SNR target', () => {
    const bright = run(galaxy(20), rig(TRAINS.f10), 6, night(), { preset: 'balanced' });
    expect([bright.integrationMin, bright.limitedBy.total]).toEqual([30, 'minimum-total']);
    const faint = run(galaxy(24), rig(TRAINS.f10), 6, night(), { preset: 'balanced' });
    expect(faint.limitedBy.total).toBe('diminishing-returns');
    expect(faint.integrationMin).toBe(143); // 142.86 min of 60 s subs, rounded up: 143 subs
    expect(faint.reachesSnrTarget).toBe(false);
    expect(codes(faint.warnings)).toContain('short-of-target');
    expect(codes(bright.warnings)).not.toContain('short-of-target');
  });
  it('the usable window cuts it and says what limited the total', () => {
    const r = run(galaxy(24), rig(TRAINS.f10), 6, night({ usableMinutes: 60 }), { preset: 'balanced' });
    expect(r.limitedBy.total).toBe('usable-window');
    expect(codes(r.warnings)).toContain('limited-by-usable-time');
  });
  it('unknown surface brightness assumes the medium row and says so; a class stands for its row; the number wins', () => {
    const unknown = run({ id: 'x', name: 'x', type: 'galaxy' }, rig(TRAINS.f10), 6, night(), { preset: 'quick' });
    expect([unknown.knee.surfaceBrightnessMu, unknown.knee.surfaceBrightnessFrom]).toEqual([22, 'assumed']);
    expect(codes(unknown.warnings)).toContain('sb-assumed');
    const low = run({ id: 'x', name: 'x', type: 'galaxy', surfaceBrightness: 'low' }, rig(TRAINS.f10), 6, night(), { preset: 'quick' });
    expect([low.knee.surfaceBrightnessMu, low.knee.surfaceBrightnessFrom]).toEqual([24, 'class']);
    expect(codes(low.warnings)).not.toContain('sb-assumed');
    const num = run(galaxy(23), rig(TRAINS.f10), 6, night(), { preset: 'quick' });
    expect([num.knee.surfaceBrightnessMu, num.knee.surfaceBrightnessFrom]).toEqual([23, 'catalog']);
    expect(codes(num.warnings)).not.toContain('sb-assumed');
  });
  it('a cluster with no number is high (class stand-in 20)', () => {
    const r = run({ id: 'c', name: 'c', type: 'globular-cluster' }, rig(TRAINS.f10), 6, night(), { preset: 'quick' });
    expect([r.knee.surfaceBrightnessMu, r.knee.surfaceBrightnessFrom]).toEqual([20, 'class']);
  });
});

describe('presets are parameters', () => {
  it('each preset is described by K, an SNR target, a stop threshold, a risk cap and dither: no minutes to shoot', () => {
    for (const m of MODE_ORDER) {
      expect(Object.keys(PRESETS[m]).sort()).toEqual(['dither', 'label', 'maxNextHalfHourGain', 'riskCapS', 'snrTarget', 'summary', 'swampK']);
      expect(PRESETS[m].summary.length).toBeGreaterThan(20);
    }
    expect(MODE_ORDER.map((m) => PRESETS[m].swampK)).toEqual([5, 10, 20]);
    expect(MODE_ORDER.map((m) => PRESETS[m].snrTarget)).toEqual([20, 40, 60]);
    expect(MODE_ORDER.map((m) => PRESETS[m].maxNextHalfHourGain)).toEqual([0.2, 0.1, 0.05]);
    expect(MODE_ORDER.map((m) => PRESETS[m].label)).toEqual(['Quick & Beautiful', 'Balanced', 'Deep Project']);
    for (const m of MODE_ORDER) expect(PRESETS[m].riskCapS).toBeLessThanOrEqual(300);
  });
  it('a preset\'s nominal aim is its diminishing-returns point: 68, 143 and 293 minutes', () => {
    expect(MODE_ORDER.map((m) => Math.round(presetNominalMin(m)))).toEqual([68, 143, 293]);
  });
  it('the result is the same whether it comes from exposureFor or from the planExposure the panel uses', () => {
    const t = galaxy(22);
    const n = night();
    const report = planExposure({
      target: t, train: TRAINS.f10, camera: duo, filter: null, sky: { bortle: 6, moonIllumination: 0, moonSeparationDeg: 90, moonUp: false },
      usableMinutes: n.usableMinutes, acquisitionStart: n.acquisitionStart, transitTime: n.transitTime,
    });
    if (!report.ok) throw new Error('not ok');
    for (const m of MODE_ORDER) expect(run(t, rig(TRAINS.f10), 6, n, { preset: m })).toEqual(report.modes[m]);
  });
  it('gives the gain as none (the profile stores no gain or HCG point), the filter note and a calculated source', () => {
    const r = run(nebula(22), rig(TRAINS.f10, bandFilter(50)), 6, night(), { preset: 'balanced' });
    expect(r.source).toBe('calculated');
    expect(r.gain.suggested).toBeNull();
    expect(r.gain.note).toMatch(/no gain suggestion/i);
    expect(r.filterNote).toMatch(/Test 50 nm, about 50 nm: .*lines pass.*17% of the full band/);
    expect(run(galaxy(22), rig(TRAINS.f10, bandFilter(50)), 6, night(), { preset: 'balanced' }).filterNote).toMatch(/continuum/);
    expect(run(galaxy(22), rig(TRAINS.f10), 6, night(), { preset: 'balanced' }).filterNote).toMatch(/^No filter/);
  });
});

describe('custom: overrides of a preset', () => {
  const at = (o: ExposureChoice['overrides'], n = night(), preset: ExposureChoice['preset'] = 'balanced') => run(galaxy(22), rig(TRAINS.f10), 6, n, { preset, overrides: o });
  const base = at(undefined);
  it('a preset alone is not custom', () => {
    expect([base.custom, base.differs]).toEqual([false, []]);
    expect([base.subSeconds, base.subCount, base.integrationMin]).toEqual([60, 106, 106]); // SNR 40 is 4 x 26.36 = 105.4 min, 60 s subs, rounded up: 106
  });
  it('a different sub length is custom, is used as given (not snapped) and keeps the preset\'s total', () => {
    const r = at({ subSeconds: 47 });
    expect(r.custom).toBe(true);
    expect(r.differs).toEqual([{ field: 'subSeconds', preset: base.subSeconds, chosen: 47 }]);
    expect(r.subSeconds).toBe(47);
    expect(r.limitedBy.sub).toBe('user');
    expect(r.subCount).toBe(Math.ceil((r.knee.minutes * 60) / 47));
  });
  it('a different count is custom and sets the total', () => {
    const r = at({ subCount: 30 });
    expect(r.differs).toEqual([{ field: 'subCount', preset: base.subCount, chosen: 30 }]);
    expect([r.subCount, r.integrationMin, r.limitedBy.total]).toEqual([30, 30, 'user']);
  });
  it('a different total is custom; count follows from the sub', () => {
    const r = at({ totalMin: 45 });
    expect(r.differs).toEqual([{ field: 'totalMin', preset: base.integrationMin, chosen: 45 }]);
    expect([r.subCount, r.integrationMin]).toEqual([45, 45]);
  });
  it('an override equal to the preset\'s own value is not a difference', () => {
    const r = at({ subSeconds: base.subSeconds, subCount: base.subCount, totalMin: base.integrationMin });
    expect([r.custom, r.differs]).toEqual([false, []]);
  });
  it('several overrides list each difference', () => {
    expect(at({ subSeconds: 90, totalMin: 60 }).differs.map((d) => d.field)).toEqual(['subSeconds', 'totalMin']);
  });
  it('the usable window still limits a custom choice, and says so', () => {
    const r = at({ totalMin: 500 }, night({ usableMinutes: 120 }));
    expect(r.custom).toBe(true);
    expect(r.integrationMin).toBeLessThan(120);
    expect(r.limitedBy.total).toBe('usable-window');
    expect(codes(r.warnings)).toContain('limited-by-usable-time');
  });
  it('rejects overrides that are not positive numbers (whole for the count)', () => {
    for (const o of [{ subSeconds: 0 }, { subSeconds: NaN }, { subCount: 0 }, { subCount: 2.5 }, { totalMin: -5 }]) {
      expect(() => at(o)).toThrow(RangeError);
    }
    expect(() => exposureFor(galaxy(22), rig(TRAINS.f10), { bortle: 6 }, night(), { preset: 'nope' as 'quick' })).toThrow(RangeError);
  });
});

describe('saved modes still load', () => {
  it('the three saved names map to their own presets; anything else is not a mode', () => {
    expect(['quick', 'balanced', 'deep'].map(presetForSavedMode)).toEqual(['quick', 'balanced', 'deep']);
    for (const bad of ['standard', 'Quick', '', null, 3, undefined]) expect(presetForSavedMode(bad)).toBeNull();
  });
  it('an itinerary saved with the old modes parses, each item keeping its mode', () => {
    const text = JSON.stringify({
      version: ITINERARY_VERSION,
      startTime: null,
      items: ['quick', 'balanced', 'deep'].map((mode, i) => ({ id: `s${i}`, targetId: 'm31', trainId: 't', filterId: null, mode, note: '' })),
    });
    expect(parseItinerary(text).items.map((i) => i.mode)).toEqual(['quick', 'balanced', 'deep']);
    expect(() => parseItinerary(text.replace('"deep"', '"standard"'))).toThrow(/mode/);
  });
});

describe('surface brightness reaches the exposure advice (review S2)', () => {
  it('the class cuts: under 22 is high, 22 up to 24 is medium, 24 and more is low', () => {
    expect([19, 21.99, 22, 23.99, 24, 26].map(surfaceBrightnessClassOf)).toEqual(['high', 'high', 'medium', 'medium', 'low', 'low']);
  });
  it('exposureTargetFrom passes the catalog number, and the faint-target warning becomes reachable and correct', () => {
    const src = (sb?: number) => exposureTargetFrom({ id: 'ngc1', name: 'NGC 1', aliases: [], type: 'galaxy', ...(sb === undefined ? {} : { surfaceBrightness: sb }) });
    expect(src(24.6).surfaceBrightnessMu).toBe(24.6);
    expect('surfaceBrightnessMu' in src()).toBe(false);
    const quick = (sb?: number) => run(src(sb), rig(TRAINS.f10), 6, night(), { preset: 'quick' });
    expect(codes(quick(24.6).warnings)).toContain('short-session-faint');
    expect(quick(24.6).warnings.find((w) => w.code === 'short-session-faint')!.severity).toBe('warning');
    expect(codes(quick(22.5).warnings)).not.toContain('short-session-faint');
    expect(codes(quick(20.5).warnings)).not.toContain('short-session-faint');
    expect(codes(quick().warnings)).toContain('short-session-unknown');
    expect(codes(run(src(24.6), rig(TRAINS.f10), 6, night(), { preset: 'balanced' }).warnings)).not.toContain('short-session-faint');
  });
});

describe('every warning code is reachable through exposureFor', () => {
  const warnsOf = (t: ExposureTarget, r: ExposureRig, n: ExposureNight, c: ExposureChoice = { preset: 'quick' }, bortle = 6) => codes(run(t, r, bortle, n, c).warnings);
  const cases: [string, () => string[]][] = [
    ['filter-rated-slower', () => warnsOf(nebula(22), rig(TRAINS.hs, filter('optolong-lextreme')), night())],
    ['filter-uvir-missing', () => warnsOf(nebula(22), rig(TRAINS.f63, null, c533), night())],
    ['filter-visual-colour', () => warnsOf(nebula(22), rig(TRAINS.f63, filter('apertura-moon-skyglow')), night())],
    ['filter-kind-unknown', () => warnsOf(nebula(22), rig(TRAINS.f63, filter('orion-sky-glow')), night())],
    ['inputs-assumed', () => warnsOf(nebula(22), rig(TRAINS.f63, null, { pixelSizeUm: 3.76 }), night())],
    ['sampling', () => warnsOf(nebula(22), rig(TRAINS.f10), night())],
    ['moon-near', () => warnsOf(nebula(22), rig(TRAINS.f63), night({ moonUp: true, moonIllumination: 0.9, moonSeparationDeg: 20 }))],
    ['target-ou4', () => warnsOf({ id: 'ou4', name: 'Ou4', type: 'nebula', surfaceBrightnessMu: 25 }, rig(TRAINS.f63), night())],
    ['no-usable-time', () => warnsOf(nebula(22), rig(TRAINS.f63), night({ usableMinutes: 0 }))],
    ['limited-by-usable-time', () => warnsOf(nebula(22), rig(TRAINS.f63), night({ usableMinutes: 40 }), { preset: 'deep' })],
    ['below-mode-range', () => warnsOf(nebula(24), rig(TRAINS.f63), night({ usableMinutes: 40 }), { preset: 'deep' })],
    ['short-session-faint', () => warnsOf(galaxy(24.5), rig(TRAINS.f63), night())],
    ['short-session-unknown', () => warnsOf({ id: 'x', name: 'x', type: 'galaxy' }, rig(TRAINS.f63), night())],
    ['sb-assumed', () => warnsOf({ id: 'x', name: 'x', type: 'galaxy' }, rig(TRAINS.f63), night())],
    ['short-of-target', () => warnsOf(galaxy(24.5), rig(TRAINS.f63), night(), { preset: 'balanced' })],
    ['sub-capped', () => warnsOf(nebula(22), rig(TRAINS.f10, bandFilter(50)), night(), { preset: 'balanced' })],
    ['meridian-flip', () => warnsOf(nebula(22), rig(TRAINS.f63), night({ transitTime: new Date(START.getTime() + 20 * 60000) }))],
  ];
  it.each(cases)('%s', (code, make) => expect(make()).toContain(code));
});

describe('input checks on the entry point', () => {
  it('missing optics are named', () => {
    expect(exposureFor(galaxy(22), rig({}, null, {}), { bortle: 6 }, night(), { preset: 'quick' })).toEqual({ ok: false, label: 'estimate', missing: ['train.focalRatio', 'train.imageScale', 'camera.pixelSizeUm'] });
  });
  it('rejects a bad Bortle, usable time or Moon fraction', () => {
    expect(() => exposureFor(galaxy(22), rig(TRAINS.f10), { bortle: 0 }, night(), { preset: 'quick' })).toThrow(RangeError);
    expect(() => exposureFor(galaxy(22), rig(TRAINS.f10), { bortle: 6 }, night({ usableMinutes: -1 }), { preset: 'quick' })).toThrow(RangeError);
    expect(() => exposureFor(galaxy(22), rig(TRAINS.f10), { bortle: 6 }, night({ moonIllumination: 2 }), { preset: 'quick' })).toThrow(RangeError);
  });
});

describe('the short-of-target note', () => {
  const note = (r: ExposureResult) => r.warnings.find((w) => w.code === 'short-of-target');
  it('a galaxy that needs thousands of minutes broadband says "more than 10 hours", never a raw count, and does not suggest a narrower filter', () => {
    const r = run(galaxy(24.17), rig(TRAINS.f10), 6, night(), { preset: 'balanced' });
    expect(r.knee.snrTimeMin).toBeGreaterThan(3000);
    const w = note(r)!;
    expect(w.text).toContain('more than 10 hours, beyond one night');
    expect(w.text).not.toMatch(/\d{4}/);
    expect(w.text).not.toMatch(/narrower filter or/);
    expect(w.text).toMatch(/narrower filter would not help/);
  });
  it('a galaxy through a dual-band (worse: continuum loses light with the filter) also prints no raw thousands', () => {
    const w = note(run(galaxy(24.17), rig(TRAINS.f10, bandFilter(50)), 6, night(), { preset: 'balanced' }))!;
    expect(w.text).not.toMatch(/\d{4}/);
    expect(w.text).toContain('beyond one night');
  });
  it('an emission nebula may be told a narrower filter helps', () => {
    const w = note(run(nebula(24.5), rig(TRAINS.f63), 6, night(), { preset: 'balanced' }))!;
    expect(w.text).toMatch(/a narrower filter or a darker sky changes it more than time does/);
    expect(w.text).not.toMatch(/would not help/);
  });
  it('a count in hours between 2 and 10 hours is printed in hours, one decimal; under 2 hours in minutes', () => {
    expect(needText(90)).toBe('about 90 minutes');
    expect(needText(238)).toBe('about 4 hours');
    expect(needText(255)).toBe('about 4.3 hours');
    expect(needText(599)).toBe('about 10 hours');
    expect(needText(600)).toBe('more than 10 hours, beyond one night');
    expect(needText(42087)).toBe('more than 10 hours, beyond one night');
  });
  it('flooring alone does not fire it: a medium object at Bortle 4 plans at least its 37.4 minute target (300 s subs round up to 40)', () => {
    const r = run(galaxy(22), rig(TRAINS.f10), 4, night(), { preset: 'balanced' });
    expect(r.knee.snrTimeMin).toBeCloseTo(37.4, 0);
    expect(r.subSeconds).toBe(300);
    expect(r.integrationMin).toBe(40);
    expect(r.reachesSnrTarget).toBe(true);
    expect(note(r)).toBeUndefined();
  });
  it('the plan never falls below the 30 minute minimum from rounding down (Deep, dual-band, Bortle 8 was 28)', () => {
    const r = run(nebula(20), rig(TRAINS.f10, bandFilter(50)), 8, night(), { preset: 'deep' });
    expect(r.integrationMin).toBeGreaterThanOrEqual(30);
  });
  it('a window shorter than the target still fires it', () => {
    const r = run(galaxy(22), rig(TRAINS.f10), 6, night({ usableMinutes: 60 }), { preset: 'balanced' });
    expect(note(r)).toBeDefined();
  });
});

describe('overrides stay cheap and honest at the edges', () => {
  it('a huge total or count is cut by the window without a long loop', () => {
    const t = Date.now();
    const r = run(galaxy(22), rig(TRAINS.f10), 6, night(), { preset: 'balanced', overrides: { totalMin: 1e9 } });
    expect(Date.now() - t).toBeLessThan(1000);
    expect(r.integrationMin).toBeLessThanOrEqual(600);
    expect(codes(r.warnings)).toContain('limited-by-usable-time');
  });
  it('a sub longer than the window plans no subs and says so', () => {
    const r = run(galaxy(22), rig(TRAINS.f10), 6, night({ usableMinutes: 30 }), { preset: 'balanced', overrides: { subSeconds: 3600 } });
    expect(r.subCount).toBe(0);
    expect(codes(r.warnings)).toContain('limited-by-usable-time');
  });
});
