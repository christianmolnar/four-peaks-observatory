import { nameKey, parseEntry } from './specs'
import type { LibraryEntry } from './specs'

/**
 * Entries that ship with the site: the first two from Christian's screenshot of 2026-11-15, the Optolong pair added for the narrowband-hours panel. Source `seed`, confirmed false: unverified until checked against the maker.
 * A person's correction replaces a seed entry for everyone; a seed never overwrites a stored entry.
 */
const SEED_TIME = '2026-11-15T00:00:00.000Z'

const seed = (name: string, specs: unknown): LibraryEntry =>
  parseEntry({ cls: 'filter', nameKey: nameKey(name), name, specs, source: 'seed', confirmed: false, updatedAt: SEED_TIME, previous: null })

export const SEED_ENTRIES: readonly LibraryEntry[] = [
  seed('IDAS NBZ-II', {
    type: 'dual-band',
    passbands: [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }],
    glassMm: 2,
    notes: 'Ha 9.5 nm, OIII 8 nm. Unchecked.',
  }),
  seed('IDAS NB3-PM', {
    type: 'dual-band',
    passbands: [{ centreNm: 672, widthNm: 19 }, { centreNm: 500.7, widthNm: 21 }],
    glassMm: 2,
    needsUvIrCut: true,
    notes: 'Needs a UV/IR cut. SII 19 nm, OIII 21 nm. Unchecked.',
  }),
  seed('Optolong H-alpha 7 nm', {
    type: 'narrowband',
    passbands: [{ centreNm: 656.3, widthNm: 7 }],
    notes: 'Ha 7 nm. Unchecked.',
  }),
  seed('Optolong L-eXtreme (standard)', {
    type: 'dual-band',
    passbands: [{ centreNm: 656.3, widthNm: 7 }, { centreNm: 500.7, widthNm: 7 }],
    notes: 'Ha 7 nm, OIII 7 nm. Unchecked.',
  }),
]
