import { emissionProfileFor } from '../catalog/emission';
import type { EmissionProfile } from '../catalog/emission';
import { PRESETS } from '../exposure';
import { narrowbandHours, narrowbandPlan } from './narrowband-hours';
import type { NbFilterInput, NbInput, NbResult } from './narrowband-hours';

/**
 * The held cases are the research note's own (~/Token/research/fourpeaks-narrowband-hours.md, its python script run as written): Bortle 6, f/1.9, 3.76 um pixels,
 * 560 mm, read noise 1 e, the Balanced knee, an NBZ II (Ha 10 nm, OIII 8 nm) and an NB3-PM (OIII 21 nm, SII 19 nm). Minutes must match within 5 per filter.
 */
const NBZ: NbFilterInput = { id: 'nbz', name: 'NBZ II', bands: [{ centreNm: 656.3, widthNm: 10 }, { centreNm: 500.7, widthNm: 8 }] };
const NB3: NbFilterInput = { id: 'nb3', name: 'NB3-PM', bands: [{ centreNm: 500.7, widthNm: 21 }, { centreNm: 672.4, widthNm: 19 }] };
const HA7: NbFilterInput = { id: 'ha7', name: 'Optolong H-alpha 7 nm', bands: [{ centreNm: 656.3, widthNm: 7 }] };
const LEX: NbFilterInput = { id: 'lex', name: 'Optolong L-eXtreme', bands: [{ centreNm: 656.3, widthNm: 7 }, { centreNm: 500.7, widthNm: 7 }] };

const profile = (lines: EmissionProfile['lines'], continuum = 0.1): EmissionProfile => ({ lines, continuum, source: 'test', confidence: 'type-default' });
const M42 = profile({ Ha: 1, OIII: 0.83, SII: 0.034, NII: 0.25 });
const ROSETTE = profile({ Ha: 1, OIII: 0.4, SII: 0.15, NII: 0.2 });
const M57 = profile({ Ha: 0.25, OIII: 1, SII: 0.05, NII: 0.5 });
const GALAXY = profile({}, 1);

const run = (p: EmissionProfile, mu: number, hours: number, filters: NbFilterInput[], over: Partial<NbInput> = {}): NbResult =>
  narrowbandHours({ profile: p, surfaceBrightnessMu: mu, broadbandHours: hours, bortle: 6, train: { fRatio: 1.9, pixelUm: 3.76, focalLengthMm: 560 }, readNoiseE: 1, knee: 'balanced', filters, ...over });
const mins = (r: NbResult): Record<string, number> => Object.fromEntries(r.filters.map((f) => [f.filterId, f.minutes]));
const near = (got: number, want: number): void => expect(Math.abs(got - want)).toBeLessThanOrEqual(5);

describe('the research note’s worked examples (within 5 minutes per filter)', () => {
  const both = [NBZ, NB3];
  it.each([
    ['M42', M42, 20, 2, 125, 0],
    ['M42', M42, 20, 4, 105, 0],
    ['Rosette', ROSETTE, 22, 2, 135, 135],
    ['Rosette', ROSETTE, 22, 4, 130, 130],
    ['M57', M57, 18, 2, 100, 0],
    ['M57', M57, 18, 4, 55, 0],
  ])('%s, %i mag, B = %i h: NBZ II %i, NB3-PM %i', (_n, p, mu, hours, nbz, nb3) => {
    const m = mins(run(p, mu, hours, both));
    near(m.nbz, nbz);
    if (nb3 === 0) expect(m.nb3).toBe(0);
    else near(m.nb3, nb3);
  });

  it('the Deep knee matches the note (M42 215 and 255 min, Rosette NBZ II 175 and 280)', () => {
    near(mins(run(M42, 20, 2, both, { knee: 'deep' })).nbz, 215);
    near(mins(run(M42, 20, 4, both, { knee: 'deep' })).nbz, 255);
    near(mins(run(ROSETTE, 22, 2, both, { knee: 'deep' })).nbz, 175);
    near(mins(run(ROSETTE, 22, 4, both, { knee: 'deep' })).nbz, 280);
  });

  it('the gains E and the cap match the note (M42 Ha 4.1 and OIII 6.2; cap 2.4 h at Balanced)', () => {
    const r = run(M42, 20, 2, both);
    const lines = r.filters.find((f) => f.filterId === 'nbz')?.lines ?? [];
    expect(lines.find((l) => l.line === 'Ha')?.gain).toBeCloseTo(4.1, 0);
    expect(lines.find((l) => l.line === 'OIII')?.gain).toBeCloseTo(6.2, 0);
    expect(r.capMin / 60).toBeCloseTo(2.38, 1);
    expect(PRESETS.balanced.maxNextHalfHourGain).toBe(0.1);
  });

  it('M42 puts SII under the cut, so NB3-PM is told it adds nothing', () => {
    const f = run(M42, 20, 2, both).filters.find((x) => x.filterId === 'nb3');
    expect(f?.verdict).toBe('no-help');
    expect(f?.minutes).toBe(0);
    expect(f?.detail).toMatch(/NBZ II/);
  });
});

describe('a galaxy', () => {
  it.each([2, 4])('gets no minutes at B = %i h, and the detail says almost no emission', (h) => {
    const r = run(GALAXY, 23, h, [NBZ, NB3, HA7]);
    expect(r.gate).toBe(true);
    for (const f of r.filters) {
      expect(f.minutes).toBe(0);
      expect(f.verdict).toBe('no-narrowband');
      expect(f.detail).toMatch(/almost no emission/i);
    }
  });
  it('works out the same through the catalog profile of an elliptical', () => {
    const p = emissionProfileFor('ngc4486', 'galaxy') as EmissionProfile;
    expect(run(p, 23, 3, [NBZ]).filters[0].minutes).toBe(0);
  });
  it('M31 has HII knots: Ha for the knots only, no gate', () => {
    const p = emissionProfileFor('m31', 'galaxy') as EmissionProfile;
    expect(p.knotsOnly).toBe(true);
    expect(run(p, 24, 3, [HA7]).gate).toBe(false);
  });
  it('knots minutes (M33, M82) use the quick knee whatever the preset: about an hour, below the Rosette at Balanced, equal across balanced and deep', () => {
    for (const id of ['m33', 'm82']) {
      const p = emissionProfileFor(id, 'galaxy') as EmissionProfile;
      for (const bortle of [2, 4, 6, 8]) {
        const at = (knee: 'quick' | 'balanced' | 'deep') => run(p, 24, 3, [NBZ], { knee, bortle }).filters[0].minutes;
        const rosette = run(ROSETTE, 22, 3, [NBZ], { bortle }).filters[0].minutes;
        expect(at('balanced')).toBeGreaterThan(0);
        expect(at('balanced')).toBeLessThan(rosette);
        expect(at('deep')).toBe(at('balanced'));
        expect(at('quick')).toBe(at('balanced'));
        expect(at('balanced')).toBeLessThanOrEqual(75);
      }
    }
  });
});

describe('filters that cannot be judged', () => {
  it('lists unknown passbands and broadband filters as cannot judge, never with minutes', () => {
    const unknown: NbFilterInput = { id: 'u', name: 'Mystery filter' };
    const empty: NbFilterInput = { id: 'e', name: 'Empty bands', bands: [] };
    const lp: NbFilterInput = { id: 'lp', name: 'Light pollution', bands: [{ centreNm: 550, widthNm: 300 }] };
    const r = run(M42, 20, 2, [NBZ, unknown, empty, lp]);
    for (const id of ['u', 'e', 'lp']) {
      const f = r.filters.find((x) => x.filterId === id);
      expect(f?.verdict).toBe('cannot-judge');
      expect(f?.minutes).toBe(0);
      expect(f?.gain).toBeNull();
      expect(f?.reason).toMatch(/cannot judge/i);
    }
    expect(r.filters.find((x) => x.filterId === 'u')?.reason).toMatch(/passbands unknown/i);
    expect(mins(r).nbz).toBeGreaterThan(0);
  });
  it('lists them on a galaxy too', () => {
    const r = run(GALAXY, 23, 2, [{ id: 'u', name: 'Mystery filter' }]);
    expect(r.filters[0].verdict).toBe('cannot-judge');
  });
});

describe('the train: the ranking comes out of the maths, not a special case', () => {
  // A target that wants Ha almost alone, medium-faint (surface brightness 22), four hours of broadband.
  const HA_HEAVY = profile({ Ha: 1, OIII: 0.05, SII: 0.05, NII: 0.2 });
  const pair = [NBZ, HA7];
  it('at f/7 and f/10 the 7 nm H-alpha is the one recommended on a Ha target; at f/1.9 NBZ II is', () => {
    for (const f of [7, 10]) {
      const r = mins(run(HA_HEAVY, 22, 4, pair, { train: { fRatio: f, pixelUm: 3.76, focalLengthMm: 1000 } }));
      expect(r.ha7).toBeGreaterThan(0);
      expect(r.nbz).toBe(0);
    }
    const fast = mins(run(HA_HEAVY, 22, 4, pair, { train: { fRatio: 1.9, pixelUm: 3.76, focalLengthMm: 560 } }));
    expect(fast.nbz).toBeGreaterThan(0);
    expect(fast.ha7).toBe(0);
  });
  it('the 7 nm Ha band of the standard L-eXtreme loses light at f/2; the same filter rated for f/2 does not', () => {
    const at = (f: NbFilterInput) => run(HA_HEAVY, 22, 4, [f], { train: { fRatio: 2, pixelUm: 3.76, focalLengthMm: 560 } }).filters[0];
    const [plain, rated] = [at(LEX), at({ ...LEX, ratedMinFRatio: 2 })];
    expect(plain.basis.join(' ')).toMatch(/beam edge shifts/i);
    expect(rated.basis.join(' ')).not.toMatch(/beam edge shifts/i);
    expect(plain.beam?.fRatio).toBe(2);
    expect(plain.beam?.share).toBeGreaterThan(0);
    expect(plain.beam?.share).toBeLessThan(1);
    expect(rated.beam).toBeUndefined();
    expect(plain.lines[0].matchMin).toBeGreaterThan(rated.lines[0].matchMin);
    expect(plain.lines[0].gain).toBeLessThan(rated.lines[0].gain);
  });
  it('at f/7 nothing shifts, so the basis does not mention it', () => {
    const r = run(HA_HEAVY, 22, 4, [LEX], { train: { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1000 } }).filters[0];
    expect(r.basis.join(' ')).not.toMatch(/beam edge shifts/i);
    expect(r.beam).toBeUndefined();
  });
});

describe('single-band and dual-band filters share the lines', () => {
  it('a line goes to the filter whose band is clearly better, and the dual-band keeps the other line', () => {
    // A faint Rosette (surface brightness 23, six hours of broadband) at f/7: Ha is clearly better on a 3 nm band (a 7 nm one is only about 1.1 times better than NBZ II's 10 nm, under the 1.25 hurdle); OIII stays on NBZ II.
    const HA3: NbFilterInput = { id: 'ha7', name: 'Ha 3 nm', bands: [{ centreNm: 656.3, widthNm: 3 }] };
    const r = run(ROSETTE, 23, 6, [NBZ, HA3], { train: { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1000 } });
    const m = mins(r);
    expect(m.ha7).toBeGreaterThan(0);
    expect(m.nbz).toBeGreaterThan(0);
    expect(r.filters.find((f) => f.filterId === 'ha7')?.reason).toMatch(/Ha/);
    expect(r.filters.find((f) => f.filterId === 'nbz')?.detail).toMatch(/Ha goes to Ha 3 nm/);
  });
  it('a 7 nm Ha band is not worth a second filter beside NBZ II on Rosette: the gain is under the hurdle', () => {
    const r = run(ROSETTE, 22, 2, [NBZ, HA7], { train: { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1000 } });
    expect(mins(r).ha7).toBe(0);
    expect(mins(r).nbz).toBeGreaterThan(0);
  });
  it('every recommended filter says why and what is unverified', () => {
    for (const f of run(ROSETTE, 22, 2, [NBZ, NB3]).filters.filter((x) => x.minutes > 0)) {
      expect(f.reason).toMatch(/^Adds /);
      expect(f.detail?.length).toBeGreaterThan(10);
      expect(f.basis.join(' ')).toMatch(/centres and leakage not verified/);
      expect(f.basis.join(' ')).toMatch(/not measured/);
    }
  });
});

describe('the plan does not depend on the order the filters are listed', () => {
  const permutations = <T,>(xs: T[]): T[][] => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  const f7 = { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1960 };
  const stable = (r: NbResult): Record<string, unknown> =>
    Object.fromEntries(r.filters.map((f) => [f.filterId, [f.minutes, f.verdict, f.lines.map((l) => `${l.line}:${l.minutes}`), f.standaloneMin]]));

  it('Rosette at f/7, Bortle 4, B = 2 h: every order of the four filters gives the same 265-minute plan', () => {
    const results = permutations([NBZ, NB3, HA7, LEX]).map((order) => run(ROSETTE, 22, 2, order, { bortle: 4, train: f7 }));
    expect(results).toHaveLength(24);
    const want = stable(results[0]);
    for (const r of results) {
      expect(stable(r)).toEqual(want);
      expect(r.filters.reduce((t, f) => t + f.minutes, 0)).toBe(265);
    }
  });
  it('a filter that passes several needed lines at a comparable gain is preferred to splitting them across two dual-bands', () => {
    const m = mins(run(ROSETTE, 22, 2, [NBZ, NB3, HA7, LEX], { bortle: 4, train: f7 }));
    expect([m.nbz, m.lex].filter((x) => x > 0)).toHaveLength(1);
    expect(m.nb3).toBeGreaterThan(0);
  });
});

describe('a not-recommended filter’s reason is true for every line it passes', () => {
  const f7 = { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1960 };
  it('Rosette f/7, Bortle 6: no row says a line "would need under 30 min" when that line earns 30 min or more on its own', () => {
    let checked = 0;
    for (const mu of [22, 23, 24]) {
      for (const hours of [2, 2.38, 3]) {
        const r = run(ROSETTE, mu, hours, [NBZ, NB3, HA7, LEX], { bortle: 6, train: f7 });
        for (const f of r.filters) {
          if (f.verdict === 'recommend') continue;
          checked += 1;
          for (const l of f.standaloneLines.filter((x) => x.minutes >= 30)) {
            const sentence = (f.detail ?? '').split(/[;.]/).filter((part) => part.trim().startsWith(`${l.line} would need under 30 min`));
            expect(sentence).toEqual([]);
          }
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });
  it('a line goes to a filter that earns minutes for it: the NBZ II takes Ha (35 min), the L-eXtreme keeps OIII, and each reason is true', () => {
    const r = run(ROSETTE, 23, 2.38, [NBZ, NB3, HA7, LEX], { bortle: 6, train: f7 });
    const nbz = r.filters.find((f) => f.filterId === 'nbz');
    expect(nbz?.minutes).toBe(35);
    expect(nbz?.lines.map((l) => `${l.line}:${l.minutes}`)).toEqual(['Ha:35']);
    expect(nbz?.detail).toMatch(/OIII goes to Optolong L-eXtreme, which runs for it/);
  });
  it('every recommended row says "which runs for it" only of lines whose taker earns minutes, and gives the hurdle note for the rest', () => {
    let said = 0;
    const targets = [M42, ROSETTE, M57, profile({ Ha: 1 }, 0.9), profile({ Ha: 0.6, OIII: 1, SII: 0.5 }, 0.2)];
    for (const target of targets) for (const f of [1.9, 7, 10]) for (const mu of [21, 22, 23, 24]) for (const bortle of [4, 6, 8]) for (const hours of [1, 2, 3, 4]) {
      const r = run(target, mu, hours, [NBZ, NB3, HA7, LEX], { bortle, train: { fRatio: f, pixelUm: 3.76, focalLengthMm: f * 280 } });
      const lineMin = (L: string): number => Math.max(0, ...r.filters.flatMap((x) => x.lines.filter((l) => l.line === L).map((l) => l.minutes)));
      for (const x of r.filters.filter((y) => y.verdict === 'recommend')) {
        const m = /(\w[\w, and]*) goes to [^.]*, which runs for it/.exec(x.detail ?? '');
        if (m === null) continue;
        said += 1;
        for (const L of m[1].split(/, | and /)) expect([f, mu, bortle, hours, L, lineMin(L) > 0]).toEqual([f, mu, bortle, hours, L, true]);
      }
      for (const x of r.filters.filter((y) => y.verdict !== 'recommend')) {
        for (const l of x.standaloneLines.filter((y) => y.minutes >= 30)) expect(x.detail ?? '').not.toMatch(new RegExp(`(^|[;.] )${l.line} would need under 30 min`));
      }
    }
    expect(said).toBeGreaterThan(0);
  });
  it('a tie reads "the same as", not "1 times"', () => {
    for (const mu of [22, 23, 24]) for (const hours of [2, 2.38, 3]) for (const f of run(ROSETTE, mu, hours, [NBZ, NB3, HA7, LEX], { bortle: 6, train: f7 }).filters) expect(f.detail ?? '').not.toMatch(/\(1×\)/);
  });
});

describe('a line whose best taker earns nothing goes to a filter that earns minutes', () => {
  const permutations = <T,>(xs: T[]): T[][] => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  const stable = (r: NbResult): string => JSON.stringify(r.filters.map((f) => [f.filterId, f.minutes, f.lines.map((l) => `${l.line}:${l.minutes}`)]).sort());
  it('f/10 Rosette: NBZ II earns 30 min of Ha where the L-eXtreme earns none, so NBZ II takes Ha, in either gear order', () => {
    const train = { fRatio: 10, pixelUm: 3.76, focalLengthMm: 2800 };
    const rs = permutations([NBZ, LEX]).map((o) => run(ROSETTE, 21, 2, o, { bortle: 8, train }));
    for (const r of rs) {
      const m = mins(r);
      expect(r.filters.find((f) => f.filterId === 'nbz')?.lines.find((l) => l.line === 'Ha')?.minutes).toBe(30);
      expect(m.nbz).toBe(30);
      expect(m.lex).toBeGreaterThan(0);
    }
    expect(new Set(rs.map(stable)).size).toBe(1);
  });
  it('f/1.9 Rosette: H-alpha earns 30 min of Ha where NBZ II earns none, so the H-alpha takes Ha', () => {
    const train = { fRatio: 1.9, pixelUm: 3.76, focalLengthMm: 560 };
    const rs = permutations([NBZ, HA7]).map((o) => run(ROSETTE, 22, 1, o, { bortle: 6, train }));
    for (const r of rs) {
      expect(mins(r).ha7).toBe(30);
      expect(r.filters.find((f) => f.filterId === 'nbz')?.lines.map((l) => l.line)).toEqual(['OIII']);
    }
    expect(new Set(rs.map(stable)).size).toBe(1);
  });
});

describe('a filter that is not recommended', () => {
  const f7 = { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1960 };
  const r = run(ROSETTE, 22, 2, [NBZ, HA7], { bortle: 4, train: f7 });
  const ha7 = r.filters.find((f) => f.filterId === 'ha7');
  it('shows its own gain and its stand-alone minutes', () => {
    expect(ha7?.minutes).toBe(0);
    expect(ha7?.gain).toBeGreaterThan(0);
    expect(ha7?.standaloneMin).toBeGreaterThan(0);
    expect(ha7?.standaloneLines.map((l) => l.line)).toEqual(['Ha']);
  });
  it('says what the engine decided and never calls a weaker or equal filter better', () => {
    expect(ha7?.detail).toMatch(/Same as NBZ II for Ha \(1\.\d+×\)/);
    expect(ha7?.detail).not.toMatch(/better collected/);
  });
});

describe('a better filter that is not recommended', () => {
  it('says the filter that runs already covers the line, so the note is not read as "pick this one"', () => {
    const HA3: NbFilterInput = { id: 'ha3', name: 'Ha 3 nm', bands: [{ centreNm: 656.3, widthNm: 3 }] };
    const r = run(ROSETTE, 22, 2, [NBZ, HA3], { bortle: 4, train: { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1960 } });
    const f = r.filters.find((x) => x.filterId === 'ha3');
    expect(f?.minutes).toBe(0);
    expect(f?.detail).toMatch(/A little better than NBZ II for Ha \(1\.\d+×\); NBZ II already runs for it/);
  });
});

describe('the plan of the ticked filters', () => {
  const r = run(ROSETTE, 22, 2, [NBZ, HA7], { bortle: 4, train: { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1960 } });
  it('a line two ticked filters pass is counted once: the recommended one keeps it', () => {
    const plan = narrowbandPlan(r, new Set(['nbz', 'ha7']));
    expect(plan.map((p) => p.filterId)).toEqual(['nbz', 'ha7']);
    expect(plan[0].minutes).toBeGreaterThan(0);
    expect(plan[1]).toMatchObject({ minutes: 0, covered: ['Ha'] });
  });
  it('a filter chosen instead of the recommended one adds its own stand-alone minutes', () => {
    const plan = narrowbandPlan(r, new Set(['ha7']));
    expect(plan).toHaveLength(1);
    expect(plan[0].minutes).toBe(r.filters.find((f) => f.filterId === 'ha7')?.standaloneMin);
  });
  it('ticks NB3, NBZ and H-alpha on Rosette f/7 Bortle 4 give one plan in every gear order: the filter covering the most lines takes them', () => {
    const permutations = <T,>(xs: T[]): T[][] => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const f7 = { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1960 };
    const plans = permutations([NBZ, NB3, HA7, LEX]).map((order) => {
      const res = run(ROSETTE, 22, 2, order, { bortle: 4, train: f7 });
      const plan = narrowbandPlan(res, new Set(['nb3', 'nbz', 'ha7'])).map((p) => [p.filterId, p.minutes, p.lines, p.covered]);
      return JSON.stringify([...plan].sort());
    });
    expect(new Set(plans).size).toBe(1);
    const res = run(ROSETTE, 22, 2, [HA7, LEX, NBZ, NB3], { bortle: 4, train: f7 });
    expect(narrowbandPlan(res, new Set(['nb3', 'nbz', 'ha7'])).reduce((t, p) => t + p.minutes, 0)).toBe(265);
  });
  it('among filters that are not recommended, the one covering the most lines takes them regardless of order', () => {
    const f7 = { fRatio: 7, pixelUm: 3.76, focalLengthMm: 1960 };
    const totals = [[NBZ, HA7], [HA7, NBZ]].map((order) => {
      const res = run(ROSETTE, 22, 2, order, { bortle: 4, train: f7 });
      return JSON.stringify([...narrowbandPlan(res, new Set(['nbz', 'ha7'])).map((p) => [p.filterId, p.minutes])].sort());
    });
    expect(new Set(totals).size).toBe(1);
  });
  it('nothing ticked, nothing added', () => {
    expect(narrowbandPlan(r, new Set())).toEqual([]);
  });
});

describe('inputs', () => {
  it('minutes grow with nothing odd: whole multiples of 5, never between 1 and 29', () => {
    for (const h of [1, 2, 3, 4, 6]) {
      for (const f of run(ROSETTE, 22, h, [NBZ, NB3]).filters) {
        expect(f.minutes % 5).toBe(0);
        expect(f.minutes === 0 || f.minutes >= 30).toBe(true);
      }
    }
  });
  it('refuses a broadband time that is not a positive number, and a missing train number', () => {
    expect(() => run(M42, 20, 0, [NBZ])).toThrow(RangeError);
    expect(() => run(M42, 20, Number.NaN, [NBZ])).toThrow(RangeError);
    expect(() => run(M42, 20, 2, [NBZ], { train: { fRatio: 0, pixelUm: 3.76, focalLengthMm: 560 } })).toThrow(RangeError);
    expect(() => run(M42, 20, 2, [NBZ], { bortle: 12 })).toThrow(RangeError);
  });
  it('carries the profile confidence label and the knee cap', () => {
    const r = run(M42, 20, 2, [NBZ]);
    expect(r.confidence).toMatch(/Typical for this type/);
    expect(r.basis.join(' ')).toMatch(/signal-to-noise only/i);
  });
});
