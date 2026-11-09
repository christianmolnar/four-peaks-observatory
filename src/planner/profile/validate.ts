import { migrateProfile } from './migrate';
import { PROFILE_VERSION } from './types';
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

/** Optional positive number: absent is allowed ("unknown"), anything else must be valid. */
function optPositive(o: Obj, key: string, path: string): number | undefined {
  if (o[key] === undefined) return undefined;
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new ProfileError(`${path}.${key}`, `expected a positive number, got ${JSON.stringify(v)}`);
  }
  return v;
}

function optPositiveInt(o: Obj, key: string, path: string): number | undefined {
  const v = optPositive(o, key, path);
  if (v !== undefined && !Number.isInteger(v)) {
    throw new ProfileError(`${path}.${key}`, `expected a whole number, got ${v}`);
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

function blockedArc(v: unknown, path: string): BlockedArc | null {
  if (v === null) return null;
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
      `arc must leave at least ${MIN_ARC_DEG} degrees unblocked (start ${startAz}, end ${endAz}); shorten it. Use null only when nothing is blocked`,
    );
  }
  if (startAz === 360 || endAz === 360) {
    throw new ProfileError(`${path}.${startAz === 360 ? 'startAz' : 'endAz'}`, 'use 0 instead of 360');
  }
  return { startAz, endAz, heightDeg };
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

function site(v: unknown, path: string): ProfileSite {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'latitude', 'longitude', 'elevationM', 'timeZone', 'blockedArc']);
  if (o.blockedArc === undefined) throw new ProfileError(`${path}.blockedArc`, 'expected an arc object or null');
  return withoutUndefined({
    id: str(o, 'id', path),
    name: str(o, 'name', path),
    latitude: num(o, 'latitude', path, -90, 90),
    longitude: num(o, 'longitude', path, -180, 180),
    elevationM: o.elevationM === undefined ? undefined : num(o, 'elevationM', path, -500, 9000),
    timeZone: o.timeZone === undefined ? undefined : timeZone(o, path),
    blockedArc: blockedArc(o.blockedArc, `${path}.blockedArc`),
  });
}

function scope(v: unknown, path: string): ProfileScope {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'focalLengthMm', 'apertureMm']);
  return withoutUndefined({
    id: str(o, 'id', path),
    name: str(o, 'name', path),
    focalLengthMm: optPositive(o, 'focalLengthMm', path),
    apertureMm: optPositive(o, 'apertureMm', path),
  });
}

function accessory(v: unknown, path: string): ProfileAccessory {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'factor', 'effectiveFocalLengthMm']);
  return withoutUndefined({
    id: str(o, 'id', path),
    name: str(o, 'name', path),
    factor: optPositive(o, 'factor', path),
    effectiveFocalLengthMm: optPositive(o, 'effectiveFocalLengthMm', path),
  });
}

function optBool(o: Obj, key: string, path: string): boolean | undefined {
  if (o[key] === undefined) return undefined;
  if (typeof o[key] !== 'boolean') throw new ProfileError(`${path}.${key}`, `expected true or false, got ${JSON.stringify(o[key])}`);
  return o[key] as boolean;
}

const READ_NOISE_CLASSES: readonly ReadNoiseClass[] = ['low', 'medium', 'high'];
const FILTER_KINDS: readonly FilterKind[] = ['broadband-LP', 'dual-band', 'tri-band', 'narrowband', 'UV-IR cut', 'visual-only'];

function camera(v: unknown, path: string): ProfileCamera {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'pixelSizeUm', 'sensorWidthPx', 'sensorHeightPx', 'colour', 'hasUvIrCut', 'readNoiseClass']);
  if (o.readNoiseClass !== undefined && !READ_NOISE_CLASSES.includes(o.readNoiseClass as ReadNoiseClass)) {
    throw new ProfileError(`${path}.readNoiseClass`, `expected one of ${READ_NOISE_CLASSES.join(', ')}, got ${JSON.stringify(o.readNoiseClass)}`);
  }
  return withoutUndefined({
    id: str(o, 'id', path),
    name: str(o, 'name', path),
    pixelSizeUm: optPositive(o, 'pixelSizeUm', path),
    sensorWidthPx: optPositiveInt(o, 'sensorWidthPx', path),
    sensorHeightPx: optPositiveInt(o, 'sensorHeightPx', path),
    colour: optBool(o, 'colour', path),
    hasUvIrCut: optBool(o, 'hasUvIrCut', path),
    readNoiseClass: o.readNoiseClass as ReadNoiseClass | undefined,
  });
}

function filter(v: unknown, path: string): ProfileFilter {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'kind', 'sizeMm', 'bandpassNotes', 'passbandWidthNm', 'narrowestBandNm', 'blocksUvIr', 'ratedMinFRatio', 'maxIncidentAngleDeg']);
  if (o.kind !== undefined && !FILTER_KINDS.includes(o.kind as FilterKind)) {
    throw new ProfileError(`${path}.kind`, `expected one of ${FILTER_KINDS.join(', ')}, got ${JSON.stringify(o.kind)}`);
  }
  const angle = optPositive(o, 'maxIncidentAngleDeg', path);
  if (angle !== undefined && angle >= 90) throw new ProfileError(`${path}.maxIncidentAngleDeg`, `expected less than 90, got ${angle}`);
  return withoutUndefined({
    id: str(o, 'id', path),
    name: str(o, 'name', path),
    kind: o.kind as FilterKind | undefined,
    sizeMm: optPositive(o, 'sizeMm', path),
    bandpassNotes: o.bandpassNotes === undefined ? undefined : str(o, 'bandpassNotes', path),
    passbandWidthNm: optPositive(o, 'passbandWidthNm', path),
    narrowestBandNm: optPositive(o, 'narrowestBandNm', path),
    blocksUvIr: optBool(o, 'blocksUvIr', path),
    ratedMinFRatio: optPositive(o, 'ratedMinFRatio', path),
    maxIncidentAngleDeg: angle,
  });
}

function smartScope(v: unknown, path: string): ProfileSmartScope {
  const o = obj(v, path);
  onlyKeys(o, path, ['id', 'name', 'mountMode', 'focalLengthMm', 'apertureMm', 'pixelSizeUm', 'sensorWidthPx', 'sensorHeightPx']);
  if (o.mountMode !== 'alt-az' && o.mountMode !== 'eq') {
    throw new ProfileError(`${path}.mountMode`, `expected "alt-az" or "eq", got ${JSON.stringify(o.mountMode)}`);
  }
  return withoutUndefined({
    id: str(o, 'id', path),
    name: str(o, 'name', path),
    mountMode: o.mountMode,
    focalLengthMm: optPositive(o, 'focalLengthMm', path),
    apertureMm: optPositive(o, 'apertureMm', path),
    pixelSizeUm: optPositive(o, 'pixelSizeUm', path),
    sensorWidthPx: optPositiveInt(o, 'sensorWidthPx', path),
    sensorHeightPx: optPositiveInt(o, 'sensorHeightPx', path),
  });
}

function train(v: unknown, path: string): TrainEntry {
  const o = obj(v, path);
  if (o.kind === 'optical') {
    onlyKeys(o, path, ['kind', 'id', 'name', 'scopeId', 'accessoryIds', 'cameraId', 'filterId']);
    return withoutUndefined({
      kind: 'optical' as const,
      id: str(o, 'id', path),
      name: str(o, 'name', path),
      scopeId: str(o, 'scopeId', path),
      accessoryIds: strings(o, 'accessoryIds', path),
      cameraId: str(o, 'cameraId', path),
      filterId: o.filterId === undefined ? undefined : str(o, 'filterId', path),
    });
  }
  if (o.kind === 'smart') {
    onlyKeys(o, path, ['kind', 'id', 'name', 'smartScopeId']);
    return {
      kind: 'smart',
      id: str(o, 'id', path),
      name: str(o, 'name', path),
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
export function validateProfile(raw: unknown): Profile {
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
    sites: list(o.sites, '$.sites', site),
    equipment: {
      scopes: list(eq.scopes, '$.equipment.scopes', scope),
      accessories: list(eq.accessories, '$.equipment.accessories', accessory),
      cameras: list(eq.cameras, '$.equipment.cameras', camera),
      smartScopes: list(eq.smartScopes, '$.equipment.smartScopes', smartScope),
      filters: list(eq.filters, '$.equipment.filters', filter),
    },
    trains: list(o.trains, '$.trains', train),
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
export function parseProfile(text: string): Profile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new ProfileError('$', `not valid JSON (${(e as Error).message})`);
  }
  return validateProfile(json);
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
