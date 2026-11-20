import { MAX_NAME_CHARS, PROFILE_VERSION, ProfileError, enterText, migrateProfile, rangeProblem, rangeText, usableSites, validateProfile } from '../profile';
import { limitOf } from '../profile/limits';
import { bandSums, bandsFromTexts, bandsToTexts } from '../profile/passbands';
import type { Profile, TrainEntry } from '../profile';
import { resolveTrain } from '../profile';
import { DEFAULT_BORTLE } from '../exposure';
import { UsedError, isUsed, refusalText, usesOf } from './gear';
import { profileProblemText } from './words';
import type { PlanRef } from './gear';

/** The lists a guest can edit item by item. */
export type ListKey = 'sites' | 'scopes' | 'accessories' | 'cameras' | 'smartScopes' | 'filters';

export interface FieldSpec {
  key: string;
  label: string;
  /** text: free text. number: a number or empty (unknown). choice: one of `options`, or empty (unknown). tristate: yes, no or empty (unknown). */
  kind: 'text' | 'number' | 'choice' | 'tristate';
  options?: readonly string[];
  /** A choice whose options are numbers: the chosen text is stored as a number. */
  numeric?: boolean;
  /** Text of the empty choice of an optional `choice`; default "Unknown". */
  emptyText?: string;
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
      { key: 'latitude', label: 'Latitude', kind: 'number', unit: 'north is positive', required: true },
      { key: 'longitude', label: 'Longitude', kind: 'number', unit: 'east is positive', required: true },
      { key: 'elevationM', label: 'Elevation', kind: 'number' },
      { key: 'timeZone', label: 'Time zone', kind: 'text', unit: 'e.g. America/Phoenix; empty uses your browser' },
      { key: 'bortle', label: 'Sky darkness, Bortle class', kind: 'choice', numeric: true, emptyText: `Not set (${DEFAULT_BORTLE} assumed)`, options: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], unit: '1 to 9, 1 is darkest' },
    ],
  },
  scopes: {
    title: 'Scopes',
    noun: 'scope',
    fields: [NAME, { key: 'focalLengthMm', label: 'Focal length', kind: 'number' }, { key: 'apertureMm', label: 'Aperture', kind: 'number' }],
  },
  accessories: {
    title: 'Accessories (reducers, extenders, HyperStar)',
    noun: 'accessory',
    fields: [
      NAME,
      { key: 'factor', label: 'Focal length factor', kind: 'number', unit: '0.7 is a reducer, 2.5 an extender' },
      { key: 'effectiveFocalLengthMm', label: 'Whole-scope focal length', kind: 'number', unit: 'only for HyperStar-type parts' },
    ],
  },
  cameras: {
    title: 'Cameras',
    noun: 'camera',
    fields: [
      NAME,
      { key: 'pixelSizeUm', label: 'Pixel size', kind: 'number' },
      { key: 'sensorWidthPx', label: 'Sensor width', kind: 'number' },
      { key: 'sensorHeightPx', label: 'Sensor height', kind: 'number' },
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
      { key: 'focalLengthMm', label: 'Focal length', kind: 'number' },
      { key: 'apertureMm', label: 'Aperture', kind: 'number' },
      { key: 'pixelSizeUm', label: 'Pixel size', kind: 'number' },
      { key: 'sensorWidthPx', label: 'Sensor width', kind: 'number' },
      { key: 'sensorHeightPx', label: 'Sensor height', kind: 'number' },
    ],
  },
  filters: {
    title: 'Filters',
    noun: 'filter',
    fields: [
      NAME,
      { key: 'kind', label: 'Kind', kind: 'choice', options: ['broadband-LP', 'dual-band', 'tri-band', 'narrowband', 'UV-IR cut', 'visual-only'] },
      { key: 'sizeMm', label: 'Size', kind: 'number' },
      { key: 'bandpassNotes', label: 'Bandpass notes', kind: 'text' },
      { key: 'passbandWidthNm', label: 'Total passband width', kind: 'number' },
      { key: 'narrowestBandNm', label: 'Narrowest band', kind: 'number' },
      { key: 'blocksUvIr', label: 'Blocks UV and IR itself', kind: 'tristate' },
      { key: 'needsUvIrCut', label: 'Needs a UV/IR cut in the light path', kind: 'tristate' },
      { key: 'ratedMinFRatio', label: 'Fastest rated focal ratio', kind: 'number', unit: 'f/ number' },
      { key: 'maxIncidentAngleDeg', label: 'Largest incident angle', kind: 'number' },
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

/** The text of each box for one item, as the form shows it. A filter also has the twelve passband boxes (the bands' centres and widths; none: all empty). */
export function textsOf(list: ListKey, item: object): Record<string, string> {
  const rec = item as Record<string, unknown>;
  const bands = list === 'filters' && Array.isArray(rec.passbands) ? (rec.passbands as { centreNm: number; widthNm: number }[]) : undefined;
  return Object.assign(list === 'filters' ? bandsToTexts(bands) : {}, Object.fromEntries(
    LIST_SPECS[list].fields.map((f) => {
      const v = rec[f.key];
      if (v === undefined || v === null) return [f.key, ''];
      if (f.kind === 'tristate') return [f.key, v ? 'yes' : 'no'];
      // A stored number box holds a number or the text that was saved; anything else (an object, a list) is an empty box, never "[object Object]".
      if (f.kind === 'number' && typeof v !== 'number' && typeof v !== 'string') return [f.key, ''];
      return [f.key, String(v)];
    }),
  ));
}

/** The hint after a box's label: its note, then the allowed range ("north is positive; -90 to 90 deg"). */
export function boxHint(f: FieldSpec): string {
  const limit = f.kind === 'number' ? limitOf(f.key) : undefined;
  return [f.unit, limit ? rangeText(limit) : ''].filter((x) => x !== undefined && x !== '').join('; ');
}

/** Message for the box a validator path points at; the validator's own text is already a plain sentence. */
function friendly(e: unknown, list: ListKey): Error {
  if (!(e instanceof ProfileError)) return e as Error;
  const key = /\.([A-Za-z]+)$/.exec(e.path)?.[1];
  const label = LIST_SPECS[list].fields.find((f) => f.key === key)?.label;
  const detail = e.message.slice(e.path.length + 2);
  return new Error(label ? `${label}: ${detail}` : detail);
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A name for one item: not empty, at most MAX_NAME_CHARS characters, and not another item's name in `others`. */
export function checkName(raw: string, noun: string, others: readonly string[]): string {
  const name = raw.trim();
  if (name === '') throw new Error(`Name: enter a name for this ${noun}.`);
  if (name.length > MAX_NAME_CHARS) throw new Error(`Name: use at most ${MAX_NAME_CHARS} characters. This one has ${name.length}.`);
  if (others.some((o) => sameName(o, name))) throw new Error(`Name: there is already a ${noun} named "${name}". Give this one a different name.`);
  return name;
}

/** Builds the item from the boxes. Throws an Error with a plain sentence for the box that is wrong. */
function itemFromTexts(list: ListKey, base: Item, texts: Record<string, string>, others: readonly string[], aiFilled: boolean): Item {
  const out: Record<string, unknown> = { id: base.id };
  // The passband boxes of a filter: judged first so a refused row is said, and the two sums follow them.
  const bandsRead = list === 'filters' ? bandsFromTexts(texts) : undefined;
  const bands = bandsRead && 'bands' in bandsRead && bandsRead.bands.length > 0 ? bandsRead.bands : undefined;
  if (list === 'sites') out.blockedArcs = (base as Record<string, unknown>).blockedArcs ?? [];
  for (const f of LIST_SPECS[list].fields) {
    const t = (texts[f.key] ?? '').trim();
    const limit = f.kind === 'number' ? limitOf(f.key) : undefined;
    if (f.key === 'name') {
      out.name = checkName(t, LIST_SPECS[list].noun, others);
      continue;
    }
    if (t === '') {
      if (f.required) throw new Error(limit ? `${f.label}: the box is empty. ${enterText(limit)}` : `${f.label}: choose one.`);
      continue;
    }
    if (f.kind === 'number') {
      const n = Number(t);
      if (!limit) throw new Error(`${f.label}: enter a number.`);
      if (!Number.isFinite(n) || n < limit.min || n > limit.max || (limit.whole === true && !Number.isInteger(n))) throw new Error(rangeProblem(f.label, limit, t));
      if (bands && (f.key === 'passbandWidthNm' || f.key === 'narrowestBandNm')) {
        // With bands the sums are theirs: a typed value that differs is refused, never silently kept or changed.
        const derived = bandSums(bands)[f.key];
        if (Math.abs(n - derived) > 1e-6) throw new Error(`${f.label}: ${t} does not match the passbands (${derived} nm). Clear the box to use the passbands, or change the passbands.`);
      }
      out[f.key] = n;
    } else if (f.kind === 'tristate') {
      if (t !== 'yes' && t !== 'no') throw new Error(`${f.label}: choose yes, no or leave empty.`);
      out[f.key] = t === 'yes';
    } else if (f.kind === 'choice') {
      if (!f.options?.includes(t)) throw new Error(`${f.label}: choose one of ${f.options?.join(', ')}.`);
      out[f.key] = f.numeric ? Number(t) : t;
    } else {
      if (f.key === 'timeZone') {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: t });
        } catch {
          throw new Error(`Time zone: "${t.length > 30 ? `${t.slice(0, 30)}…` : t}" is not a time zone name. Enter one such as America/Phoenix, or leave it empty to use your browser.`);
        }
      }
      out[f.key] = t;
    }
  }
  if (bandsRead && 'problem' in bandsRead) throw new Error(bandsRead.problem);
  if (bands) {
    out.passbands = bands;
    Object.assign(out, bandSums(bands));
  }
  if (aiFilled && (list === 'scopes' || list === 'cameras' || list === 'filters')) out.aiFilled = true;
  return out as Item;
}

/** The edits check the boxes they were given strictly (itemFromTexts); the rest of the profile is only kept, so one stored value outside its range never blocks an edit elsewhere. */
const LENIENT = { lenient: true } as const;

/** A copy of the profile with one item rebuilt from its boxes, validated. The input is unchanged. `aiFilled` keeps the "Filled by AI, check it" mark on a scope, camera or filter. */
export function replaceItem(profile: Profile, list: ListKey, id: string, texts: Record<string, string>, aiFilled = false): Profile {
  const items = itemsOf(profile, list);
  const base = items.find((x) => x.id === id);
  if (!base) throw new Error(`Unknown ${LIST_SPECS[list].noun} "${id}".`);
  const item = itemFromTexts(list, base, texts, items.filter((x) => x.id !== id).map((x) => x.name), aiFilled);
  try {
    return validateProfile(withItems(profile, list, items.map((x) => (x.id === id ? item : x))), LENIENT);
  } catch (e) {
    throw friendly(e, list);
  }
}

function newId(prefix: string, taken: Iterable<string>): string {
  const ids = new Set(taken);
  for (let n = 1; ; n++) if (!ids.has(`${prefix}-${n}`)) return `${prefix}-${n}`;
}

/** `base`, or `base 2`, `base 3` ... the first that no name in `taken` already has. */
function uniqueName(base: string, taken: readonly string[]): string {
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} ${n}`;
    if (!taken.some((t) => sameName(t, name))) return name;
  }
}

const allTrainIds = (p: Profile) => p.trains.map((t) => t.id);

/** A copy with one new item. A new site copies the first site's coordinates (edit them) and blocks nothing. */
export function addItem(profile: Profile, list: ListKey): Profile {
  const items = itemsOf(profile, list);
  const id = newId(`my-${list === 'smartScopes' ? 'smart-scope' : LIST_SPECS[list].noun}`, items.map((x) => x.id));
  const name = uniqueName(`New ${LIST_SPECS[list].noun}`, items.map((x) => x.name));
  const item: Record<string, unknown> =
    list === 'sites'
      ? { id, name, latitude: usableSites(profile)[0]?.latitude ?? 0, longitude: usableSites(profile)[0]?.longitude ?? 0, blockedArcs: [] }
      : list === 'smartScopes'
        ? { id, name, mountMode: 'alt-az' }
        : { id, name };
  return validateProfile(withItems(profile, list, [...items, item as Item]), LENIENT);
}

/** A copy without the item. Refuses, in words, when a train or plan uses it, or it is the last site. `plans` are the saved plans. */
export function removeItem(profile: Profile, list: ListKey, id: string, plans: readonly PlanRef[] = []): Profile {
  if (list === 'sites' && profile.sites.length <= 1) throw new Error('The planner needs at least one site.');
  const use = usesOf(profile, plans, list, id);
  if (isUsed(use)) throw new UsedError(refusalText(use, list === 'sites' ? 'site' : 'gear'));
  const next = withItems(profile, list, itemsOf(profile, list).filter((x) => x.id !== id));
  // The profile's own example plans are hidden and cannot be opened: one that points at a removed site goes with it.
  return validateProfile(list === 'sites' ? { ...next, plans: next.plans.filter((p) => p.siteId !== id) } : next, LENIENT);
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
    next = validateProfile({ ...profile, trains }, LENIENT);
  } catch (e) {
    if (e instanceof ProfileError) throw new Error(profileProblemText(e, { ...profile, trains }));
    throw e;
  }
  for (const t of next.trains) resolveTrain(next, t); // throws, in words, for two HyperStar-type parts
  return next;
}

/** A copy with one train rebuilt from its parts, validated. */
export function replaceTrain(profile: Profile, id: string, parts: OpticalTrainParts | SmartTrainParts): Profile {
  const old = profile.trains.find((t) => t.id === id);
  if (!old) throw new Error(`Unknown train "${id}".`);
  const name = checkName(parts.name, old.kind === 'smart' ? 'smart-scope train' : 'train', profile.trains.filter((t) => t.id !== id).map((t) => t.name));
  const next: TrainEntry =
    'smartScopeId' in parts
      ? { kind: 'smart', id, name, smartScopeId: parts.smartScopeId }
      : {
          kind: 'optical',
          id,
          name,
          scopeId: parts.scopeId,
          accessoryIds: parts.accessoryIds,
          cameraId: parts.cameraId,
          ...(parts.filterId === '' ? {} : { filterId: parts.filterId }),
          ...(old.kind === 'optical' && old.tag !== undefined ? { tag: old.tag } : {}),
        };
  return checkTrains(profile, profile.trains.map((t) => (t.id === id ? next : t)));
}

export function addTrain(profile: Profile, kind: 'optical' | 'smart'): Profile {
  const id = newId('my-train', allTrainIds(profile));
  if (kind === 'smart') {
    const s = profile.equipment.smartScopes[0];
    if (!s) throw new Error('Add a smart scope first.');
    return checkTrains(profile, [...profile.trains, { kind: 'smart', id, name: uniqueName('New smart-scope train', profile.trains.map((t) => t.name)), smartScopeId: s.id }]);
  }
  const scope = profile.equipment.scopes[0];
  const camera = profile.equipment.cameras[0];
  if (!scope || !camera) throw new Error('Add a scope and a camera first.');
  return checkTrains(profile, [...profile.trains, { kind: 'optical', id, name: uniqueName('New train', profile.trains.map((t) => t.name)), scopeId: scope.id, accessoryIds: [], cameraId: camera.id }]);
}

export function removeTrain(profile: Profile, id: string, plans: readonly PlanRef[] = []): Profile {
  if (profile.trains.length <= 1) throw new Error('The planner needs at least one train.');
  const use = usesOf(profile, plans, 'trains', id);
  if (isUsed(use)) throw new UsedError(refusalText(use, 'train'));
  // The profile's own example plans are hidden and cannot be opened: one that used this train goes with it.
  return checkTrains({ ...profile, plans: profile.plans.filter((p) => p.trainId !== id) }, profile.trains.filter((t) => t.id !== id));
}

/** Import limit: a real profile is a few tens of kB. */
export const MAX_IMPORT_CHARS = 2_000_000;

const NOT_A_PROFILE = 'This file is not a planner profile.';

/** Throws the "too large" import error for a size over the limit; callers with a File check `file.size` before reading it. */
export function assertImportSize(size: number): void {
  if (size > MAX_IMPORT_CHARS) throw new Error(`${NOT_A_PROFILE} The file is too large.`);
}

/** Plain-language text for any error from reading an imported file. */
export function describeImportError(e: unknown, raw?: unknown): string {
  if (e instanceof ProfileError) {
    if (e.path === '$' && /not valid JSON/.test(e.message)) return `${NOT_A_PROFILE} It is not valid JSON.`;
    return `${NOT_A_PROFILE} ${profileProblemText(e, raw)}`;
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
  assertImportSize(text.length);
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
  if (typeof migrated.version !== 'number') {
    throw new Error(`${NOT_A_PROFILE} The version must be a number, not text (this planner reads version ${PROFILE_VERSION}).`);
  }
  if (migrated.version !== PROFILE_VERSION) {
    throw new Error(`${NOT_A_PROFILE} It is version ${JSON.stringify(migrated.version)}; this planner reads version ${PROFILE_VERSION} (and upgrades versions 1 and 2).`);
  }
  try {
    return validateProfile(migrated);
  } catch (e) {
    throw new Error(describeImportError(e, migrated));
  }
}
