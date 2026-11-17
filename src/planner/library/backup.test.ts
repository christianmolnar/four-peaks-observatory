import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeKv } from '../ai/kv-fake'
import { BACKUP_VERSION, exportBackup, importBackup, parseBackup } from './backup'
import { SEED_ENTRIES } from './seed'
import { OVERLAP_PAIR, WIDE_PAIR } from './wide-pair.fixture'
import { applyCorrection } from './service'
import { KvRestLibraryStore, MemoryLibraryStore } from './store'
import type { LibraryStore } from './store'

const stores: [string, () => LibraryStore][] = [
  ['MemoryLibraryStore', () => new MemoryLibraryStore()],
  ['KvRestLibraryStore (fake Upstash)', () => new KvRestLibraryStore('https://kv.example/', 'tok', fakeKv({ t: 0 }).fetchImpl)],
]

describe.each(stores)('backup with %s', (_n, make) => {
  const fill = async (store: LibraryStore) => {
    await store.putIfAbsent(SEED_ENTRIES[0])
    await applyCorrection({ store, cls: 'scope', name: 'Edge', specs: { apertureMm: 279, focalLengthMm: 2800, fNumber: 10, notes: 'EdgeHD 11' }, now: new Date('2026-11-17T10:00:00.000Z') })
    await applyCorrection({ store, cls: 'scope', name: 'Edge', specs: { apertureMm: 280, focalLengthMm: 2800 }, now: new Date('2026-11-17T11:00:00.000Z') })
    await applyCorrection({ store, cls: 'filter', name: SEED_ENTRIES[1].name, specs: { ...SEED_ENTRIES[1].specs, glassMm: 2.5 }, now: new Date('2026-11-17T12:00:00.000Z') })
    await store.put({ cls: 'camera', nameKey: 'ai cam', name: 'AI Cam', specs: { pixelSizeUm: 3 }, source: 'model', confirmed: false, updatedAt: '2026-11-17T10:00:00.000Z', previous: null })
  }
  it('exports only corrected and confirmed entries (source user), sorted, with a version', async () => {
    const store = make()
    await fill(store)
    const file = JSON.parse(await exportBackup(store))
    expect(file.version).toBe(BACKUP_VERSION)
    expect(file.entries.map((e: { nameKey: string }) => e.nameKey)).toEqual(['idas nb3-pm', 'edge'])
    expect(file.entries.every((e: { source: string; confirmed: boolean }) => e.source === 'user' && e.confirmed)).toBe(true)
  })
  it('round-trips losslessly into an empty store, history included, and a second export is byte-identical', async () => {
    const a = make()
    await fill(a)
    const text = await exportBackup(a)
    const b = make()
    expect(await importBackup(b, text)).toEqual({ written: 2, kept: 0 })
    expect(await exportBackup(b)).toBe(text)
    const edge = (await b.get('scope', 'edge'))!
    expect(edge.previous).toMatchObject({ specs: { apertureMm: 279, fNumber: 10, notes: 'EdgeHD 11' } })
  })
  it('import never overwrites an entry the store already has', async () => {
    const a = make()
    await fill(a)
    const text = await exportBackup(a)
    const b = make()
    await applyCorrection({ store: b, cls: 'scope', name: 'Edge', specs: { apertureMm: 100 }, now: new Date('2026-12-01T00:00:00.000Z') })
    expect(await importBackup(b, text)).toEqual({ written: 1, kept: 1 })
    expect((await b.get('scope', 'edge'))?.specs).toEqual({ apertureMm: 100 })
  })
})

describe('parseBackup refuses a file it cannot trust, and imports nothing', () => {
  const entry = { cls: 'scope', nameKey: 'edge', name: 'Edge', specs: { apertureMm: 280 }, source: 'user', confirmed: true, updatedAt: '2026-11-17T10:00:00.000Z', previous: null }
  const file = (over: object) => JSON.stringify({ version: BACKUP_VERSION, entries: [entry], ...over })
  it('accepts a good file', () => expect(parseBackup(file({}))).toEqual([entry]))
  it.each([
    ['not JSON', 'nope'],
    ['a newer version', file({ version: BACKUP_VERSION + 1 })],
    ['no version', JSON.stringify({ entries: [] })],
    ['entries not a list', file({ entries: {} })],
    ['an out-of-range value', file({ entries: [{ ...entry, specs: { apertureMm: 99999 } }] })],
    ['the Wide Pair (total width 1,200 nm)', file({ entries: [{ ...entry, cls: 'filter', nameKey: 'wide pair', name: 'Wide Pair', specs: WIDE_PAIR }] })],
    ['overlapping passbands', file({ entries: [{ ...entry, cls: 'filter', nameKey: 'overlap', name: 'Overlap', specs: OVERLAP_PAIR }] })],
    ['a duplicate entry', file({ entries: [entry, entry] })],
    ['an array at the top', '[]'],
  ])('%s', (_n, text) => {
    expect(() => parseBackup(text)).toThrow()
  })
  it('a backup holding the Wide Pair writes nothing, not even the good entry before it', async () => {
    const store = new MemoryLibraryStore()
    const wide = { ...entry, cls: 'filter', nameKey: 'wide pair', name: 'Wide Pair', specs: WIDE_PAIR }
    await expect(importBackup(store, file({ entries: [entry, wide] }))).rejects.toThrow(/Total passband width/)
    expect(await store.list()).toEqual([])
  })
  it('a bad entry stops the whole import before any write', async () => {
    const store = new MemoryLibraryStore()
    await expect(importBackup(store, file({ entries: [entry, { ...entry, nameKey: 'x', name: 'X', specs: { apertureMm: -1 } }] }))).rejects.toThrow()
    expect(await store.list()).toEqual([])
  })
})

describe('the file in the repo', () => {
  it('src/planner/library/backup.json is a valid backup', () => {
    const text = readFileSync(join(__dirname, 'backup.json'), 'utf8')
    expect(() => parseBackup(text)).not.toThrow()
  })
})
