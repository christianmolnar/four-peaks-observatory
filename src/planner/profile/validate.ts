import { GEAR_LIMITS, MAX_NAME_CHARS, SITE_LIMITS, enterText, inRange } from './limits';
import type { GearLimitKey, SiteLimitKey } from './limits';
import { migrateProfile } from './migrate';
import { MAX_ZONES, PROFILE_VERSION } from './types';
import type {
  BlockedArc,
  ObservingPlan,
  Profile,
  ProfileAccessory,
  ProfileCamera,
  ProfileFilter,
  FilterKind,
  ReadNoiseClass,
  ProfileScope,
  ProfileSite,
  ProfileSmartScope,
  TrainEntry,
} from './types';

/** Thrown for any invalid profile; the message starts with the field path. */
export class ProfileError extends Error {
  constructor(
    public readonly path: string,
    detail: string,
  ) {
    super(`${path}: ${detail}`);
    this.name = 'ProfileError';
  }
}

/** Smallest arc, and smallest gap between the arc's ends, in degrees. */
export const MIN_ARC_DEG = 0.1;

type Obj = Record<string, unknown>;

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ProfileError(path, 'expected an object');
  }
  return v as Obj;
}

/** Rejects keys not in `keys`, except notes starting with `_`; catches misspelled fields. */
function onlyKeys(o: Obj, path: string, keys: readonly string[]): void {
  for (const k of Object.keys(o)) {
    if (!k.startsWith('_') && !keys.includes(k)) {
      throw new ProfileError(`${path}.${k}`, `unknown field (allowed: ${keys.join(', ')}; notes start with _)`);
    }
  }
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new ProfileError(path, 'expected an array');
  return v;
}

function str(o: Obj, key: string, path: string, allowEmpty = false): string {
  const v = o[key];
  if (typeof v !== 'string' || (!allowEmpty && v.trim() === '')) {
    throw new ProfileError(`${path}.${key}`, `expected ${allowEmpty ? 'a string' : 'a non-empty string'}`);
  }
  return v;
}

function num(o: Obj, key: string, path: string, min: number, max: number): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new ProfileError(`${path}.${key}`, `expected a number from ${min} to ${max}, got ${JSON.stringify(v)}`);
  }
  return v;
}

/**
 * Optional gear number: absent is allowed ("unknown"). Strict (a typed or imported value) it must be inside its range in GEAR_LIMITS.
 * Lenient (a profile already stored) whatever is stored is kept, even a negative, zero, null or text value, so an older or damaged value
 * never costs the user the profile; `gearProblems` flags it and `resolveTrain` leaves it out.
 */
function optLimited(o: Obj, key: GearLimitKey, path: string, strict: boolean): number | undefined {
  if (o[key] === undefined) return undefined;
  const v = o[key];
  if (strict && !inRange(GEAR_LIMITS[key], v)) throw new ProfileError(`${path}.${key}`, `${enterText(GEAR_LIMITS[key])} It is ${v === null ? 'empty' : JSON.stringify(v)}.`);
  return v as number;
}

/** A name: not empty, and (strict) at most MAX_NAME_CHARS characters. A longer stored name is kept: it wraps, and the form asks for a shorter one on the next Save. */
function nameOf(o: Obj, path: string, strict: boolean): string {
  const v = str(o, 'name', path);
  if (strict && v.length > MAX_NAME_CHARS) throw new ProfileError(`${path}.name`, `Use at most ${MAX_NAME_CHARS} characters for a name. It has ${v.length}.`);
  return v;
}

/**
 * A site number inside its range, in a plain sentence. Lenient (a profile already stored) whatever is stored is kept, even a number outside its range, null or text:
 * the site is then flagged (`siteProblems`) and not used (`usableSites`), and its form lets the user correct it. A profile is never set aside for it.
 */
function siteNum(o: Obj, key: SiteLimitKey, path: string, strict: boolean): number {
  const limit = SITE_LIMITS[key];
  const v = o[key];
  if (!inRange(limit, v)) {
    if (!strict) return v as number;
    throw new ProfileError(`${path}.${key}`, `${enterText(limit)} It is ${v === null ? 'empty' : JSON.stringify(v)}.`);
  }
  return v;
}

function strings(o: Obj, key: string, path: string): string[] {
  const list = arr(o[key], `${path}.${key}`);
  return list.map((v, i) => {
    if (typeof v !== 'string' || v === '') {
      throw new ProfileError(`${path}.${key}[${i}]`, 'expected a non-empty string');
    }
    return v;
  });
}

function withoutUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function blockedArc(v: unknown, path: string): BlockedArc {
  const o = obj(v, path);
  onlyKeys(o, path, ['startAz', 'endAz', 'heightDeg']);
  const startAz = num(o, 'startAz', path, 0, 360);
  const endAz = num(o, 'endAz', path, 0, 360);
  const heightDeg = num(o, 'heightDeg', path, 0, 90);
  const span = (endAz - startAz + 360) % 360;
  if (span < MIN_ARC_DEG) {
    throw new ProfileError(
      path,
      `arc must span at least ${MIN_ARC_DEG} degrees, and start and end must differ (start ${startAz}, end ${endAz}; 360 is the same direction as 0)`,
    );
  }
  if (360 - span < MIN_ARC_DEG) {
    throw new ProfileError(
      path,
      `arc must leave at least ${MIN_ARC_DEG} degrees unblocked (start ${startAz}, end ${endAz}); shorten it. Remove the zone if nothing is blocked`,
    );
  }
  if (startAz === 360 || endAz === 360) {
    throw new ProfileError(`${path}.${startAz === 360 ? 'startAz' : 'endAz'}`, 'use 0 instead of 360');
  }
  return { startAz, endAz, heightDeg };
}

function blockedArcs(v: unknown, path: string): BlockedArc[] {
  const list = arr(v, path);
  if (list.length > MAX_ZONES) {
    throw new ProfileError(path, `at most ${MAX_ZONES} blocked zones, got ${list.length}`);
  }
  // Zones may overlap or touch: the blocked region is their union (arcToHorizonPoints).
  const zones = list.map((z, i) => blockedArc(z, `${path}[${i}]`));
  return zones;
}

function timeZone(o: Obj, path: string): string {
  const v = str(o, 'timeZone', path);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
  } catch {
    throw new ProfileError(`${path}.timeZone`, `not a time zone name such as America/Phoenix, got ${JSON.stringify(v)}`);
  }
  return v;
}

/** A hand-edited file may write the class as text ("6"); a whole number in text is read as that number, anything else is rejected at this field. */
function bortle(o: Obj, path: string, strict: boolean): number {
  const raw = o.bortle;
  const asText = typeof raw === 'string' && /^\s*[1-9]\s*$/.test(raw);
  const value = asText ? Number(raw) : raw;
  if (!strict && !inRange(SITE_LIMITS.bortle, value)) return raw as number; // kept and flagged, like the other site numbers
  const v = num({ bortle: value }, 'bortle', path, 1, 9);
  if (!Number.isInteger(v)) throw new ProfileError(`${path}.bortle`, `expected a whole number from 1 to 9, got ${v}`);
  return v;
}

function site(v: unknown, path: string, strict: boolean): ProfileSite {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'latitude', 'longitude', 'elevationM', 'timeZone', 'bortle', 'blockedArcs']);
  if (o.blockedArcs === undefined) throw new ProfileError(`${path}.blockedArcs`, 'expected a list of zones (may be empty)');
  return withoutUndefined({
    id: str(o, 'id', path),
    name: nameOf(o, path, strict),
    latitude: siteNum(o, 'latitude', path, strict),
    longitude: siteNum(o, 'longitude', path, strict),
    elevationM: o.elevationM === undefined ? undefined : siteNum(o, 'elevationM', path, strict),
    timeZone: o.timeZone === undefined ? undefined : timeZone(o, path),
    bortle: o.bortle === undefined ? undefined : bortle(o, path, strict),
    blockedArcs: blockedArcs(o.blockedArcs, `${path}.blockedArcs`),
  });
}

function scope(v: unknown, path: string, strict: boolean): ProfileScope {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'focalLengthMm', 'apertureMm']);
  return withoutUndefined({
    id: str(o, 'id', path),
    name: nameOf(o, path, strict),
    focalLengthMm: optLimited(o, 'focalLengthMm', path, strict),
    apertureMm: optLimited(o, 'apertureMm', path, strict),
  });
}

function accessory(v: unknown, path: string, strict: boolean): ProfileAccessory {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'factor', 'effectiveFocalLengthMm']);
  return withoutUndefined({
    id: str(o, 'id', path),
    name: nameOf(o, path, strict),
    factor: optLimited(o, 'factor', path, strict),
    effectiveFocalLengthMm: optLimited(o, 'effectiveFocalLengthMm', path, strict),
  });
}

function optBool(o: Obj, key: string, path: string): boolean | undefined {
  if (o[key] === undefined) return undefined;
  if (typeof o[key] !== 'boolean') throw new ProfileError(`${path}.${key}`, `expected true or false, got ${JSON.stringify(o[key])}`);
  return o[key] as boolean;
}

const READ_NOISE_CLASSES: readonly ReadNoiseClass[] = ['low', 'medium', 'high'];
const FILTER_KINDS: readonly FilterKind[] = ['broadband-LP', 'dual-band', 'tri-band', 'narrowband', 'UV-IR cut', 'visual-only'];

function camera(v: unknown, path: string, strict: boolean): ProfileCamera {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'pixelSizeUm', 'sensorWidthPx', 'sensorHeightPx', 'colour', 'hasUvIrCut', 'readNoiseClass']);
  if (o.readNoiseClass !== undefined && !READ_NOISE_CLASSES.includes(o.readNoiseClass as ReadNoiseClass)) {
    throw new ProfileError(`${path}.readNoiseClass`, `expected one of ${READ_NOISE_CLASSES.join(', ')}, got ${JSON.stringify(o.readNoiseClass)}`);
  }
  return withoutUndefined({
    id: str(o, 'id', path),
    name: nameOf(o, path, strict),
    pixelSizeUm: optLimited(o, 'pixelSizeUm', path, strict),
    sensorWidthPx: optLimited(o, 'sensorWidthPx', path, strict),
    sensorHeightPx: optLimited(o, 'sensorHeightPx', path, strict),
    colour: optBool(o, 'colour', path),
    hasUvIrCut: optBool(o, 'hasUvIrCut', path),
    readNoiseClass: o.readNoiseClass as ReadNoiseClass | undefined,
  });
}

function filter(v: unknown, path: string, strict: boolean): ProfileFilter {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'kind', 'sizeMm', 'bandpassNotes', 'passbandWidthNm', 'narrowestBandNm', 'blocksUvIr', 'ratedMinFRatio', 'maxIncidentAngleDeg']);
  if (o.kind !== undefined && !FILTER_KINDS.includes(o.kind as FilterKind)) {
    throw new ProfileError(`${path}.kind`, `expected one of ${FILTER_KINDS.join(', ')}, got ${JSON.stringify(o.kind)}`);
  }
  return withoutUndefined({
    id: str(o, 'id', path),
    name: nameOf(o, path, strict),
    kind: o.kind as FilterKind | undefined,
    sizeMm: optLimited(o, 'sizeMm', path, strict),
    bandpassNotes: o.bandpassNotes === undefined ? undefined : str(o, 'bandpassNotes', path),
    passbandWidthNm: optLimited(o, 'passbandWidthNm', path, strict),
    narrowestBandNm: optLimited(o, 'narrowestBandNm', path, strict),
    blocksUvIr: optBool(o, 'blocksUvIr', path),
    ratedMinFRatio: optLimited(o, 'ratedMinFRatio', path, strict),
    maxIncidentAngleDeg: optLimited(o, 'maxIncidentAngleDeg', path, strict),
  });
}

function smartScope(v: unknown, path: string, strict: boolean): ProfileSmartScope {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'mountMode', 'focalLengthMm', 'apertureMm', 'pixelSizeUm', 'sensorWidthPx', 'sensorHeightPx']);
  if (o.mountMode !== 'alt-az' && o.mountMode !== 'eq') {
    throw new ProfileError(`${path}.mountMode`, `expected "alt-az" or "eq", got ${JSON.stringify(o.mountMode)}`);
  }
  return withoutUndefined({
    id: str(o, 'id', path),
    name: nameOf(o, path, strict),
    mountMode: o.mountMode,
    focalLengthMm: optLimited(o, 'focalLengthMm', path, strict),
    apertureMm: optLimited(o, 'apertureMm', path, strict),
    pixelSizeUm: optLimited(o, 'pixelSizeUm', path, strict),
    sensorWidthPx: optLimited(o, 'sensorWidthPx', path, strict),
    sensorHeightPx: optLimited(o, 'sensorHeightPx', path, strict),
  });
}

function trainTag(o: Record<string, unknown>, path: string): 'planetary' {
  if (o.tag !== 'planetary') throw new ProfileError(`${path}.tag`, `expected "planetary", got ${JSON.stringify(o.tag)}`);
  return 'planetary';
}

function train(v: unknown, path: string, strict: boolean): TrainEntry {
  const o = obj(v, path);
  if (o.kind === 'optical') {
    onlyKeys(o, path, ['kind', 'id', 'name', 'scopeId', 'accessoryIds', 'cameraId', 'filterId', 'tag']);
    return withoutUndefined({
      kind: 'optical' as const,
      id: str(o, 'id', path),
      name: nameOf(o, path, strict),
      scopeId: str(o, 'scopeId', path),
      accessoryIds: strings(o, 'accessoryIds', path),
      cameraId: str(o, 'cameraId', path),
      filterId: o.filterId === undefined ? undefined : str(o, 'filterId', path),
      tag: o.tag === undefined ? undefined : trainTag(o, path),
    });
  }
  if (o.kind === 'smart') {
    onlyKeys(o, path, ['kind', 'id', 'name', 'smartScopeId']);
    return {
      kind: 'smart',
      id: str(o, 'id', path),
      name: nameOf(o, path, strict),
      smartScopeId: str(o, 'smartScopeId', path),
    };
  }
  throw new ProfileError(`${path}.kind`, `expected "optical" or "smart", got ${JSON.stringify(o.kind)}`);
}

function plan(v: unknown, path: string): ObservingPlan {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'date', 'siteId', 'trainId', 'targetIds', 'notes']);
  const date = str(o, 'date', path);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !d || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    throw new ProfileError(`${path}.date`, `expected a real date as YYYY-MM-DD, got ${JSON.stringify(date)}`);
  }
  return {
    id: str(o, 'id', path),
    name: str(o, 'name', path),
    date,
    siteId: str(o, 'siteId', path),
    trainId: str(o, 'trainId', path),
    targetIds: strings(o, 'targetIds', path),
    notes: str(o, 'notes', path, true),
  };
}

function list<T extends { id: string }>(v: unknown, path: string, item: (x: unknown, p: string) => T): T[] {
  const out = arr(v, path).map((x, i) => item(x, `${path}[${i}]`));
  const seen = new Set<string>();
  out.forEach((x, i) => {
    if (seen.has(x.id)) throw new ProfileError(`${path}[${i}].id`, `duplicate id "${x.id}"`);
    seen.add(x.id);
  });
  return out;
}

/** Checks a parsed JSON value and returns it as a Profile, or throws ProfileError with the field path. */
export function validateProfile(raw: unknown, options: { lenient?: boolean } = {}): Profile {
  const strict = options.lenient !== true;
  const input = migrateProfile(raw);
  const o = obj(input, '$');
  onlyKeys(o, '$', ['version', 'sites', 'equipment', 'trains', 'plans']);
  if (o.version !== PROFILE_VERSION) {
    throw new ProfileError('$.version', `expected ${PROFILE_VERSION}, got ${JSON.stringify(o.version)}`);
  }
  const eq = obj(o.equipment, '$.equipment');
  onlyKeys(eq, '$.equipment', ['scopes', 'accessories', 'cameras', 'smartScopes', 'filters']);
  const profile: Profile = {
    version: PROFILE_VERSION,
    sites: list(o.sites, '$.sites', (x, p) => site(x, p, strict)),
    equipment: {
      scopes: list(eq.scopes, '$.equipment.scopes', (x, p) => scope(x, p, strict)),
      accessories: list(eq.accessories, '$.equipment.accessories', (x, p) => accessory(x, p, strict)),
      cameras: list(eq.cameras, '$.equipment.cameras', (x, p) => camera(x, p, strict)),
      smartScopes: list(eq.smartScopes, '$.equipment.smartScopes', (x, p) => smartScope(x, p, strict)),
      filters: list(eq.filters, '$.equipment.filters', (x, p) => filter(x, p, strict)),
    },
    trains: list(o.trains, '$.trains', (x, p) => train(x, p, strict)),
    plans: list(o.plans, '$.plans', plan),
  };

  const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
  const scopes = ids(profile.equipment.scopes);
  const accessories = ids(profile.equipment.accessories);
  const cameras = ids(profile.equipment.cameras);
  const smart = ids(profile.equipment.smartScopes);
  const filters = ids(profile.equipment.filters);
  const mustExist = (set: Set<string>, id: string, path: string, what: string): void => {
    if (!set.has(id)) throw new ProfileError(path, `unknown ${what} "${id}"`);
  };
  profile.trains.forEach((t, i) => {
    const p = `$.trains[${i}]`;
    if (t.kind === 'optical') {
      mustExist(scopes, t.scopeId, `${p}.scopeId`, 'scope');
      mustExist(cameras, t.cameraId, `${p}.cameraId`, 'camera');
      if (t.filterId !== undefined) mustExist(filters, t.filterId, `${p}.filterId`, 'filter');
      t.accessoryIds.forEach((a, j) => mustExist(accessories, a, `${p}.accessoryIds[${j}]`, 'accessory'));
    } else {
      mustExist(smart, t.smartScopeId, `${p}.smartScopeId`, 'smart scope');
    }
  });
  profile.plans.forEach((pl, i) => {
    mustExist(ids(profile.sites), pl.siteId, `$.plans[${i}].siteId`, 'site');
    mustExist(ids(profile.trains), pl.trainId, `$.plans[${i}].trainId`, 'train');
  });
  return profile;
}

/** Parses profile JSON text. Malformed JSON and invalid profiles both throw ProfileError. */
export function parseProfile(text: string, options: { lenient?: boolean } = {}): Profile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new ProfileError('$', `not valid JSON (${(e as Error).message})`);
  }
  return validateProfile(json, options);
}

export function emptyProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    sites: [],
    equipment: { scopes: [], accessories: [], cameras: [], smartScopes: [], filters: [] },
    trains: [],
    plans: [],
  };
}
