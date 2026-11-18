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
    notes: 'Ha 656.3 nm 9.5 nm and OIII 500.7 nm 8 nm, f/2 optimized. Not yet checked against the maker.',
  }),
  seed('IDAS NB3-PM', {
    type: 'dual-band',
    passbands: [{ centreNm: 672, widthNm: 19 }, { centreNm: 500.7, widthNm: 21 }],
    glassMm: 2,
    notes: 'SII about 672 nm about 19 nm and OIII about 21 nm. Glass 2.0 or 2.5 mm. Not yet checked against the maker.',
  }),
  seed('Optolong H-alpha 7 nm', {
    type: 'narrowband',
    passbands: [{ centreNm: 656.3, widthNm: 7 }],
    notes: 'Ha 656.3 nm 7 nm (the vendor width, centred on the line). Not yet checked against the maker.',
  }),
  seed('Optolong L-eXtreme', {
    type: 'dual-band',
    passbands: [{ centreNm: 656.3, widthNm: 7 }, { centreNm: 500.7, widthNm: 7 }],
    notes: 'The standard 7 nm version: Ha 656.3 nm 7 nm and OIII 500.7 nm 7 nm (the vendor widths, centred on the lines). Not yet checked against the maker.',
  }),
]
