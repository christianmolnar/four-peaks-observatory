import { PROFILE_VERSION, ProfileError, migrateProfile, validateProfile } from '../profile';
import type { Profile, TrainEntry } from '../profile';
import { resolveTrain } from '../profile';

/** The lists a guest can edit item by item. */
export type ListKey = 'sites' | 'scopes' | 'accessories' | 'cameras' | 'smartScopes' | 'filters';

export interface FieldSpec {
  key: string;
  label: string;
  /** text: free text. number: a number or empty (unknown). choice: one of `options`, or empty (unknown). tristate: yes, no or empty (unknown). */
  kind: 'text' | 'number' | 'choice' | 'tristate';
  options?: readonly string[];
  unit?: string;
  /** Empty is refused. */
  required?: boolean;
}

export interface ListSpec {
  title: string;
  noun: string;
  fields: readonly FieldSpec[];
}

const NAME: FieldSpec = { key: 'name', label: 'Name', kind: 'text', required: true };

export const LIST_SPECS: Record<ListKey, ListSpec> = {
  sites: {
    title: 'Site',
    noun: 'site',
    fields: [
      NAME,
      { key: 'latitude', label: 'Latitude', kind: 'number', unit: 'deg, north is positive', required: true },
      { key: 'longitude', label: 'Longitude', kind: 'number', unit: 'deg, east is positive', required: true },
      { key: 'elevationM', label: 'Elevation', kind: 'number', unit: 'm' },
      { key: 'timeZone', label: 'Time zone', kind: 'text', unit: 'e.g. America/Phoenix; empty uses your browser' },
    ],
  },
  scopes: {
    title: 'Scopes',
    noun: 'scope',
    fields: [NAME, { key: 'focalLengthMm', label: 'Focal length', kind: 'number', unit: 'mm' }, { key: 'apertureMm', label: 'Aperture', kind: 'number', unit: 'mm' }],
  },
  accessories: {
    title: 'Accessories (reducers, extenders, HyperStar)',
    noun: 'accessory',
    fields: [
      NAME,
      { key: 'factor', label: 'Focal length factor', kind: 'number', unit: '0.7 reducer, 2.5 extender' },
      { key: 'effectiveFocalLengthMm', label: 'Whole-scope focal length', kind: 'number', unit: 'mm, only for HyperStar-type parts' },
    ],
  },
  cameras: {
    title: 'Cameras',
    noun: 'camera',
    fields: [
      NAME,
      { key: 'pixelSizeUm', label: 'Pixel size', kind: 'number', unit: 'µm' },
      { key: 'sensorWidthPx', label: 'Sensor width', kind: 'number', unit: 'px' },
      { key: 'sensorHeightPx', label: 'Sensor height', kind: 'number', unit: 'px' },
      { key: 'colour', label: 'Colour sensor', kind: 'tristate' },
      { key: 'hasUvIrCut', label: 'Has its own UV/IR cut', kind: 'tristate' },
      { key: 'readNoiseClass', label: 'Read noise', kind: 'choice', options: ['low', 'medium', 'high'] },
    ],
  },
  smartScopes: {
    title: 'Smart scopes',
    noun: 'smart scope',
    fields: [
      NAME,
      { key: 'mountMode', label: 'Mount mode', kind: 'choice', options: ['alt-az', 'eq'], required: true },
      { key: 'focalLengthMm', label: 'Focal length', kind: 'number', unit: 'mm' },
      { key: 'apertureMm', label: 'Aperture', kind: 'number', unit: 'mm' },
      { key: 'pixelSizeUm', label: 'Pixel size', kind: 'number', unit: 'µm' },
      { key: 'sensorWidthPx', label: 'Sensor width', kind: 'number', unit: 'px' },
      { key: 'sensorHeightPx', label: 'Sensor height', kind: 'number', unit: 'px' },
    ],
  },
  filters: {
    title: 'Filters',
    noun: 'filter',
    fields: [
      NAME,
      { key: 'kind', label: 'Kind', kind: 'choice', options: ['broadband-LP', 'dual-band', 'tri-band', 'narrowband', 'UV-IR cut', 'visual-only'] },
      { key: 'sizeMm', label: 'Size', kind: 'number', unit: 'mm' },
      { key: 'bandpassNotes', label: 'Bandpass notes', kind: 'text' },
      { key: 'passbandWidthNm', label: 'Total passband width', kind: 'number', unit: 'nm' },
      { key: 'narrowestBandNm', label: 'Narrowest band', kind: 'number', unit: 'nm' },
      { key: 'blocksUvIr', label: 'Blocks UV and IR itself', kind: 'tristate' },
      { key: 'ratedMinFRatio', label: 'Fastest rated focal ratio', kind: 'number', unit: 'f/' },
      { key: 'maxIncidentAngleDeg', label: 'Largest incident angle', kind: 'number', unit: 'deg' },
    ],
  },
};

type Item = { id: string; name: string } & Record<string, unknown>;

function itemsOf(profile: Profile, list: ListKey): Item[] {
  return (list === 'sites' ? profile.sites : profile.equipment[list]) as unknown as Item[];
}

function withItems(profile: Profile, list: ListKey, items: Item[]): Profile {
  if (list === 'sites') return { ...profile, sites: items as unknown as Profile['sites'] };
  return { ...profile, equipment: { ...profile.equipment, [list]: items } };
}

/** The text of each box for one item, as the form shows it. */
export function textsOf(list: ListKey, item: object): Record<string, string> {
  const rec = item as Record<string, unknown>;
  return Object.fromEntries(
    LIST_SPECS[list].fields.map((f) => {
      const v = rec[f.key];
      if (v === undefined) return [f.key, ''];
      if (f.kind === 'tristate') return [f.key, v ? 'yes' : 'no'];
      return [f.key, String(v)];
    }),
  );
}

/** Message for the box a validator path points at: "Latitude: expected a number from -90 to 90, got 95". */
function friendly(e: unknown, list: ListKey): Error {
  if (!(e instanceof ProfileError)) return e as Error;
  const key = /\.([A-Za-z]+)$/.exec(e.path)?.[1];
  const label = LIST_SPECS[list].fields.find((f) => f.key === key)?.label;
  const detail = e.message.slice(e.path.length + 2);
  return new Error(label ? `${label}: ${detail}` : detail);
}

/** Builds the item from the boxes. Throws an Error naming the box that is wrong. */
function itemFromTexts(list: ListKey, base: Item, texts: Record<string, string>): Item {
  const out: Record<string, unknown> = { id: base.id };
  if (list === 'sites') out.blockedArc = (base as Record<string, unknown>).blockedArc ?? null;
  for (const f of LIST_SPECS[list].fields) {
    const t = (texts[f.key] ?? '').trim();
    if (t === '') {
      if (f.required) throw new Error(`${f.label}: required.`);
      continue;
    }
    if (f.kind === 'number') {
      const n = Number(t);
      if (!Number.isFinite(n)) throw new Error(`${f.label}: enter a number, got "${t}".`);
      out[f.key] = n;
    } else if (f.kind === 'tristate') {
      if (t !== 'yes' && t !== 'no') throw new Error(`${f.label}: choose yes, no or leave empty.`);
      out[f.key] = t === 'yes';
    } else if (f.kind === 'choice') {
      if (!f.options?.includes(t)) throw new Error(`${f.label}: choose one of ${f.options?.join(', ')}.`);
      out[f.key] = t;
    } else {
      out[f.key] = t;
    }
  }
  return out as Item;
}

/** A copy of the profile with one item rebuilt from its boxes, validated. The input is unchanged. */
export function replaceItem(profile: Profile, list: ListKey, id: string, texts: Record<string, string>): Profile {
  const items = itemsOf(profile, list);
  const base = items.find((x) => x.id === id);
  if (!base) throw new Error(`Unknown ${LIST_SPECS[list].noun} "${id}".`);
  const item = itemFromTexts(list, base, texts);
  try {
    return validateProfile(withItems(profile, list, items.map((x) => (x.id === id ? item : x))));
  } catch (e) {
    throw friendly(e, list);
  }
}

function newId(prefix: string, taken: Iterable<string>): string {
  const ids = new Set(taken);
  for (let n = 1; ; n++) if (!ids.has(`${prefix}-${n}`)) return `${prefix}-${n}`;
}

const allTrainIds = (p: Profile) => p.trains.map((t) => t.id);

/** A copy with one new item. A new site copies the first site's coordinates (edit them) and blocks nothing. */
export function addItem(profile: Profile, list: ListKey): Profile {
  const items = itemsOf(profile, list);
  const id = newId(`my-${list === 'smartScopes' ? 'smart-scope' : LIST_SPECS[list].noun}`, items.map((x) => x.id));
  const name = `New ${LIST_SPECS[list].noun}`;
  const item: Record<string, unknown> =
    list === 'sites'
      ? { id, name, latitude: profile.sites[0]?.latitude ?? 0, longitude: profile.sites[0]?.longitude ?? 0, blockedArc: null }
      : list === 'smartScopes'
        ? { id, name, mountMode: 'alt-az' }
        : { id, name };
  return validateProfile(withItems(profile, list, [...items, item as Item]));
}

/** Trains and plans that still use an item. */
function usedBy(profile: Profile, list: ListKey, id: string): string[] {
  if (list === 'sites') return profile.plans.filter((p) => p.siteId === id).map((p) => p.name);
  return profile.trains
    .filter((t) => {
      if (t.kind === 'smart') return list === 'smartScopes' && t.smartScopeId === id;
      return (
        (list === 'scopes' && t.scopeId === id) ||
        (list === 'cameras' && t.cameraId === id) ||
        (list === 'filters' && t.filterId === id) ||
        (list === 'accessories' && t.accessoryIds.includes(id))
      );
    })
    .map((t) => t.name);
}

/** A copy without the item. Refuses when a train or plan uses it, or it is the last site. */
export function removeItem(profile: Profile, list: ListKey, id: string): Profile {
  if (list === 'sites' && profile.sites.length <= 1) throw new Error('The planner needs at least one site.');
  const users = usedBy(profile, list, id);
  if (users.length > 0) {
    const shown = users.slice(0, 3).map((n) => `"${n}"`).join(', ');
    throw new Error(`Cannot remove it: ${shown}${users.length > 3 ? ` and ${users.length - 3} more` : ''} still uses it. Change or remove that first.`);
  }
  return validateProfile(withItems(profile, list, itemsOf(profile, list).filter((x) => x.id !== id)));
}

export interface OpticalTrainParts {
  name: string;
  scopeId: string;
  accessoryIds: string[];
  cameraId: string;
  /** Empty: no filter. */
  filterId: string;
}
export interface SmartTrainParts {
  name: string;
  smartScopeId: string;
}

function checkTrains(profile: Profile, trains: TrainEntry[]): Profile {
  let next: Profile;
  try {
    next = validateProfile({ ...profile, trains });
  } catch (e) {
    if (e instanceof ProfileError) throw new Error(e.message.slice(e.path.length + 2));
    throw e;
  }
  for (const t of next.trains) resolveTrain(next, t); // throws, in words, for two HyperStar-type parts
  return next;
}

/** A copy with one train rebuilt from its parts, validated. */
export function replaceTrain(profile: Profile, id: string, parts: OpticalTrainParts | SmartTrainParts): Profile {
  const old = profile.trains.find((t) => t.id === id);
  if (!old) throw new Error(`Unknown train "${id}".`);
  if (parts.name.trim() === '') throw new Error('Name: required.');
  const next: TrainEntry =
    'smartScopeId' in parts
      ? { kind: 'smart', id, name: parts.name.trim(), smartScopeId: parts.smartScopeId }
      : {
          kind: 'optical',
          id,
          name: parts.name.trim(),
          scopeId: parts.scopeId,
          accessoryIds: parts.accessoryIds,
          cameraId: parts.cameraId,
          ...(parts.filterId === '' ? {} : { filterId: parts.filterId }),
        };
  return checkTrains(profile, profile.trains.map((t) => (t.id === id ? next : t)));
}

export function addTrain(profile: Profile, kind: 'optical' | 'smart'): Profile {
  const id = newId('my-train', allTrainIds(profile));
  if (kind === 'smart') {
    const s = profile.equipment.smartScopes[0];
    if (!s) throw new Error('Add a smart scope first.');
    return checkTrains(profile, [...profile.trains, { kind: 'smart', id, name: 'New smart-scope train', smartScopeId: s.id }]);
  }
  const scope = profile.equipment.scopes[0];
  const camera = profile.equipment.cameras[0];
  if (!scope || !camera) throw new Error('Add a scope and a camera first.');
  return checkTrains(profile, [...profile.trains, { kind: 'optical', id, name: 'New train', scopeId: scope.id, accessoryIds: [], cameraId: camera.id }]);
}

export function removeTrain(profile: Profile, id: string): Profile {
  if (profile.trains.length <= 1) throw new Error('The planner needs at least one train.');
  const plans = profile.plans.filter((p) => p.trainId === id).map((p) => p.name);
  if (plans.length > 0) throw new Error(`Cannot remove it: plan ${plans.map((n) => `"${n}"`).join(', ')} uses it.`);
  return checkTrains(profile, profile.trains.filter((t) => t.id !== id));
}

/** Import limit: a real profile is a few tens of kB. */
export const MAX_IMPORT_CHARS = 2_000_000;

const NOT_A_PROFILE = 'This file is not a planner profile.';

/** Plain-language text for any error from reading an imported file. */
export function describeImportError(e: unknown): string {
  if (e instanceof ProfileError) {
    if (e.path === '$' && /not valid JSON/.test(e.message)) return `${NOT_A_PROFILE} It is not valid JSON.`;
    if (e.path === '$.version') return `${NOT_A_PROFILE} ${e.message.slice(e.path.length + 2)}.`;
    return `${NOT_A_PROFILE} Problem at ${e.path}: ${e.message.slice(e.path.length + 2)}`;
  }
  return `The file could not be read: ${(e as Error).message}`;
}

/**
 * Reads exported profile text into a Profile. Throws an Error whose message is ready to show:
 * empty, too large, not JSON, not an object, no version, a version this planner does not read,
 * or the first invalid field with its path.
 */
export function profileFromText(text: string): Profile {
  if (text.trim() === '') throw new Error(`${NOT_A_PROFILE} The file is empty.`);
  if (text.length > MAX_IMPORT_CHARS) throw new Error(`${NOT_A_PROFILE} The file is too large.`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${NOT_A_PROFILE} It is not valid JSON.`);
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error(`${NOT_A_PROFILE} Expected an object with sites, equipment and trains.`);
  }
  const migrated = migrateProfile(json) as Record<string, unknown>;
  if (migrated.version === undefined) throw new Error(`${NOT_A_PROFILE} It has no version number.`);
  if (migrated.version !== PROFILE_VERSION) {
    throw new Error(`${NOT_A_PROFILE} It is version ${JSON.stringify(migrated.version)}; this planner reads version ${PROFILE_VERSION} (and upgrades version 1).`);
  }
  try {
    return validateProfile(migrated);
  } catch (e) {
    throw new Error(describeImportError(e));
  }
}
