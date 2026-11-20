import { WIDE_PAIR } from './wide-pair.fixture'
import { SEED_ENTRIES } from './seed'
import { BAND_BOX_KEYS } from '../profile/passbands'
import { correctableKeys, isEdited, labelOf, libraryClassOf, specsToTexts, textsToSpecs } from './form'

describe('libraryClassOf', () => {
  it('maps the gear lists that have a library class', () => {
    expect(libraryClassOf('filters')).toBe('filter')
    expect(libraryClassOf('cameras')).toBe('camera')
    expect(libraryClassOf('scopes')).toBe('scope')
    for (const l of ['smartScopes', 'accessories', 'sites'] as const) expect(libraryClassOf(l)).toBeNull()
  })
})

describe('specsToTexts', () => {
  it('filter: kind, size, the band boxes, total and narrowest band, and a notes line with the glass and the notes', () => {
    const t = specsToTexts('filters', { type: 'dual-band', passbands: [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }], sizeMm: 36, glassMm: 2, notes: 'f/2 optimized' })
    expect(t).toMatchObject({ kind: 'dual-band', sizeMm: '36', passbandWidthNm: '17.5', narrowestBandNm: '8' })
    expect(t).toMatchObject({ band1Centre: '656.3', band1Width: '9.5', band2Centre: '500.7', band2Width: '8' })
    expect(t.band3Centre).toBeUndefined()
    expect(t.bandpassNotes).toBe('glass 2 mm. f/2 optimized')
  })
  it('camera: numbers, yes/no, class', () => {
    expect(specsToTexts('cameras', { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176, hasUvIrCut: false, readNoiseClass: 'low' })).toEqual({ pixelSizeUm: '3.76', sensorWidthPx: '6248', sensorHeightPx: '4176', hasUvIrCut: 'no', readNoiseClass: 'low' })
  })
  it('camera: the recommended gain is a box', () => {
    expect(specsToTexts('cameras', { pixelSizeUm: 3, recommendedGain: 100 })).toEqual({ pixelSizeUm: '3', recommendedGain: '100' })
    expect(correctableKeys('cameras')).toContain('recommendedGain')
  })
  it('scope: aperture and focal length only (the f-number is derived)', () => {
    expect(specsToTexts('scopes', { apertureMm: 80, focalLengthMm: 480, fNumber: 6 })).toEqual({ apertureMm: '80', focalLengthMm: '480' })
  })
  it('leaves out what the specs do not hold', () => {
    expect(specsToTexts('cameras', { pixelSizeUm: 3 })).toEqual({ pixelSizeUm: '3' })
  })
})

describe('correctable keys and isEdited', () => {
  it('lists the boxes a correction can carry', () => {
    expect(correctableKeys('filters')).toEqual(['kind', 'sizeMm', ...BAND_BOX_KEYS])
    expect(correctableKeys('scopes')).toEqual(['focalLengthMm', 'apertureMm'])
  })
  it('a box changed from the library value is an edit; spacing and number format are not', () => {
    const specs = { apertureMm: 80, focalLengthMm: 480 }
    const base = { apertureMm: '80', focalLengthMm: '480' }
    expect(isEdited('scopes', specs, base)).toBe(false)
    expect(isEdited('scopes', specs, { ...base, apertureMm: ' 80.0 ' })).toBe(false)
    expect(isEdited('scopes', specs, { ...base, apertureMm: '81' })).toBe(true)
    expect(isEdited('scopes', specs, { ...base, apertureMm: '' })).toBe(true)
    expect(isEdited('scopes', specs, { ...base, apertureMm: 'abc' })).toBe(true)
  })
  it('a box the library does not hold, left empty, is not an edit; filled, it is', () => {
    expect(isEdited('cameras', { pixelSizeUm: 3 }, { pixelSizeUm: '3', sensorWidthPx: '' })).toBe(false)
    expect(isEdited('cameras', { pixelSizeUm: 3 }, { pixelSizeUm: '3', sensorWidthPx: '4000' })).toBe(true)
  })
})

describe('textsToSpecs', () => {
  it('camera gain: a whole number in range is carried; out of range or fractional is refused in plain words; empty removes it', () => {
    expect(textsToSpecs('cameras', { pixelSizeUm: '3', recommendedGain: '120' }, {})).toEqual({ specs: { pixelSizeUm: 3, recommendedGain: 120 } })
    expect(textsToSpecs('cameras', { pixelSizeUm: '3', recommendedGain: '' }, { pixelSizeUm: 3, recommendedGain: 120 })).toEqual({ specs: { pixelSizeUm: 3 } })
    const high = textsToSpecs('cameras', { recommendedGain: '5000' }, {})
    expect('problem' in high && high.problem).toMatch(/Recommended gain.*between 0 and 1,000/)
    const frac = textsToSpecs('cameras', { recommendedGain: '10.5' }, {})
    expect('problem' in frac && frac.problem).toMatch(/whole number/)
  })
  it('carries what the form has no box for and takes the boxes', () => {
    const base = { type: 'dual-band' as const, passbands: [{ centreNm: 656.3, widthNm: 9.5 }], glassMm: 2, sizeMm: 36, notes: 'n' }
    const r = textsToSpecs('filters', { kind: 'narrowband', sizeMm: '50' }, base)
    expect(r).toEqual({ specs: { type: 'narrowband', passbands: [{ centreNm: 656.3, widthNm: 9.5 }], glassMm: 2, sizeMm: 50, notes: 'n' } })
  })
  it('an emptied box removes that value', () => {
    expect(textsToSpecs('cameras', { pixelSizeUm: '3', sensorWidthPx: '' }, { pixelSizeUm: 3, sensorWidthPx: 4000 })).toEqual({ specs: { pixelSizeUm: 3 } })
  })
  it('scope: the f-number follows the two boxes', () => {
    expect(textsToSpecs('scopes', { apertureMm: '100', focalLengthMm: '700' }, { apertureMm: 80, focalLengthMm: 480, fNumber: 6 })).toEqual({ specs: { apertureMm: 100, focalLengthMm: 700, fNumber: 7 } })
    expect(textsToSpecs('scopes', { apertureMm: '100', focalLengthMm: '' }, { apertureMm: 80, focalLengthMm: 480, fNumber: 6 })).toEqual({ specs: { apertureMm: 100 } })
  })
  it.each([['999999'], ['abc'], ['-5'], ['1e308'], ['NaN']])('%s in a number box is a plain problem, not specs', (v) => {
    const r = textsToSpecs('scopes', { apertureMm: v, focalLengthMm: '480' }, { apertureMm: 80 })
    expect('problem' in r && /aperture/i.test(r.problem)).toBe(true)
  })
  it('all boxes empty is a problem', () => {
    expect('problem' in textsToSpecs('scopes', { apertureMm: '', focalLengthMm: '' }, {})).toBe(true)
  })
})

describe('the form path judges the same derived values', () => {
  it('a correction built on the Wide Pair is refused in plain words, and no box is ever filled from it', () => {
    const r = textsToSpecs('filters', { kind: 'narrowband' }, WIDE_PAIR as never)
    expect('problem' in r && r.problem).toMatch(/Total passband width: 1200 is outside the allowed range/)
  })
  it('a fraction in a whole-number box says "not a whole number" before any range message', () => {
    const r = textsToSpecs('cameras', { sensorWidthPx: '4144.5' }, {})
    expect('problem' in r && r.problem).toBe('Sensor width: 4144.5 is not a whole number. Enter a whole number for the sensor width between 100 and 20,000 px.')
    const big = textsToSpecs('cameras', { sensorWidthPx: '99999.5' }, {})
    expect('problem' in big && big.problem).toMatch(/not a whole number/)
  })
  it('the biggest allowed filter (1,000 nm in total) fills boxes inside their ranges', () => {
    const t = specsToTexts('filters', { passbands: [{ centreNm: 600, widthNm: 400 }, { centreNm: 1000, widthNm: 400 }] })
    expect(Number(t.passbandWidthNm)).toBeLessThanOrEqual(1000)
    expect(Number(t.narrowestBandNm)).toBeGreaterThanOrEqual(0.1)
  })
})

describe('passbands in the form path', () => {
  const NBZ = [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }]
  it('a changed band box is an edit; the same numbers in another format are not', () => {
    const specs = { passbands: NBZ }
    const base = specsToTexts('filters', specs)
    expect(isEdited('filters', specs, base)).toBe(false)
    expect(isEdited('filters', specs, { ...base, band1Width: ' 9.50 ' })).toBe(false)
    expect(isEdited('filters', specs, { ...base, band1Width: '10' })).toBe(true)
    expect(isEdited('filters', specs, { ...base, band3Centre: '672', band3Width: '19' })).toBe(true)
    expect(isEdited('filters', specs, { ...base, band2Centre: '', band2Width: '' })).toBe(true)
    expect(isEdited('filters', specs, { ...base, band2Width: '99' }, ['band2Width'])).toBe(false)
  })
  it('a correction takes the band boxes: edits, additions and removals', () => {
    const base = { type: 'dual-band' as const, passbands: NBZ, glassMm: 2 }
    const t = specsToTexts('filters', base)
    expect(textsToSpecs('filters', { ...t, band1Width: '12' }, base)).toEqual({ specs: { type: 'dual-band', passbands: [{ centreNm: 656.3, widthNm: 12 }, NBZ[1]], glassMm: 2 } })
    expect(textsToSpecs('filters', { ...t, band2Centre: '', band2Width: '' }, base)).toEqual({ specs: { type: 'dual-band', passbands: [NBZ[0]], glassMm: 2 } })
    const none = textsToSpecs('filters', { ...t, band1Centre: '', band1Width: '', band2Centre: '', band2Width: '' }, base)
    expect(none).toEqual({ specs: { type: 'dual-band', glassMm: 2 } })
  })
  it('a hostile or inconsistent band box is a plain problem, never specs', () => {
    const base = { passbands: NBZ }
    const t = specsToTexts('filters', base)
    for (const v of ['NaN', 'abc', '1e308', '-1', '0']) {
      const r = textsToSpecs('filters', { ...t, band1Width: v }, base)
      expect('problem' in r && r.problem).toMatch(/Passband 1 width/)
    }
    expect('problem' in textsToSpecs('filters', { ...t, band2Centre: '656', band2Width: '9' }, base)).toBe(true) // overlaps band 1
    expect('problem' in textsToSpecs('filters', { ...t, band2Width: '' }, base)).toBe(true) // a half row
  })
  it('a caller without band boxes keeps the entry bands (the boxes are not in its form)', () => {
    expect(textsToSpecs('filters', { kind: 'narrowband' }, { passbands: NBZ })).toEqual({ specs: { type: 'narrowband', passbands: NBZ } })
  })
  it('the labels of the band boxes read plain', () => {
    expect(labelOf('band2Centre')).toBe('Passband 2 centre')
    expect(labelOf('band6Width')).toBe('Passband 6 width')
  })
})

describe('the seed filters', () => {
  it.each(SEED_ENTRIES.map((e) => [e.name, e] as const))('a lookup of %s fills the band boxes and the totals, and the boxes read back to the same bands', (_n, e) => {
    const t = specsToTexts('filters', e.specs)
    const bands = (e.specs as { passbands: { centreNm: number; widthNm: number }[] }).passbands
    expect(bands.length).toBeGreaterThanOrEqual(1)
    expect(t.band1Centre).toBe(String(bands[0].centreNm))
    if (bands.length > 1) expect(t.band2Width).toBe(String(bands[1].widthNm))
    expect(Number(t.passbandWidthNm)).toBe(bands.reduce((sum, b) => sum + b.widthNm, 0))
    const back = textsToSpecs('filters', t, e.specs)
    expect('specs' in back && (back.specs as { passbands: unknown }).passbands).toEqual(bands)
  })
})
