import type { ProfileError } from '../profile';
import { LIST_SPECS } from './edit';
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

/** A validator error as one plain sentence with no field path: `Scope "Edge HD 11", focal length: Enter a focal length between 10 and 10,000 mm. It is -100.` */
export function profileProblemText(e: ProfileError, raw: unknown): string {
  const where = profilePathInWords(e.path, raw);
  return `${where[0].toUpperCase()}${where.slice(1)}: ${e.message.slice(e.path.length + 2)}`;
}
