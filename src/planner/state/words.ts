import { PROFILE_VERSION, SITE_LIMITS, enterText } from '../profile';
import type { ProfileError } from '../profile';
import { LIST_SPECS } from './edit';
import type { PlansError } from './plans';
import type { ListKey } from './edit';

const KIND: Record<string, string> = {
  sites: 'site',
  scopes: 'scope',
  accessories: 'accessory',
  cameras: 'camera',
  smartScopes: 'smart scope',
  filters: 'filter',
  trains: 'train',
  plans: 'plan',
};

const FIELD: Record<string, string> = {
  blockedArcs: 'blocked zone',
  startAz: 'start direction',
  endAz: 'end direction',
  heightDeg: 'height',
  accessoryIds: 'accessory',
  scopeId: 'scope',
  cameraId: 'camera',
  filterId: 'filter',
  smartScopeId: 'smart scope',
  siteId: 'site',
  trainId: 'train',
  targetIds: 'target',
  id: 'id',
};

type Token = { key: string } | { n: number };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A name for a message: short, so one long stored name cannot fill the line. */
const nameText = (v: unknown, n: number): string => (typeof v === 'string' && v.trim() !== '' ? `"${v.length > 40 ? `${v.slice(0, 40)}…` : v}"` : `number ${n + 1}`);

function fieldWords(key: string, list: string | undefined): string {
  const label = list !== undefined && list in LIST_SPECS ? LIST_SPECS[list as ListKey].fields.find((f) => f.key === key)?.label : undefined;
  if (label !== undefined) return label.toLowerCase();
  return FIELD[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * Where a profile problem is, in words, from the validator's path and the text it read: "$.equipment.scopes[0].focalLengthMm" is
 * `scope "Edge HD 11", focal length`. A path the profile is not shaped for is "the profile" plus the field.
 */
export function profilePathInWords(path: string, raw: unknown): string {
  const tokens = [...path.matchAll(/\.([A-Za-z0-9_]+)|\[(\d+)\]/g)].map((m): Token => (m[1] !== undefined ? { key: m[1] } : { n: Number(m[2]) }));
  let at = 0;
  let node: unknown = raw;
  let list: string | undefined;
  const first = tokens[0];
  if (first && 'key' in first) {
    if (first.key === 'equipment') {
      const second = tokens[1];
      if (second && 'key' in second) {
        list = second.key;
        node = isRecord(raw) && isRecord(raw.equipment) ? raw.equipment[second.key] : undefined;
        at = 2;
      } else {
        return 'the equipment lists';
      }
    } else {
      list = first.key;
      node = isRecord(raw) ? raw[first.key] : undefined;
      at = 1;
    }
  }
  if (list === undefined) return 'the saved profile';
  const kind = KIND[list];
  if (kind === undefined) return `the saved profile, ${fieldWords(list, undefined)}`;
  const idx = tokens[at];
  if (!idx || !('n' in idx)) return `the ${kind} list`;
  const item = Array.isArray(node) ? node[idx.n] : undefined;
  const who = `${kind} ${nameText(isRecord(item) ? item.name : undefined, idx.n)}`;
  const rest: string[] = [];
  for (let i = at + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if ('key' in t) rest.push(fieldWords(t.key, list));
    else if (rest.length > 0) rest[rest.length - 1] += ` ${t.n + 1}`;
  }
  return rest.length === 0 ? who : `${who}, ${rest.join(', ')}`;
}

const capital = (s: string): string => `${s[0].toUpperCase()}${s.slice(1)}`;

/** A stored value as it is shown in a sentence: cut short, so one huge stored value cannot fill the line. */
function shownValue(json: string): string {
  return json.length > 24 ? `${json.slice(0, 24)}…` : json;
}

/** "it is missing", "it is empty", "it is "abc"": the value part of a validator message, which is JSON text. */
function itIs(got: string): string {
  if (got === 'undefined') return 'it is missing';
  if (got === 'null') return 'it is empty';
  return `it is ${shownValue(got)}`;
}

/** "a, b or c". */
const orList = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

/** The path one step up: "$.sites[0].extra" is "$.sites[0]". */
const parentPath = (path: string): string => path.replace(/(\.[A-Za-z0-9_]+|\[\d+\])$/, '');
const lastKey = (path: string): string => /\.([A-Za-z0-9_]+)$/.exec(path)?.[1] ?? '';

const WHOLE_PROFILE = 'Not a planner profile: needs sites, equipment and trains.';

/**
 * A validator error as one plain sentence with no field path and none of the validator's own words. This is the one place a
 * ProfileError becomes text for a person (load, held notice, import, refusals): a message it has no sentence for still comes out
 * without `expected`, `got`, `allowed:` or a `$.` path.
 * `raw` is the parsed JSON the error is about, used to name the item ("Scope "Edge HD 11"").
 */
export function profileProblemText(e: ProfileError, raw: unknown): string {
  const { path } = e;
  const detail = e.message.slice(path.length + 2);
  const where = capital(profilePathInWords(path, raw));
  const m = (re: RegExp) => re.exec(detail);
  let hit: RegExpExecArray | null;

  if (path === '$' && /^not valid JSON/.test(detail)) return 'It is not valid JSON.';
  if (path === '$.version') {
    const got = m(/^expected \d+, got ([\s\S]*)$/)?.[1] ?? 'undefined';
    if (got === 'undefined') return 'It has no version number.';
    return `Version ${shownValue(got)}; this planner reads ${PROFILE_VERSION}.`;
  }
  if (path === '$' && detail === 'expected an object') return WHOLE_PROFILE;
  if (detail === 'expected an object') return `${where} is not a set of named fields.`;
  if (detail === 'expected an array') return `${where} should be a list.`;
  if ((hit = m(/^unknown field \(allowed: (.*?); notes start with _\)$/))) {
    const owner = capital(profilePathInWords(parentPath(path), raw));
    return `${owner}: unknown field "${shownValue(lastKey(path))}".`;
  }
  if (detail === 'expected a non-empty string') return `${where} is empty or is not text.`;
  if (detail === 'expected a string') return `${where} is not text.`;
  if ((hit = m(/^expected a number from (\S+) to (\S+), got ([\s\S]*)$/))) return `${where} should be a number from ${hit[1]} to ${hit[2]}; ${itIs(hit[3])}.`;
  if ((hit = m(/^expected a whole number from 1 to 9, got ([\s\S]*)$/))) return `${enterText(SITE_LIMITS.bortle)} ${capital(itIs(hit[1]))}.`;
  if ((hit = m(/^at most (\d+) blocked zones, got (\d+)$/))) return `${where}: the planner holds at most ${hit[1]} blocked zones; there are ${hit[2]}.`;
  if ((hit = m(/^arc must span at least (\S+) degrees.*\(start ([^,]+), end ([^;)]+)/))) return `${where}: zone must span at least ${hit[1]} degrees (start ${hit[2]}, end ${hit[3]}).`;
  if ((hit = m(/^arc must leave at least (\S+) degrees unblocked \(start ([^,]+), end ([^)]+)\)/))) return `${where}: zone must leave at least ${hit[1]} degrees open (start ${hit[2]}, end ${hit[3]}).`;
  if (detail === 'expected a list of zones (may be empty)') return `${where}: the list of blocked zones is missing (it may be empty).`;
  if ((hit = m(/^not a time zone name such as (\S+), got ([\s\S]*)$/))) return `${where}: ${shownValue(hit[2])} is not a time zone, e.g. ${hit[1]}.`;
  if ((hit = m(/^expected true or false, got ([\s\S]*)$/))) return `${where} should be true or false; ${itIs(hit[1])}.`;
  if ((hit = m(/^expected a real date as YYYY-MM-DD, got ([\s\S]*)$/))) return `${where} is saved as ${shownValue(hit[1])}; use YYYY-MM-DD.`;
  if ((hit = m(/^expected (one of .+|".+"(?: or ".+")?), got ([\s\S]*)$/))) {
    const listed = hit[1].startsWith('one of ');
    const options = listed ? hit[1].slice(7).split(', ') : [...hit[1].matchAll(/"([^"]*)"/g)].map((x) => `"${x[1]}"`);
    const saved = hit[2] === 'undefined' ? 'is not set' : `is saved as ${shownValue(hit[2])}`;
    return `${where} ${saved}; use ${orList(options)}.`;
  }
  if ((hit = m(/^duplicate id "([\s\S]*)"$/))) {
    const owner = capital(profilePathInWords(parentPath(path), raw));
    const kind = KIND[/^\$\.(?:equipment\.)?([A-Za-z]+)/.exec(path)?.[1] ?? ''] ?? 'item';
    return `${owner}: id "${shownValue(hit[1])}" is used by another ${kind}.`;
  }
  if ((hit = m(/^unknown (scope|camera|filter|accessory|smart scope|site|train) "([\s\S]*)"$/))) return `${where}: no ${hit[1]} has the id "${shownValue(hit[2])}" in this profile.`;
  if (/\b(expected|got)\b|allowed:|\$\./.test(detail)) return `${where} is not valid.`;
  return `${where}: ${detail}`;
}

const FIELD_WORDS: Record<string, string> = {
  id: 'id',
  name: 'name',
  createdAt: 'created time',
  updatedAt: 'updated time',
  date: 'date',
  siteId: 'site',
  trainId: 'train',
  startTime: 'start time',
  targets: 'targets',
  notes: 'notes',
  preset: 'preset',
  custom: 'custom values',
  base: 'preset the custom values start from',
  favorite: 'favorite state',
  start: 'start time',
  end: 'end time',
  note: 'note',
  subSeconds: 'sub-exposure seconds',
  subCount: 'sub-exposure count',
  totalMin: 'total minutes',
};

/** Where in a plan a problem is, in words: "$.plans[1].targets[2].note" is "target 3, note". */
export function describePath(path: string): string {
  const parts: string[] = [];
  for (const seg of path.replace(/^\$\.plans\[\d+\]\.?/, '').split('.')) {
    if (seg === '') continue;
    const m = /^(\w+)\[(\d+)\]$/.exec(seg);
    if (m && m[1] === 'targets') parts.push(`target ${Number(m[2]) + 1}`);
    else if (m) parts.push(`${FIELD_WORDS[m[1]] ?? m[1]} ${Number(m[2]) + 1}`);
    else parts.push(FIELD_WORDS[seg] ?? seg);
  }
  return parts.join(', ');
}

/** The plain reason for a plan problem, from the plans validator's own detail. A detail it has no sentence for is "not valid", never the validator's words. */
function planReason(detail: string): string {
  let hit: RegExpExecArray | null;
  if (detail === 'must be an object') return 'it is not in the planner\u2019s format';
  if (detail === 'must be a non-empty string') return 'it is empty or is not text';
  if (detail === 'must be a date and time') return 'it is not a date and time';
  if (detail === 'must be a date, YYYY-MM-DD') return 'it is not a real date written YYYY-MM-DD';
  if (detail.startsWith('must be a 24 h time')) return 'it is not a 24-hour time such as "21:30"';
  if (detail === 'must be a name that is not empty') return 'it needs a name';
  if ((hit = /^a name has at most (\d+) characters$/.exec(detail))) return `a name holds at most ${hit[1]} characters`;
  if (detail === 'must be text') return 'it is not text';
  if ((hit = /^at most (\d+) characters$/.exec(detail))) return `it holds at most ${hit[1]} characters`;
  if (detail === 'must be a list') return 'it is not a list';
  if ((hit = /^at most (\d+) targets, found (\d+)$/.exec(detail))) return `a plan holds at most ${hit[1]} targets; this one has ${hit[2]}`;
  if (detail.startsWith('duplicate target')) return 'the same target is listed twice';
  if (detail.startsWith('must be one of')) return 'it is not a preset this planner knows';
  if (detail === 'must be a number above 0') return 'it must be a number above 0';
  if (detail === 'must be ask or restored') return 'it is not a favorite state this planner knows';
  return 'it is not valid';
}

/** A plan that cannot be read, as one plain sentence: which plan, where in it, and why. This is the one place a PlansError becomes text for a person on import. */
export function planProblemText(e: PlansError, label: string): string {
  const where = describePath(e.path);
  return `The plan ${label} could not be read and is left out (${where === '' ? '' : `${where}: `}${planReason(e.detail)}).`;
}
