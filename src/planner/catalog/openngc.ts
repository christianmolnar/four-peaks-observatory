import { TARGET_TYPES } from './index';
import type { TargetType } from './index';

/** Where the bundled extract is served from (written by `scripts/build-catalog.mjs`). */
export const CATALOG_URL = '/catalog/openngc-v20260501-r2.json';

/** One object of the bundled OpenNGC extract. Field names are the file's own. */
export interface CatalogObject {
  /** Lower case OpenNGC name without leading zeros: "ngc224", "ic405", "mel22". */
  id: string;
  name: string;
  type: TargetType;
  /** J2000 right ascension in hours, [0, 24). */
  raHours: number;
  /** J2000 declination in degrees. */
  decDeg: number;
  majorArcmin?: number;
  minorArcmin?: number;
  positionAngleDeg?: number;
  /** V magnitude, else B. */
  mag?: number;
  /** Mag per square arcsecond. Galaxies: the catalog value; others computed from mag and size (`sbComputed`). */
  surfaceBrightness?: number;
  sbComputed?: true;
  m?: number;
  ngc?: number;
  ic?: number;
  /** Caldwell number. */
  c?: number;
  constellation?: string;
  aliases?: string[];
}

export interface CatalogExtract {
  tag: string;
  license: string;
  objects: CatalogObject[];
}

function fail(path: string, message: string): never {
  throw new Error(`Catalog extract invalid at ${path}: ${message}`);
}

const NUMBER_FIELDS = [
  'majorArcmin',
  'minorArcmin',
  'positionAngleDeg',
  'mag',
  'surfaceBrightness',
  'm',
  'ngc',
  'ic',
  'c',
] as const;

function checkObject(o: unknown, i: number): CatalogObject {
  const at = `objects[${i}]`;
  if (typeof o !== 'object' || o === null) fail(at, 'expected an object');
  const r = o as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') fail(`${at}.id`, 'expected a non-empty string');
  if (typeof r.name !== 'string' || r.name === '') fail(`${at}.name`, 'expected a non-empty string');
  if (!TARGET_TYPES.includes(r.type as TargetType)) fail(`${at}.type`, `expected one of ${TARGET_TYPES.join(', ')}`);
  if (typeof r.raHours !== 'number' || !(r.raHours >= 0 && r.raHours < 24)) fail(`${at}.raHours`, 'expected a number in [0, 24)');
  if (typeof r.decDeg !== 'number' || !(r.decDeg >= -90 && r.decDeg <= 90)) fail(`${at}.decDeg`, 'expected a number in [-90, 90]');
  for (const f of NUMBER_FIELDS) {
    if (r[f] !== undefined && (typeof r[f] !== 'number' || !Number.isFinite(r[f]))) fail(`${at}.${f}`, 'expected a finite number');
  }
  for (const f of ['majorArcmin', 'minorArcmin'] as const) {
    if (r[f] !== undefined && !((r[f] as number) > 0)) fail(`${at}.${f}`, 'expected a positive number');
  }
  if (r.sbComputed !== undefined && r.sbComputed !== true) fail(`${at}.sbComputed`, 'expected true or absent');
  if (r.sbComputed === true && r.surfaceBrightness === undefined) fail(`${at}.sbComputed`, 'set without a surfaceBrightness');
  if (r.constellation !== undefined && typeof r.constellation !== 'string') fail(`${at}.constellation`, 'expected a string');
  if (r.aliases !== undefined && (!Array.isArray(r.aliases) || !r.aliases.every((a) => typeof a === 'string' && a !== ''))) {
    fail(`${at}.aliases`, 'expected an array of non-empty strings');
  }
  if (Array.isArray(r.aliases) && r.aliases.some((a) => /NaN|undefined/.test(a as string))) {
    fail(`${at}.aliases`, 'an alias holds NaN or undefined (a failed number conversion in the build)');
  }
  return r as unknown as CatalogObject;
}

/** Validates the parsed JSON of the extract. Throws with the path of the first bad value. */
export function parseExtract(raw: unknown): CatalogExtract {
  if (typeof raw !== 'object' || raw === null) fail('$', 'expected an object');
  const r = raw as Record<string, unknown>;
  if (r.format !== 1) fail('format', 'expected 1');
  const source = r.source as { tag?: unknown } | null;
  if (typeof source !== 'object' || source === null || typeof source.tag !== 'string') fail('source.tag', 'expected a string');
  if (r.license !== 'CC-BY-SA-4.0') fail('license', 'expected CC-BY-SA-4.0');
  if (!Array.isArray(r.objects)) fail('objects', 'expected an array');
  if (r.count !== r.objects.length) fail('count', `says ${String(r.count)} but the file holds ${r.objects.length} objects`);
  const objects = r.objects.map(checkObject);
  const ids = new Set<string>();
  for (const o of objects) {
    if (ids.has(o.id)) fail('objects', `duplicate id ${o.id}`);
    ids.add(o.id);
  }
  return { tag: source.tag as string, license: r.license, objects };
}
