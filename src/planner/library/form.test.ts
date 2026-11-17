import { correctableKeys, isEdited, libraryClassOf, specsToTexts, textsToSpecs } from './form'

describe('libraryClassOf', () => {
  it('maps the gear lists that have a library class', () => {
    expect(libraryClassOf('filters')).toBe('filter')
    expect(libraryClassOf('cameras')).toBe('camera')
    expect(libraryClassOf('scopes')).toBe('scope')
    for (const l of ['smartScopes', 'accessories', 'sites'] as const) expect(libraryClassOf(l)).toBeNull()
  })
})

describe('specsToTexts', () => {
  it('filter: kind, size, total and narrowest band, and a notes line with every passband', () => {
    const t = specsToTexts('filters', { type: 'dual-band', passbands: [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }], sizeMm: 36, glassMm: 2, notes: 'f/2 optimized' })
    expect(t).toMatchObject({ kind: 'dual-band', sizeMm: '36', passbandWidthNm: '17.5', narrowestBandNm: '8' })
    expect(t.bandpassNotes).toBe('656.3 nm (9.5 nm wide), 500.7 nm (8 nm wide), glass 2 mm. f/2 optimized')
  })
  it('camera: numbers, yes/no, class', () => {
    expect(specsToTexts('cameras', { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176, hasUvIrCut: false, readNoiseClass: 'low' })).toEqual({ pixelSizeUm: '3.76', sensorWidthPx: '6248', sensorHeightPx: '4176', hasUvIrCut: 'no', readNoiseClass: 'low' })
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
    expect(correctableKeys('filters')).toEqual(['kind', 'sizeMm'])
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
