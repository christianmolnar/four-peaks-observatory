import { LIST_SPECS } from '../state/edit'
import { cleanName, FILTER_KINDS, nameKey, parseEntry, validateSpecs } from './specs'

const ok = (cls: Parameters<typeof validateSpecs>[0], raw: unknown) => {
  const r = validateSpecs(cls, raw)
  if ('problems' in r) throw new Error(r.problems.join('; '))
  return r.specs
}
const bad = (cls: Parameters<typeof validateSpecs>[0], raw: unknown): string => {
  const r = validateSpecs(cls, raw)
  if (!('problems' in r)) throw new Error(`accepted ${JSON.stringify(raw)}`)
  return r.problems.join(' ')
}

describe('validateSpecs accepts real values', () => {
  it('filter: type, passbands, size, glass, notes', () => {
    const s = ok('filter', { type: 'dual-band', passbands: [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }], sizeMm: 36, glassMm: 2, notes: 'f/2 optimized' })
    expect(s).toEqual({ type: 'dual-band', passbands: [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }], sizeMm: 36, glassMm: 2, notes: 'f/2 optimized' })
  })
  it('camera and scope', () => {
    expect(ok('camera', { sensorWidthPx: 6248, sensorHeightPx: 4176, pixelSizeUm: 3.76, readNoiseClass: 'low', hasUvIrCut: false })).toEqual({ sensorWidthPx: 6248, sensorHeightPx: 4176, pixelSizeUm: 3.76, readNoiseClass: 'low', hasUvIrCut: false })
    expect(ok('scope', { apertureMm: 280, focalLengthMm: 2800, fNumber: 10 })).toEqual({ apertureMm: 280, focalLengthMm: 2800, fNumber: 10 })
  })
  it('null means unknown and is dropped; extra and prototype keys are dropped, never copied', () => {
    const raw = JSON.parse('{"apertureMm":80,"focalLengthMm":null,"colour":true,"__proto__":{"polluted":1},"constructor":{"x":1}}')
    const s = ok('scope', raw)
    expect(s).toEqual({ apertureMm: 80 })
    expect(Object.getPrototypeOf(s)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('filter kinds match the gear form', () => {
    const opts = LIST_SPECS.filters.fields.find((f) => f.key === 'kind')?.options
    expect([...FILTER_KINDS]).toEqual(opts)
  })
})

describe('validateSpecs refuses, with plain words and nothing kept', () => {
  it.each([
    ['999 aperture', 'scope', { apertureMm: 9999 }, /aperture/i],
    ['negative focal length', 'scope', { focalLengthMm: -5 }, /focal length/i],
    ['NaN', 'camera', { pixelSizeUm: NaN }, /pixel size/i],
    ['Infinity', 'camera', { pixelSizeUm: Infinity }, /pixel size/i],
    ['1e308', 'camera', { sensorWidthPx: 1e308 }, /sensor width/i],
    ['a string number', 'scope', { apertureMm: '80' }, /aperture/i],
    ['a fractional pixel count', 'camera', { sensorWidthPx: 100.5 }, /sensor width/i],
    ['bad read noise class', 'camera', { readNoiseClass: 'huge' }, /read noise/i],
    ['a string for the UV/IR cut', 'camera', { hasUvIrCut: 'yes' }, /UV/],
    ['bad filter type', 'filter', { type: 'magic' }, /type/i],
    ['passband centre 999 nm of 5000', 'filter', { passbands: [{ centreNm: 5000, widthNm: 9 }] }, /passband centre/i],
    ['passband width 0', 'filter', { passbands: [{ centreNm: 656, widthNm: 0 }] }, /passband width/i],
    ['passband missing width', 'filter', { passbands: [{ centreNm: 656 }] }, /passband width/i],
    ['passbands not a list', 'filter', { passbands: { centreNm: 656, widthNm: 9 } }, /passband/i],
    ['too many passbands', 'filter', { passbands: Array.from({ length: 9 }, () => ({ centreNm: 656, widthNm: 9 })) }, /at most/i],
    ['glass 50 mm', 'filter', { glassMm: 50 }, /glass/i],
    ['size 0', 'filter', { sizeMm: 0 }, /filter size/i],
    ['f-number that disagrees', 'scope', { apertureMm: 100, focalLengthMm: 1000, fNumber: 4 }, /does not match/i],
    ['notes over the cap', 'filter', { notes: 'x'.repeat(201) }, /notes/i],
    ['notes not text', 'filter', { notes: 5 }, /notes/i],
  ] as const)('%s', (_n, cls, raw, re) => {
    expect(bad(cls, raw)).toMatch(re)
  })
  it.each([
    ['missing (undefined)', undefined],
    ['null', null],
    ['an array', []],
    ['a string', 'scope'],
    ['an empty object', {}],
    ['only unknown keys', { colour: true }],
    ['only nulls', { apertureMm: null }],
  ])('specs that are %s', (_n, raw) => {
    expect(bad('scope', raw)).toMatch(/specs|no values/i)
  })
  it('one bad value refuses the whole set', () => {
    expect(bad('scope', { apertureMm: 80, focalLengthMm: 1e308 })).toMatch(/focal length/i)
  })
})

describe('names', () => {
  it('cleanName strips control characters, collapses spaces, caps at 80, refuses empty and non-text', () => {
    expect(cleanName('  IDAS \n NBZ-II\u0000 ')).toBe('IDAS NBZ-II')
    expect(() => cleanName('')).toThrow(/name/i)
    expect(() => cleanName('   ')).toThrow(/name/i)
    expect(() => cleanName(5)).toThrow(/name/i)
    expect(() => cleanName('x'.repeat(81))).toThrow(/80/)
    expect(cleanName('x'.repeat(80))).toHaveLength(80)
  })
  it('nameKey is case, space and width insensitive', () => {
    expect(nameKey('IDAS  NBZ-II')).toBe(nameKey('idas nbz-ii'))
    expect(nameKey('ＩＤＡＳ NBZ-II')).toBe('idas nbz-ii')
    expect(nameKey('IDAS NBZ-II')).not.toBe(nameKey('IDAS NB3-PM'))
  })
})

describe('parseEntry judges a stored entry again', () => {
  const good = { cls: 'scope', nameKey: 'edge', name: 'Edge', specs: { apertureMm: 280 }, source: 'model', confirmed: false, updatedAt: '2026-11-17T10:00:00.000Z', previous: null }
  it('accepts a good entry and rebuilds it clean', () => {
    expect(parseEntry({ ...good, extra: 1 })).toEqual(good)
  })
  it.each([
    ['out-of-range spec', { ...good, specs: { apertureMm: 99999 } }],
    ['wrong source', { ...good, source: 'hacker' }],
    ['confirmed not a boolean', { ...good, confirmed: 'yes' }],
    ['bad date', { ...good, updatedAt: 'yesterday' }],
    ['name key that does not match', { ...good, nameKey: 'other' }],
    ['unknown class', { ...good, cls: 'mount' }],
    ['bad previous', { ...good, previous: { specs: { apertureMm: -1 }, source: 'seed', confirmed: false, updatedAt: '2026-11-17T10:00:00.000Z' } }],
    ['not an object', 'x'],
  ])('refuses %s', (_n, raw) => {
    expect(() => parseEntry(raw)).toThrow()
  })
})
