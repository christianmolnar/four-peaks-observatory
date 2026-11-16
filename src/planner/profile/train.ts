import type { Accessory, Camera, Scope } from '../optics';
import { GEAR_LIMITS, capitalised, inRange, rangeText, valueText, withoutOutOfRange } from './limits';
import type { Profile, ProfileCamera, ProfileFilter, TrainEntry } from './types';

export interface ResolvedTrain {
  scope: Scope;
  camera: Camera;
  /** Combined accessory, or undefined when the train has none. */
  accessory?: Accessory;
  /** The profile's camera record (colour, UV/IR window, read noise); undefined for smart scopes. */
  cameraSpec?: ProfileCamera;
  /** The library filter the train names; undefined when it has none. */
  filter?: ProfileFilter;
}

function find<T extends { id: string }>(xs: T[], id: string, what: string): T {
  const x = xs.find((e) => e.id === id);
  if (!x) throw new Error(`Unknown ${what} "${id}"`);
  return x;
}

/**
 * Turns a train into the inputs `optics` takes. Several accessories multiply;
 * if any lacks a factor the combined factor is left undefined (unknown, not 1).
 * An accessory with an effective focal length replaces the scope's focal length.
 * Smart scopes map to a scope and camera built from their fixed values.
 */
export function resolveTrain(profile: Profile, train: TrainEntry): ResolvedTrain {
  if (train.kind === 'smart') {
    const s = withoutOutOfRange(find(profile.equipment.smartScopes, train.smartScopeId, 'smart scope'));
    return {
      scope: { name: s.name, focalLengthMm: s.focalLengthMm, apertureMm: s.apertureMm },
      camera: {
        name: s.name,
        pixelSizeUm: s.pixelSizeUm,
        sensorWidthPx: s.sensorWidthPx,
        sensorHeightPx: s.sensorHeightPx,
      },
    };
  }
  // A stored number outside its range (GEAR_LIMITS) is unknown here, not guessed: the engine sees it as missing and `trainGearNote` says why.
  const baseScope = withoutOutOfRange(find(profile.equipment.scopes, train.scopeId, 'scope'));
  const camera = withoutOutOfRange(find(profile.equipment.cameras, train.cameraId, 'camera'));
  const all = train.accessoryIds.map((id) => find(profile.equipment.accessories, id, 'accessory'));
  // An accessory that replaces the optics fixes the focal length; it is not a multiplier.
  const replacing = all.filter((a) => a.effectiveFocalLengthMm !== undefined);
  if (replacing.length > 1) {
    throw new Error(`Train "${train.id}" has more than one accessory with an effective focal length`);
  }
  const accessories = all.filter((a) => a.effectiveFocalLengthMm === undefined);
  const scope: Scope =
    replacing.length === 1 ? { ...baseScope, focalLengthMm: inRange(GEAR_LIMITS.effectiveFocalLengthMm, replacing[0].effectiveFocalLengthMm) ? replacing[0].effectiveFocalLengthMm : undefined } : baseScope;
  const resolved: ResolvedTrain = { scope, camera, cameraSpec: camera };
  if (train.filterId !== undefined) resolved.filter = withoutOutOfRange(find(profile.equipment.filters, train.filterId, 'filter'));
  if (accessories.length > 0) {
    const known = accessories.every((a) => inRange(GEAR_LIMITS.factor, a.factor));
    resolved.accessory = {
      name: accessories.map((a) => a.name).join(' + '),
      factor: known ? accessories.reduce((k, a) => k * (a.factor as number), 1) : undefined,
    };
  }
  return resolved;
}

/** The numbers an exposure needs from a train's optical gear, and what each belongs to. */
interface Need {
  key: 'focalLengthMm' | 'apertureMm' | 'pixelSizeUm' | 'factor' | 'effectiveFocalLengthMm';
  owner: string;
  value: unknown;
}

/**
 * Why a train cannot give an exposure, as one plain sentence with the way out, or null when every number it needs is set and in range.
 * "Pixel size is not set for ZWO ASI2600MC Duo, so no exposure is shown. Add it in Gear."
 */
export function trainGearNote(profile: Profile, train: TrainEntry): string | null {
  if (train.kind !== 'optical') return null;
  const scope = profile.equipment.scopes.find((s) => s.id === train.scopeId);
  const camera = profile.equipment.cameras.find((c) => c.id === train.cameraId);
  const needs: Need[] = [];
  if (scope) needs.push({ key: 'focalLengthMm', owner: scope.name, value: scope.focalLengthMm }, { key: 'apertureMm', owner: scope.name, value: scope.apertureMm });
  if (camera) needs.push({ key: 'pixelSizeUm', owner: camera.name, value: camera.pixelSizeUm });
  const accessories = train.accessoryIds.flatMap((id) => profile.equipment.accessories.find((a) => a.id === id) ?? []);
  const replacing = accessories.filter((a) => a.effectiveFocalLengthMm !== undefined);
  for (const a of accessories) {
    if (a.effectiveFocalLengthMm !== undefined) needs.push({ key: 'effectiveFocalLengthMm', owner: a.name, value: a.effectiveFocalLengthMm });
    else needs.push({ key: 'factor', owner: a.name, value: a.factor });
  }
  if (replacing.length > 0) {
    // The whole-scope focal length replaces the scope's: its own focal length is not needed.
    const at = needs.findIndex((n) => n.key === 'focalLengthMm');
    if (at >= 0) needs.splice(at, 1);
  }
  const parts = needs.flatMap((n) => {
    const limit = GEAR_LIMITS[n.key];
    if (n.value === undefined) return [`${limit.noun} is not set for ${n.owner}`];
    if (typeof n.value !== 'number') return [`${limit.noun} of ${n.owner} is saved as ${valueText(n.key, n.value)}, which is not a number`];
    if (!inRange(limit, n.value)) return [`${limit.noun} of ${n.owner} (${valueText(n.key, n.value)}) is outside ${rangeText(limit)}`];
    return [];
  });
  if (parts.length === 0) return null;
  const unset = parts.every((p) => p.includes(' is not set for '));
  return `${capitalised(parts.join('; '))}, so no exposure is shown. ${unset ? (parts.length === 1 ? 'Add it in Gear.' : 'Add them in Gear.') : 'Change it in Gear.'}`;
}

/**
 * A note, not a refusal: the accessories take the whole-scope focal length under the scope range's floor (a 14 mm lens with a 0.7x reducer is 9.8 mm).
 * The exposure is still shown. Null when the focal length is known and at or over the floor, or cannot be worked out.
 */
export function reducedFocalNote(profile: Profile, train: TrainEntry): string | null {
  if (train.kind !== 'optical') return null;
  const scope = profile.equipment.scopes.find((s) => s.id === train.scopeId);
  const accessories = train.accessoryIds.flatMap((id) => profile.equipment.accessories.find((a) => a.id === id) ?? []);
  if (!scope || accessories.some((a) => a.effectiveFocalLengthMm !== undefined) || accessories.length === 0) return null;
  if (!inRange(GEAR_LIMITS.focalLengthMm, scope.focalLengthMm) || !accessories.every((a) => inRange(GEAR_LIMITS.factor, a.factor))) return null;
  const effective = accessories.reduce((k, a) => k * (a.factor as number), scope.focalLengthMm);
  const floor = GEAR_LIMITS.focalLengthMm.min;
  if (effective >= floor) return null;
  return `With ${accessories.map((a) => a.name).join(' + ')} the focal length of ${scope.name} is ${Math.round(effective * 100) / 100} mm, under the ${floor} mm the planner is built for. Numbers are still shown; check them.`;
}
