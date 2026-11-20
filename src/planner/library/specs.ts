import { GEAR_LIMITS, MAX_NAME_CHARS, MAX_PASSBANDS, badNumber, enterText, inRange } from '../profile/limits'
import type { GearLimitKey } from '../profile/limits'
import { judgePassbands } from '../profile/passbands'
import type { FilterKind, Passband, ReadNoiseClass } from '../profile/types'

/**
 * The spec library's data model and the one place a spec is judged. Every path (a model reply, a user correction, a stored entry read back,
 * a backup file, the seed) goes through validateSpecs / parseEntry: a value outside the gear ranges, not finite, or of the wrong type is refused
 * and nothing is kept. Library text is data, never instructions: names and notes are length-capped and never go into a prompt except as a quoted name.
 */

export const LIBRARY_CLASSES = ['filter', 'camera', 'scope'] as const
export type LibraryClass = (typeof LIBRARY_CLASSES)[number]
export const isLibraryClass = (v: unknown): v is LibraryClass => typeof v === 'string' && (LIBRARY_CLASSES as readonly string[]).includes(v)

export const FILTER_KINDS = ['broadband-LP', 'dual-band', 'tri-band', 'narrowband', 'UV-IR cut', 'visual-only'] as const satisfies readonly FilterKind[]
export const READ_NOISE_CLASSES = ['low', 'medium', 'high'] as const satisfies readonly ReadNoiseClass[]
export { MAX_PASSBANDS }
export const MAX_NOTES_CHARS = 200

export type { Passband }
export interface FilterSpecs { type?: FilterKind; passbands?: Passband[]; sizeMm?: number; glassMm?: number; notes?: string }
export interface CameraSpecs { sensorWidthPx?: number; sensorHeightPx?: number; pixelSizeUm?: number; readNoiseClass?: ReadNoiseClass; recommendedGain?: number; hasUvIrCut?: boolean; notes?: string }
export interface ScopeSpecs { apertureMm?: number; focalLengthMm?: number; fNumber?: number; notes?: string }
export type Specs = FilterSpecs | CameraSpecs | ScopeSpecs

/** Where a value came from: shipped with the site (unverified until checked against the maker), filled by the model, or typed or confirmed by a person. */
export const SOURCES = ['seed', 'model', 'user'] as const
export type Source = (typeof SOURCES)[number]

/** One value of an entry: what is kept as the single step of history. */
export interface EntryValue { specs: Specs; source: Source; confirmed: boolean; updatedAt: string }
export interface LibraryEntry extends EntryValue {
  cls: LibraryClass
  /** The normalised name: the lookup key. */
  nameKey: string
  /** The name as first written, cleaned and capped. */
  name: string
  /** The value before the last correction; null when there was none. One step only. */
  previous: EntryValue | null
}

/** A stored or received thing that cannot be used. The message is plain words. */
export class LibraryDataError extends Error {}

const CONTROL = /[\p{Cc}\p{Cf}\u2028\u2029]/gu

/** A name as the library keeps it: control characters turned into spaces, spaces collapsed. Refuses non-text, empty and over MAX_NAME_CHARS. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') throw new LibraryDataError('The name must be text.')
  const name = raw.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
  if (name === '') throw new LibraryDataError('Enter a name first.')
  if (name.length > MAX_NAME_CHARS) throw new LibraryDataError(`The name is longer than ${MAX_NAME_CHARS} characters.`)
  return name
}

/** The lookup key of a name: width, case and spacing do not matter ("IDAS  NBZ-II" and "idas nbz-ii" are one entry). */
export const nameKey = (name: string): string => name.normalize('NFKC').toLowerCase().replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const own = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined)
const absent = (v: unknown) => v === undefined || v === null

class Check {
  readonly problems: string[] = []
  readonly out: Obj = {}
  constructor(private readonly raw: Obj) {}
  num(key: string, limitKey: GearLimitKey = key as GearLimitKey, label?: string): void {
    const v = own(this.raw, key)
    if (absent(v)) return
    const limit = GEAR_LIMITS[limitKey]
    if (!inRange(limit, v)) this.problems.push(`${capital(label ?? limit.noun)}: ${badNumber(limit, v)}. ${enterText(limit)}`)
    else this.out[key] = v
  }
  choice(key: string, options: readonly string[], noun: string): void {
    const v = own(this.raw, key)
    if (absent(v)) return
    if (typeof v !== 'string' || !options.includes(v)) this.problems.push(`The ${noun} must be one of: ${options.join(', ')}.`)
    else this.out[key] = v
  }
  bool(key: string, noun: string): void {
    const v = own(this.raw, key)
    if (absent(v)) return
    if (typeof v !== 'boolean') this.problems.push(`The ${noun} must be yes or no.`)
    else this.out[key] = v
  }
  notes(): void {
    const v = own(this.raw, 'notes')
    if (absent(v)) return
    if (typeof v !== 'string') return void this.problems.push('The notes must be text.')
    const t = v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
    if (t.length > MAX_NOTES_CHARS) return void this.problems.push(`The notes are longer than ${MAX_NOTES_CHARS} characters.`)
    if (t !== '') this.out.notes = t
  }
}
const capital = (s: string) => (s === '' ? s : s[0].toUpperCase() + s.slice(1))
function passbands(c: Check, raw: Obj): void {
  const v = own(raw, 'passbands')
  if (absent(v)) return
  // The one judge of a band list (shared with the gear profile): ranges, count, the derived total and narrowest band, edges, width against centre, overlap.
  const r = judgePassbands(v)
  if ('problems' in r) c.problems.push(...r.problems)
  else if (r.bands.length > 0) c.out.passbands = r.bands
}

/** The f-number a scope's own numbers give, so a stored f-number that disagrees is caught. */
export const FNUMBER_TOLERANCE = 0.05

/**
 * Judges a set of specs for one class. Returns the clean specs (a fresh object holding only known, valid values) or every problem in plain words.
 * Unknown keys are dropped (never copied), null means unknown, and one bad value refuses the whole set.
 */
export function validateSpecs(cls: LibraryClass, raw: unknown): { specs: Specs } | { problems: string[] } {
  if (!isObj(raw)) return { problems: ['The specs must be an object of values.'] }
  const c = new Check(raw)
  if (cls === 'filter') {
    c.choice('type', FILTER_KINDS, 'filter type')
    passbands(c, raw)
    c.num('sizeMm')
    c.num('glassMm')
  } else if (cls === 'camera') {
    c.num('sensorWidthPx')
    c.num('sensorHeightPx')
    c.num('pixelSizeUm')
    c.choice('readNoiseClass', READ_NOISE_CLASSES, 'read noise class')
    c.num('recommendedGain')
    c.bool('hasUvIrCut', 'UV/IR cut')
  } else {
    c.num('apertureMm')
    c.num('focalLengthMm')
    c.num('fNumber')
  }
  c.notes()
  const o = c.out
  if (c.problems.length === 0 && cls === 'scope' && typeof o.fNumber === 'number' && typeof o.apertureMm === 'number' && typeof o.focalLengthMm === 'number') {
    const implied = o.focalLengthMm / o.apertureMm
    if (Math.abs(implied - o.fNumber) / implied > FNUMBER_TOLERANCE) c.problems.push(`The focal ratio f/${o.fNumber} does not match the focal length and aperture (that is f/${Math.round(implied * 10) / 10}).`)
  }
  if (c.problems.length > 0) return { problems: c.problems }
  if (Object.keys(o).length === 0) return { problems: ['The specs have no values.'] }
  return { specs: o as Specs }
}

function judged(cls: LibraryClass, raw: unknown): Specs {
  const r = validateSpecs(cls, raw)
  if ('problems' in r) throw new LibraryDataError(r.problems.join(' '))
  return r.specs
}

function parseValue(cls: LibraryClass, raw: unknown): EntryValue {
  if (!isObj(raw)) throw new LibraryDataError('An entry value must be an object.')
  const source = own(raw, 'source')
  const confirmed = own(raw, 'confirmed')
  const updatedAt = own(raw, 'updatedAt')
  if (typeof source !== 'string' || !(SOURCES as readonly string[]).includes(source)) throw new LibraryDataError('An entry has an unknown source.')
  if (typeof confirmed !== 'boolean') throw new LibraryDataError('An entry needs confirmed to be true or false.')
  if (typeof updatedAt !== 'string' || updatedAt.length > 40 || !Number.isFinite(Date.parse(updatedAt))) throw new LibraryDataError('An entry needs a valid update time.')
  return { specs: judged(cls, own(raw, 'specs')), source: source as Source, confirmed, updatedAt }
}

/** Judges a whole entry (read back from the store, a backup file or the seed) and rebuilds it clean. Throws LibraryDataError. */
export function parseEntry(raw: unknown): LibraryEntry {
  if (!isObj(raw)) throw new LibraryDataError('An entry must be an object.')
  const cls = own(raw, 'cls')
  if (!isLibraryClass(cls)) throw new LibraryDataError('An entry has an unknown class.')
  const name = cleanName(own(raw, 'name'))
  if (own(raw, 'nameKey') !== nameKey(name)) throw new LibraryDataError('An entry key does not match its name.')
  const value = parseValue(cls, raw)
  const prev = own(raw, 'previous')
  return { cls, nameKey: nameKey(name), name, ...value, previous: absent(prev) ? null : parseValue(cls, prev) }
}
