import { LibraryDataError, parseEntry } from './specs'
import type { LibraryEntry } from './specs'
import type { LibraryStore } from './store'

/** The version of the backup file's shape. Bump it when the shape changes; an older file is migrated, a newer one refused. */
export const BACKUP_VERSION = 1

/**
 * Entries worth keeping in the repo: those a person has typed or confirmed (source `user`). Seed entries ship in code and model entries
 * can be filled again, so neither is backed up. Sorted by class then key, so two exports of the same store are byte-identical.
 */
export async function exportBackup(store: LibraryStore): Promise<string> {
  const entries = (await store.list())
    .filter((e) => e.source === 'user')
    .sort((a, b) => (a.cls === b.cls ? (a.nameKey < b.nameKey ? -1 : a.nameKey > b.nameKey ? 1 : 0) : a.cls < b.cls ? -1 : 1))
  return `${JSON.stringify({ version: BACKUP_VERSION, entries }, null, 2)}\n`
}

/** Judges a backup file: the version, then every entry again (the same checks as a stored entry). Throws LibraryDataError; nothing is imported from a file that fails. */
export function parseBackup(text: string): LibraryEntry[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new LibraryDataError('The backup file is not valid JSON.')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new LibraryDataError('The backup file must be an object with a version and entries.')
  const { version, entries } = raw as { version?: unknown; entries?: unknown }
  if (version !== BACKUP_VERSION) throw new LibraryDataError(`The backup file is version ${String(version)}; this code reads version ${BACKUP_VERSION}.`)
  if (!Array.isArray(entries)) throw new LibraryDataError('The backup file needs a list of entries.')
  const seen = new Set<string>()
  return entries.map((e, i) => {
    let entry: LibraryEntry
    try {
      entry = parseEntry(e)
    } catch (err) {
      throw new LibraryDataError(`Backup entry ${i + 1} cannot be used: ${(err as Error).message}`)
    }
    const key = `${entry.cls}:${entry.nameKey}`
    if (seen.has(key)) throw new LibraryDataError(`Backup entry ${i + 1} repeats ${key}.`)
    seen.add(key)
    return entry
  })
}

/** Rebuilds a store from a backup file. Never overwrites an entry the store already has (a newer correction wins). */
export async function importBackup(store: LibraryStore, text: string): Promise<{ written: number; kept: number }> {
  const entries = parseBackup(text)
  let written = 0
  for (const e of entries) if (await store.putIfAbsent(e)) written++
  return { written, kept: entries.length - written }
}
