import { EMISSION_LINES, LINE_MATCH_NM, lineNear } from './lines';
import { bandSums, bandText, bandsFromTexts, bandsLineNote, bandsToTexts, filledRows, formTexts, judgePassbands, withDerivedSums, sumsFollowBands, withoutBandRow } from './passbands';

const NBZ = [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }];
const problems = (raw: unknown): string => {
  const r = judgePassbands(raw);
  if ('bands' in r) throw new Error(`accepted ${JSON.stringify(raw)}`);
  return r.problems.join(' ');
};

describe('bandSums', () => {
  it('total and narrowest come from the bands, rounded the way the forms round', () => {
    expect(bandSums(NBZ)).toEqual({ passbandWidthNm: 17.5, narrowestBandNm: 8 });
    expect(bandSums([{ centreNm: 500, widthNm: 0.1 }, { centreNm: 700, widthNm: 0.2 }]).passbandWidthNm).toBe(0.3);
  });
});

describe('judgePassbands', () => {
  it('accepts 1 to 6 separate bands and keeps their order', () => {
    expect(judgePassbands(NBZ)).toEqual({ bands: NBZ });
    const six = [300, 400, 500, 600, 700, 800].map((c) => ({ centreNm: c + 300, widthNm: 20 }));
    expect('bands' in judgePassbands(six)).toBe(true);
  });
  it('bands that only touch are allowed', () => {
    expect('bands' in judgePassbands([{ centreNm: 600, widthNm: 400 }, { centreNm: 1000, widthNm: 400 }])).toBe(true);
  });
  it.each([
    ['NaN', [{ centreNm: NaN, widthNm: 9 }], /passband centre.*not a usable number/i],
    ['a string centre', [{ centreNm: '656', widthNm: 9 }], /passband centre/i],
    ['a string width', [{ centreNm: 656, widthNm: '9' }], /passband width/i],
    ['1e308 width', [{ centreNm: 656, widthNm: 1e308 }], /impossibly large/i],
    ['Infinity', [{ centreNm: Infinity, widthNm: 9 }], /passband centre/i],
    ['centre under the range', [{ centreNm: 299, widthNm: 9 }], /passband centre/i],
    ['centre over the range', [{ centreNm: 1101, widthNm: 9 }], /passband centre/i],
    ['zero width', [{ centreNm: 656, widthNm: 0 }], /passband width/i],
    ['not a list', { centreNm: 656, widthNm: 9 }, /list/i],
    ['a string', '656', /list/i],
    ['an item that is not an object', [5], /centre and a width/i],
    ['7 bands', Array.from({ length: 7 }, (_, i) => ({ centreNm: 400 + i * 100, widthNm: 10 })), /at most 6/i],
    ['100 bands', Array.from({ length: 100 }, (_, i) => ({ centreNm: 400 + i, widthNm: 0.5 })), /at most 6/i],
    ['a duplicate band', [{ centreNm: 656, widthNm: 9 }, { centreNm: 656, widthNm: 9 }], /overlap/i],
    ['overlapping bands', [{ centreNm: 656, widthNm: 20 }, { centreNm: 660, widthNm: 20 }], /overlap/i],
    ['width above the centre', [{ centreNm: 600, widthNm: 601 }], /wider than its own centre/i],
    ['edges outside the range', [{ centreNm: 305, widthNm: 250 }], /edges reach/i],
    ['total over 1000', [{ centreNm: 400, widthNm: 600 }, { centreNm: 1000, widthNm: 600 }], /total passband width: 1200 is outside/i],
  ] as const)('refuses %s in plain words', (_n, raw, re) => {
    const p = problems(raw);
    expect(p).toMatch(re);
    expect(p).not.toMatch(/Infinity|NaN|e\+\d/);
  });
  it('a __proto__ band key is never copied into a band', () => {
    const raw = JSON.parse('[{"centreNm":656,"widthNm":9,"__proto__":{"polluted":1}}]');
    const r = judgePassbands(raw);
    expect(r).toEqual({ bands: [{ centreNm: 656, widthNm: 9 }] });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('an empty list is no bands', () => {
    expect(judgePassbands([])).toEqual({ bands: [] });
  });
});

describe('emission lines', () => {
  it('holds Ha, OIII (two), Hb, SII (two) and NII (two) with a 3 nm match', () => {
    expect(EMISSION_LINES.map((l) => `${l.symbol} ${l.nm}`).sort()).toEqual(['Ha 656.3', 'Hb 486.1', 'NII 654.8', 'NII 658.4', 'OIII 495.9', 'OIII 500.7', 'SII 671.7', 'SII 673.1'].sort());
    expect(LINE_MATCH_NM).toBe(3);
  });
  it('names the nearest line within 3 nm, none beyond', () => {
    expect(lineNear(656)?.symbol).toBe('Ha');
    expect(lineNear(659)?.symbol).toBe('NII');
    expect(lineNear(651.8)?.symbol).toBe('NII'); // 3.0 nm from NII 654.8
    expect(lineNear(651.7)).toBeUndefined();
    expect(lineNear(498.3)?.nm).toBe(500.7); // a tie goes to the line listed first
    expect(lineNear(550)).toBeUndefined();
  });
});

describe('text of a band', () => {
  it('"Ha 656 nm, 10 nm wide" and no name when no line is near', () => {
    expect(bandText({ centreNm: 656, widthNm: 10 })).toBe('Ha 656 nm, 10 nm wide');
    expect(bandText({ centreNm: 550, widthNm: 100 })).toBe('550 nm, 100 nm wide');
    expect(bandText({ centreNm: 656.3, widthNm: 9.5 })).toBe('Ha 656.3 nm, 9.5 nm wide');
  });
  it('one plain line names every line a band is centred on', () => {
    expect(bandsLineNote(NBZ)).toBe('Centred near Ha (hydrogen-alpha, 656.3 nm) and OIII (doubly ionised oxygen, 500.7 nm).');
    expect(bandsLineNote([{ centreNm: 550, widthNm: 100 }])).toBe('');
  });
});

describe('band boxes', () => {
  it('round trip between bands and the twelve boxes', () => {
    const t = bandsToTexts(NBZ);
    expect(t).toMatchObject({ band1Centre: '656.3', band1Width: '9.5', band2Centre: '500.7', band2Width: '8', band3Centre: '', band6Width: '' });
    expect(bandsFromTexts(t)).toEqual({ bands: NBZ });
  });
  it('blank rows are no bands', () => {
    expect(bandsFromTexts(bandsToTexts([]))).toEqual({ bands: [] });
  });
  it('one box of a row blank is a plain problem naming the row', () => {
    expect(bandsFromTexts({ band2Centre: '500', band2Width: '' })).toEqual({ problem: 'Passband 2: enter both the centre and the width, or remove the row.' });
  });
  it.each([['abc'], ['NaN'], ['1e308'], ['Infinity'], ['-5'], ['0']])('%s in a width box is a plain problem', (v) => {
    const r = bandsFromTexts({ band1Centre: '656', band1Width: v });
    expect('problem' in r && r.problem).toMatch(/Passband 1 width/);
    expect('problem' in r && r.problem).not.toMatch(/e\+\d/);
  });
});

describe('band rows in the form', () => {
  it('filledRows counts to the last row that holds anything', () => {
    expect(filledRows(bandsToTexts([]))).toBe(0);
    expect(filledRows(bandsToTexts(NBZ))).toBe(2);
    expect(filledRows({ ...bandsToTexts([]), band4Width: '5' })).toBe(4);
  });
  it('the form keeps only the sums the user typed: a filter that has bands holds no sums of its own', () => {
    expect(formTexts({ ...bandsToTexts(NBZ), passbandWidthNm: '17.5', narrowestBandNm: '8' })).toMatchObject({ band1Centre: '656.3', passbandWidthNm: '', narrowestBandNm: '' });
    const typed = { ...bandsToTexts([]), passbandWidthNm: '50', narrowestBandNm: '15' };
    expect(formTexts(typed)).toEqual(typed);
  });
  it('the sums shown follow the bands whenever a band row holds anything: good bands give their sums, a half or bad row gives none; no rows give the typed sums', () => {
    expect(sumsFollowBands(bandsToTexts([]))).toBe(false);
    expect(sumsFollowBands({ ...bandsToTexts([]), band2Width: '3' })).toBe(true);
    expect(withDerivedSums({ ...bandsToTexts(NBZ), passbandWidthNm: '50', narrowestBandNm: '15' })).toMatchObject({ passbandWidthNm: '17.5', narrowestBandNm: '8' });
    expect(withDerivedSums({ ...bandsToTexts(NBZ), band2Width: '', passbandWidthNm: '50', narrowestBandNm: '15' })).toMatchObject({ passbandWidthNm: '', narrowestBandNm: '' });
    expect(withDerivedSums({ ...bandsToTexts(NBZ), band2Width: 'abc', passbandWidthNm: '', narrowestBandNm: '' })).toMatchObject({ passbandWidthNm: '', narrowestBandNm: '' });
    const typed = { ...bandsToTexts([]), passbandWidthNm: '50', narrowestBandNm: '15' };
    expect(withDerivedSums(typed)).toEqual(typed);
    expect(withDerivedSums({ ...bandsToTexts([]), passbandWidthNm: '', narrowestBandNm: '' })).toMatchObject({ passbandWidthNm: '', narrowestBandNm: '' });
  });
  it('removing a row moves the later rows up and leaves the typed sums alone; the shown sums follow the rows left', () => {
    const three = bandsToTexts([{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }, { centreNm: 672, widthNm: 19 }]);
    const t = withoutBandRow({ ...three, passbandWidthNm: '', narrowestBandNm: '' }, 1);
    expect(t).toMatchObject({ band1Centre: '500.7', band1Width: '8', band2Centre: '672', band2Width: '19', band3Centre: '', band3Width: '', passbandWidthNm: '', narrowestBandNm: '' });
    expect(withDerivedSums(t)).toMatchObject({ passbandWidthNm: '27', narrowestBandNm: '8' });
    expect(withoutBandRow(three, 6)).toMatchObject(three);
  });
  it('the last band gone by any route leaves the sums the user had before bands, or none, never a band\'s width', () => {
    const one = formTexts({ ...bandsToTexts([{ centreNm: 656.3, widthNm: 9.5 }]), passbandWidthNm: '9.5', narrowestBandNm: '9.5' });
    expect(withDerivedSums(withoutBandRow(one, 1))).toMatchObject({ band1Centre: '', passbandWidthNm: '', narrowestBandNm: '' });
    expect(withDerivedSums({ ...one, band1Centre: '', band1Width: '' })).toMatchObject({ passbandWidthNm: '', narrowestBandNm: '' });
    expect(withDerivedSums(withoutBandRow({ ...one, band1Width: '' }, 1))).toMatchObject({ passbandWidthNm: '', narrowestBandNm: '' });
    const own = { ...bandsToTexts([{ centreNm: 656.3, widthNm: 7 }]), passbandWidthNm: '50', narrowestBandNm: '15' };
    expect(withDerivedSums(own)).toMatchObject({ passbandWidthNm: '7', narrowestBandNm: '7' });
    expect(withDerivedSums(withoutBandRow(own, 1))).toMatchObject({ passbandWidthNm: '50', narrowestBandNm: '15' });
  });
});
