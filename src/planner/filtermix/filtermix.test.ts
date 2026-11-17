import { emissionProfileFor } from '../catalog/emission';
import type { EmissionProfile } from '../catalog/emission';
import { BROADBAND_KEEP, filterMix, mixSummary } from './index';
import type { MixFilter, MixLine, MixResult } from './index';

const NBZ: MixFilter = { id: 'nbz', name: 'NBZ II', bands: [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }] };
const NB3: MixFilter = { id: 'nb3', name: 'NB3-PM', bands: [{ centreNm: 672, widthNm: 19 }, { centreNm: 500.7, widthNm: 21 }] };
const DUO: MixFilter = { id: 'duo', name: 'Duo-Band', bands: [{ centreNm: 656.3, widthNm: 15 }, { centreNm: 500.7, widthNm: 35 }] };
const LPARA: MixFilter = { id: 'lpara', name: 'L-Para', bands: [{ centreNm: 656.3, widthNm: 10 }, { centreNm: 500.7, widthNm: 10 }] };
const NOBANDS: MixFilter = { id: 'nb', name: 'Mystery filter' };

const profile = (id: string, type: string): EmissionProfile => emissionProfileFor(id, type) as EmissionProfile;
const M42 = profile('m42', 'nebula');
const M57 = profile('ngc6720', 'planetary-nebula');
const VEIL = profile('ngc6960', 'supernova-remnant');
const M31 = profile('m31', 'galaxy');
const CALIFORNIA = profile('ngc1499', 'nebula');
const HOURS = 120;

const mix = (p: EmissionProfile, filters: MixFilter[], minutes = HOURS): Extract<MixResult, { kind: 'mix' }> => {
  const r = filterMix({ profile: p, filters, minutes });
  if (r.kind !== 'mix') throw new Error(`expected a mix, got: ${r.message}`);
  return r;
};
const of = (r: Extract<MixResult, { kind: 'mix' }>, name: string): MixLine => r.lines.find((l) => l.name === name) as MixLine;
const sum = (r: Extract<MixResult, { kind: 'mix' }>): number => r.lines.reduce((t, l) => t + l.minutes, 0);

describe('research example cases', () => {
  it('M42 with NB3-PM adds only OIII (SII is too weak)', () => {
    const r = mix(M42, [NB3]);
    const l = of(r, 'NB3-PM');
    expect(l.verdict).toBe('adds');
    expect(l.adds).toEqual(['OIII']);
    expect(l.reason).toMatch(/Adds OIII/);
    expect(l.reason).toMatch(/SII is too weak here/);
    expect(l.minutes).toBe(HOURS);
    expect(r.uncovered).toEqual(['Ha']);
  });

  it('M57 with Ha/OIII adds nothing beyond OIII/SII', () => {
    for (const order of [[DUO, NB3], [NB3, DUO]]) {
      const r = mix(M57, order);
      expect(of(r, 'NB3-PM').verdict).toBe('adds');
      const duo = of(r, 'Duo-Band');
      expect(duo.verdict).toBe('covered');
      expect(duo.coveredBy).toEqual(['NB3-PM']);
      expect(duo.reason).toMatch(/covered by NB3-PM/);
      expect(duo.minutes).toBe(0);
      expect(of(r, 'NB3-PM').minutes).toBe(HOURS);
    }
  });

  it('Veil with NB3-PM adds SII (and OIII when it is alone); with NBZ II it is SII only', () => {
    const alone = of(mix(VEIL, [NB3]), 'NB3-PM');
    expect(alone.adds).toEqual(['OIII', 'SII']);
    const both = mix(VEIL, [NBZ, NB3]);
    expect(of(both, 'NB3-PM').adds).toEqual(['SII']);
    expect(of(both, 'NB3-PM').shared).toEqual(['OIII']);
    expect(of(both, 'NBZ II').adds).toEqual(['Ha', 'OIII']);
    expect(of(both, 'NB3-PM').minutes).toBeGreaterThan(0);
  });

  it('M31 with any narrowband filter returns the gate message and gives all light to broadband', () => {
    for (const f of [NBZ, NB3, DUO]) {
      const r = mix(M31, [f]);
      expect(r.headline).toMatch(/almost no emission light, so narrowband filters add nothing/);
      expect(r.lines[0]).toMatchObject({ verdict: 'broadband', minutes: HOURS });
      expect(of(r, f.name)).toMatchObject({ verdict: 'gate', minutes: 0 });
      expect(sum(r)).toBe(HOURS);
    }
  });

  it('NBZ II plus NB3-PM on NGC 1499 flags "OIII shared, SII new"', () => {
    const r = mix(CALIFORNIA, [NBZ, NB3]);
    const nb3 = of(r, 'NB3-PM');
    expect(nb3.reason).toContain('OIII shared, SII new');
    expect(nb3.adds).toEqual(['SII']);
    expect(nb3.shared).toEqual(['OIII']);
    expect(of(r, 'NBZ II').adds).toEqual(['Ha']);
    expect(sum(r)).toBe(HOURS);
  });
});

describe('rules', () => {
  it('line need: a line under the floor is not needed, one over it is', () => {
    const r = mix(M42, [NB3, NBZ]);
    expect(r.needed).toEqual(['Ha', 'OIII']);
    const veil = mix(VEIL, [NB3]);
    expect(veil.needed).toEqual(['Ha', 'OIII', 'SII']);
  });

  it('adds contrast only: the same lines through a clearly narrower band are useful and labelled, not redundant', () => {
    const haTight: MixFilter = { id: 'a', name: 'Ha tight', bands: [{ centreNm: 656.3, widthNm: 8 }, { centreNm: 500.7, widthNm: 35 }] };
    const oTight: MixFilter = { id: 'b', name: 'OIII tight', bands: [{ centreNm: 656.3, widthNm: 15 }, { centreNm: 500.7, widthNm: 8 }] };
    for (const order of [[haTight, oTight], [oTight, haTight]]) {
      const r = mix(M42, order);
      expect(of(r, 'OIII tight').verdict).toBe('adds');
      const l = of(r, 'Ha tight');
      expect(l.verdict).toBe('contrast');
      expect(l.reason).toMatch(/better contrast per hour/);
      expect(l.reason).toMatch(/Ha band 8 nm against 15 nm/);
      expect(l.coveredBy).toEqual(['OIII tight']);
      expect(l.minutes).toBeGreaterThan(0);
      expect(of(r, 'OIII tight').minutes).toBeGreaterThan(0);
      expect(sum(r)).toBe(HOURS);
    }
    // A band only a little narrower says so.
    const little: MixFilter = { id: 'c', name: 'Little', bands: [{ centreNm: 656.3, widthNm: 12 }, { centreNm: 500.7, widthNm: 35 }] };
    expect(of(mix(M42, [oTight, little]), 'Little').reason).toMatch(/a little better contrast/);
  });

  it('the wider of two filters on the same lines is the one that adds nothing, whatever the order', () => {
    for (const order of [[DUO, LPARA], [LPARA, DUO]]) {
      const r = mix(M42, order);
      expect(of(r, 'L-Para').verdict).toBe('adds');
      expect(of(r, 'Duo-Band')).toMatchObject({ verdict: 'covered', coveredBy: ['L-Para'], minutes: 0 });
    }
  });

  it('adds nothing when the other band is wider on the same lines', () => {
    const r = mix(M42, [NBZ, DUO]);
    expect(of(r, 'NBZ II').verdict).toBe('adds');
    expect(of(r, 'Duo-Band').verdict).toBe('covered');
    expect(of(r, 'Duo-Band').reason).toMatch(/covered by NBZ II/);
  });

  it('a filter that passes no needed line adds nothing and says why', () => {
    const r = mix(CALIFORNIA, [{ id: 'o3', name: 'OIII only', bands: [{ centreNm: 500.7, widthNm: 6 }] }]);
    const l = of(r, 'OIII only');
    expect(l.verdict).toBe('no-need');
    expect(l.reason).toMatch(/passes no line this target needs/);
    expect(l.reason).toMatch(/OIII is too weak here/);
    // All the light goes to broadband.
    expect(r.lines[0]).toMatchObject({ verdict: 'broadband', minutes: HOURS });
  });

  it('a filter that passes none of the three lines says so', () => {
    const r = mix(M42, [{ id: 'x', name: 'Violet', bands: [{ centreNm: 420, widthNm: 20 }] }]);
    expect(of(r, 'Violet').reason).toMatch(/passes none of Ha, OIII or SII/);
  });

  it('hours split: never double counted, narrower band takes more of a shared line, sums exactly', () => {
    const r = mix(VEIL, [NBZ, NB3], 181);
    expect(sum(r)).toBe(181);
    for (const l of r.lines) expect(Number.isInteger(l.minutes) && l.minutes >= 0).toBe(true);
    // A line is counted once: NBZ II (Ha+OIII) and NB3-PM (SII, OIII shared) both earn hours.
    expect(of(r, 'NBZ II').minutes).toBeGreaterThan(of(r, 'NB3-PM').minutes);
  });

  it('hours are within the light given, for every small total', () => {
    for (let m = 1; m <= 40; m++) {
      for (const filters of [[NBZ], [NB3], [NBZ, NB3], [DUO, LPARA, NB3], [NBZ, NOBANDS]]) {
        for (const p of [M42, M57, VEIL, CALIFORNIA, M31]) {
          const r = filterMix({ profile: p, filters, minutes: m });
          if (r.kind !== 'mix') continue;
          expect(r.lines.reduce((t, l) => t + l.minutes, 0)).toBe(m);
          expect(r.availableMin).toBe(m);
        }
      }
    }
  });

  it('Ha band NII note: the Ha band here mostly passes nitrogen', () => {
    const r = mix(M57, [NBZ]);
    expect(r.haMostlyNii).toBe(true);
    expect(of(r, 'NBZ II').reason).toMatch(/mostly passes nitrogen \(NII\), not hydrogen/);
    expect(mix(M42, [NBZ]).haMostlyNii).toBe(false);
    expect(of(mix(M42, [NBZ]), 'NBZ II').reason).not.toMatch(/nitrogen/);
  });

  it('continuum keeps a broadband slot and narrowband gets only what is left', () => {
    const hii: EmissionProfile = { lines: { Ha: 1, OIII: 0.3, SII: 0.15 }, continuum: 0.9, source: 'test', confidence: 'amateur' };
    expect(0.9).toBeGreaterThanOrEqual(BROADBAND_KEEP);
    const r = mix(hii, [NBZ, NB3], 100);
    expect(r.lines[0]).toMatchObject({ verdict: 'broadband', minutes: 90 });
    expect(r.lines[0].reason).toMatch(/broadband slot stays/);
    expect(sum(r)).toBe(100);
    // A narrowband hour drops out when no needed line is passed.
    const none = mix(hii, [{ id: 'hb', name: 'Hb only', bands: [{ centreNm: 486.1, widthNm: 8 }] }], 100);
    expect(none.lines[0]).toMatchObject({ verdict: 'broadband', minutes: 100 });
    // An emission nebula (low continuum) keeps no broadband slot while a filter earns.
    expect(mix(M42, [NB3]).lines.some((l) => l.verdict === 'broadband')).toBe(false);
  });

  it('a broadband filter takes the broadband slot', () => {
    const lp: MixFilter = { id: 'lp', name: 'Light pollution cut', bands: [{ centreNm: 550, widthNm: 200 }] };
    const r = mix(M42, [lp, NB3]);
    expect(of(r, 'NB3-PM').verdict).toBe('adds');
    expect(r.lines.filter((l) => l.verdict === 'broadband')).toHaveLength(0);
    const gate = mix(M31, [lp, NB3]);
    expect(gate.lines[0].name).toBe('Broadband (Light pollution cut)');
    expect(gate.lines[0].minutes).toBe(HOURS);
  });

  it('confidence label: a type default says typical, not measured; a measured one names its source', () => {
    expect(mix(profile('ngc7822', 'nebula'), [NB3]).confidence).toBe('Typical for this type, not measured');
    expect(mix(M42, [NB3]).confidence).toMatch(/^Measured \(Sanchez/);
    expect(mix(CALIFORNIA, [NB3]).confidence).toMatch(/^Amateur reports, not measured/);
  });

  it('a measured override changes the verdict a type default would give', () => {
    const typeDefault = profile('ngc7822', 'nebula');
    expect(of(mix(typeDefault, [NB3]), 'NB3-PM').adds).toEqual(['OIII', 'SII']);
    expect(of(mix(M42, [NB3]), 'NB3-PM').adds).toEqual(['OIII']);
  });
});

describe('nothing to split, and filters it cannot use', () => {
  it('a filter without bands is named and skipped', () => {
    const r = mix(M42, [NOBANDS, NB3]);
    const l = of(r, 'Mystery filter');
    expect(l).toMatchObject({ verdict: 'skipped', minutes: 0 });
    expect(l.reason).toBe('Unknown passband, not used in the mix. Add its passbands in Gear.');
    expect(of(r, 'NB3-PM').minutes).toBe(HOURS);
    expect(sum(r)).toBe(HOURS);
  });

  it('only filters without bands: a message, the filter named, no hours', () => {
    const r = filterMix({ profile: M42, filters: [NOBANDS], minutes: HOURS });
    expect(r.kind).toBe('none');
    if (r.kind === 'none') {
      expect(r.message).toMatch(/No selected filter has known passbands/);
      expect(r.skipped.map((l) => l.name)).toEqual(['Mystery filter']);
    }
  });

  it('no filters, no light, a bad profile', () => {
    expect(filterMix({ profile: M42, filters: [], minutes: HOURS })).toMatchObject({ kind: 'none', message: expect.stringMatching(/No filter is selected in the setup/) });
    for (const minutes of [0, -5, Number.NaN, Infinity]) expect(filterMix({ profile: M42, filters: [NB3], minutes })).toMatchObject({ kind: 'none', message: expect.stringMatching(/no planned light/) });
    expect(filterMix({ profile: { ...M42, continuum: 7 }, filters: [NB3], minutes: HOURS })).toMatchObject({ kind: 'none', message: expect.stringMatching(/no usable emission profile/) });
  });

  it('never prints NaN, Infinity, undefined, null or an exponent', () => {
    for (const p of [M42, M57, VEIL, CALIFORNIA, M31, profile('ngc7822', 'nebula')]) {
      for (const filters of [[NBZ], [NB3], [NBZ, NB3], [DUO, LPARA], [NOBANDS], [NBZ, NOBANDS, NB3]]) {
        const r = filterMix({ profile: p, filters, minutes: 137 });
        const text = JSON.stringify(r, (k, v) => (v === null ? '' : v));
        expect(text).not.toMatch(/NaN|Infinity|undefined|e\+\d|e-\d/);
        if (r.kind === 'mix') expect(mixSummary('X', r, (m) => `${m} min`)).not.toMatch(/NaN|Infinity|undefined|null|e\+\d/);
      }
    }
  });

  it('the summary line names each filter, its hours and the confidence', () => {
    const r = mix(M42, [NBZ, NB3], 120);
    const text = mixSummary('M42', r, (m) => `${m} min`);
    expect(text).toMatch(/^M42 \(120 min of light\): /);
    expect(text).toMatch(/NBZ II \d+ min \(adds Ha and OIII\)/);
    expect(text).toMatch(/NB3-PM 0 min \(covered by NBZ II\)/);
    expect(text).toMatch(/Measured \(Sanchez/);
  });
});
