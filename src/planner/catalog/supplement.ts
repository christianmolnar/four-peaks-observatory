import supplementData from '../data/catalog-supplement.json';
import overridesData from '../data/catalog-overrides.json';
import type { CatalogObject } from './openngc';

/** Extra names for one catalog object (own work, CC0; see `data/catalog-supplement.json`). */
export interface SupplementEntry {
  id: string;
  names: string[];
  /** The label the UI shows instead of the upstream name. Also searchable; the upstream name stays an alias. */
  displayName?: string;
}

/** A correction to an upstream name (own work, CC0; see `data/catalog-overrides.json`). */
export interface OverrideEntry {
  id: string;
  name?: string;
  dropNames?: string[];
  reason: string;
}

export interface CatalogPatches {
  supplement: readonly SupplementEntry[];
  overrides: readonly OverrideEntry[];
}

function fail(file: string, i: number, message: string): never {
  throw new Error(`${file} entries[${i}]: ${message}`);
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim() !== '');

export function loadSupplement(raw: unknown): SupplementEntry[] {
  const entries = (raw as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) throw new Error('catalog-supplement.json: expected entries');
  return entries.map((e: Record<string, unknown>, i) => {
    if (typeof e.id !== 'string' || e.id === '') fail('catalog-supplement.json', i, 'expected an id');
    if (!isStrings(e.names)) fail('catalog-supplement.json', i, 'expected a non-empty list of names');
    if (e.displayName !== undefined && (typeof e.displayName !== 'string' || e.displayName.trim() === '')) fail('catalog-supplement.json', i, 'expected a displayName');
    return { id: e.id, names: e.names, ...(e.displayName === undefined ? {} : { displayName: e.displayName as string }) };
  });
}

export function loadOverrides(raw: unknown): OverrideEntry[] {
  const entries = (raw as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) throw new Error('catalog-overrides.json: expected entries');
  return entries.map((e: Record<string, unknown>, i) => {
    if (typeof e.id !== 'string' || e.id === '') fail('catalog-overrides.json', i, 'expected an id');
    if (typeof e.reason !== 'string' || e.reason === '') fail('catalog-overrides.json', i, 'expected a reason');
    if (e.name !== undefined && (typeof e.name !== 'string' || e.name === '')) fail('catalog-overrides.json', i, 'expected a name');
    if (e.dropNames !== undefined && !isStrings(e.dropNames)) fail('catalog-overrides.json', i, 'expected dropNames as a list of names');
    if (e.name === undefined && e.dropNames === undefined) fail('catalog-overrides.json', i, 'changes nothing');
    return { id: e.id, reason: e.reason, ...(e.name === undefined ? {} : { name: e.name }), ...(e.dropNames === undefined ? {} : { dropNames: e.dropNames }) };
  });
}

/** The two data files that sit on top of the bundled extract. */
export const catalogPatches: CatalogPatches = {
  supplement: loadSupplement(supplementData),
  overrides: loadOverrides(overridesData),
};

/**
 * Applies overrides, then the supplement. Returns new objects; the input is not changed.
 * Throws when an entry names an object that is not in the catalog (a stale id after a catalog update).
 */
export function applyPatches(objects: readonly CatalogObject[], patches: CatalogPatches): CatalogObject[] {
  const byId = new Map(objects.map((o) => [o.id, { ...o }]));
  const get = (id: string, file: string): CatalogObject => {
    const o = byId.get(id);
    if (o === undefined) throw new Error(`${file}: "${id}" is not in the catalog`);
    return o;
  };
  for (const ov of patches.overrides) {
    const o = get(ov.id, 'catalog-overrides.json');
    const drop = new Set(ov.dropNames ?? []);
    const oldName = o.name;
    if (ov.name !== undefined) o.name = ov.name;
    else if (drop.has(o.name)) throw new Error(`catalog-overrides.json: ${ov.id} drops its own name "${o.name}" without a replacement`);
    const aliases = [...(ov.name !== undefined && oldName !== ov.name ? [oldName] : []), ...(o.aliases ?? [])];
    o.aliases = [...new Set(aliases)].filter((a) => !drop.has(a) && a !== o.name);
    if (o.aliases.length === 0) delete o.aliases;
  }
  for (const sup of patches.supplement) {
    const o = get(sup.id, 'catalog-supplement.json');
    if (sup.displayName !== undefined) o.displayName = sup.displayName;
    const have = new Set([o.name, ...(o.aliases ?? [])]);
    const add = [...new Set([...sup.names, ...(sup.displayName === undefined ? [] : [sup.displayName])])].filter((n) => !have.has(n));
    if (add.length > 0) o.aliases = [...(o.aliases ?? []), ...add];
  }
  return objects.map((o) => byId.get(o.id) as CatalogObject);
}
