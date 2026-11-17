import type { ListKey } from '../state/edit'
import { GEAR_LIMITS, enterText, inRange, rangeProblem } from '../profile/limits'
import type { GearLimit, GearLimitKey } from '../profile/limits'
import { BAND_BOX_KEYS, bandsFromTexts, bandsToTexts, hasBandBoxes } from '../profile/passbands'
import { validateSpecs } from './specs'
import type { LibraryClass, Specs } from './specs'

/**
 * How a library entry meets the Gear form: which gear lists have a class, which form boxes a lookup fills, and which of them a correction carries.
 * Values the form has no box for (passbands, glass, notes) travel with the entry untouched; the f-number follows focal length and aperture.
 */
export type LibraryList = 'filters' | 'cameras' | 'scopes'

const CLASSES: Partial<Record<ListKey, LibraryClass>> = { filters: 'filter', cameras: 'camera', scopes: 'scope' }
export const libraryClassOf = (list: ListKey): LibraryClass | null => CLASSES[list] ?? null

interface Box { key: string; spec: string; kind: 'number' | 'choice' | 'tristate' }
/** The boxes a correction can carry, in form order. */
const BOXES: Record<LibraryList, Box[]> = {
  filters: [{ key: 'kind', spec: 'type', kind: 'choice' }, { key: 'sizeMm', spec: 'sizeMm', kind: 'number' }],
  cameras: [
    { key: 'pixelSizeUm', spec: 'pixelSizeUm', kind: 'number' },
    { key: 'sensorWidthPx', spec: 'sensorWidthPx', kind: 'number' },
    { key: 'sensorHeightPx', spec: 'sensorHeightPx', kind: 'number' },
    { key: 'hasUvIrCut', spec: 'hasUvIrCut', kind: 'tristate' },
    { key: 'readNoiseClass', spec: 'readNoiseClass', kind: 'choice' },
  ],
  scopes: [{ key: 'focalLengthMm', spec: 'focalLengthMm', kind: 'number' }, { key: 'apertureMm', spec: 'apertureMm', kind: 'number' }],
}
const LABELS: Record<string, string> = { kind: 'Kind', sizeMm: 'Size', pixelSizeUm: 'Pixel size', sensorWidthPx: 'Sensor width', sensorHeightPx: 'Sensor height', hasUvIrCut: 'Has its own UV/IR cut', readNoiseClass: 'Read noise', focalLengthMm: 'Focal length', apertureMm: 'Aperture', passbandWidthNm: 'Total passband width', narrowestBandNm: 'Narrowest band', bandpassNotes: 'Bandpass notes' }
export function labelOf(key: string): string {
  const band = /^band(\d)(Centre|Width)$/.exec(key)
  return band ? `Passband ${band[1]} ${band[2].toLowerCase()}` : (LABELS[key] ?? key)
}

/** Every box a lookup can fill, derived ones included: editing one of them makes the values the user's own, not the AI's. */
export const lookupBoxKeys = (list: LibraryList): string[] => [...BOXES[list].map((b) => b.key), ...(list === 'filters' ? [...BAND_BOX_KEYS, 'passbandWidthNm', 'narrowestBandNm', 'bandpassNotes'] : [])]

/** The two boxes a filter's bands decide: they follow the bands, so a lookup never fills them on their own. */
export const DERIVED_BOXES: readonly string[] = ['passbandWidthNm', 'narrowestBandNm']

export const correctableKeys = (list: LibraryList): string[] => [...BOXES[list].map((b) => b.key), ...(list === 'filters' ? BAND_BOX_KEYS : [])]

const rec = (s: Specs) => s as Record<string, unknown>
const num = (n: number) => String(Math.round(n * 1e6) / 1e6)

/** The form's boxes for an entry's specs: only the boxes the specs hold a value for. Includes the derived filter band boxes and the notes line. */
export function specsToTexts(list: LibraryList, specs: Specs): Record<string, string> {
  const out: Record<string, string> = {}
  const s = rec(specs)
  for (const b of BOXES[list]) {
    const v = s[b.spec]
    if (v === undefined) continue
    out[b.key] = b.kind === 'tristate' ? (v ? 'yes' : 'no') : String(v)
  }
  if (list === 'filters') {
    const bands = (s.passbands as { centreNm: number; widthNm: number }[] | undefined) ?? []
    if (bands.length > 0) {
      Object.assign(out, Object.fromEntries(Object.entries(bandsToTexts(bands)).filter(([, v]) => v !== '')))
      out.passbandWidthNm = num(bands.reduce((t, b) => t + b.widthNm, 0))
      out.narrowestBandNm = num(Math.min(...bands.map((b) => b.widthNm)))
    }
    const parts = typeof s.glassMm === 'number' ? [`glass ${num(s.glassMm)} mm`] : []
    const line = parts.join(', ')
    const notes = typeof s.notes === 'string' ? s.notes : ''
    if (line || notes) out.bandpassNotes = line && notes ? `${line}. ${notes}` : line || notes
  }
  return out
}

const NUMBER_BOX: Box = { key: '', spec: '', kind: 'number' }
const same = (box: Box, a: string, b: string): boolean => {
  const x = a.trim()
  const y = b.trim()
  if (box.kind === 'number' && x !== '' && y !== '' && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) return Number(x) === Number(y)
  return x === y
}

/** True when a box a correction can carry holds something other than the entry's value (an empty box the entry has no value for is the same). */
export function isEdited(list: LibraryList, specs: Specs, texts: Record<string, string>, ignore: readonly string[] = []): boolean {
  const lib = specsToTexts(list, specs)
  if (BOXES[list].filter((b) => !ignore.includes(b.key)).some((b) => !same(b, texts[b.key] ?? '', lib[b.key] ?? ''))) return true
  return list === 'filters' && BAND_BOX_KEYS.filter((k) => !ignore.includes(k)).some((k) => !same(NUMBER_BOX, texts[k] ?? '', lib[k] ?? ''))
}

/**
 * The specs a correction sends: the entry's own specs with the boxes' values on top (an emptied box removes the value). A box that is not a number
 * in range is a plain problem. The f-number is recomputed from focal length and aperture, or dropped when one of them is empty.
 */
export function textsToSpecs(list: LibraryList, texts: Record<string, string>, base: Specs): { specs: Specs } | { problem: string } {
  const out: Record<string, unknown> = { ...rec(base) }
  for (const b of BOXES[list]) {
    const t = (texts[b.key] ?? '').trim()
    if (t === '') { delete out[b.spec]; continue }
    if (b.kind === 'tristate') { out[b.spec] = t === 'yes'; continue }
    if (b.kind === 'choice') { out[b.spec] = t; continue }
    const limit: GearLimit = GEAR_LIMITS[b.spec as GearLimitKey]
    const n = Number(t)
    if (Number.isFinite(n) && limit.whole === true && !Number.isInteger(n)) return { problem: `${labelOf(b.key)}: ${t} is not a whole number. ${enterText(limit)}` }
    if (!Number.isFinite(n) || !inRange(limit, n)) return { problem: rangeProblem(labelOf(b.key), limit, t) }
    out[b.spec] = n
  }
  if (list === 'scopes') {
    if (typeof out.apertureMm === 'number' && typeof out.focalLengthMm === 'number') out.fNumber = Math.round((out.focalLengthMm / out.apertureMm) * 100) / 100
    else delete out.fNumber
  }
  if (list === 'filters' && hasBandBoxes(texts)) {
    const b = bandsFromTexts(texts)
    if ('problem' in b) return { problem: b.problem }
    if (b.bands.length > 0) out.passbands = b.bands
    else delete out.passbands
  }
  const r = validateSpecs(list === 'filters' ? 'filter' : list === 'cameras' ? 'camera' : 'scope', out)
  if ('problems' in r) return { problem: r.problems[0] }
  return { specs: r.specs }
}
