import type { Accessory, Camera, Scope } from '../optics';
import type { Profile, TrainEntry } from './types';

export interface ResolvedTrain {
  scope: Scope;
  camera: Camera;
  /** Combined accessory, or undefined when the train has none. */
  accessory?: Accessory;
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
    const s = find(profile.equipment.smartScopes, train.smartScopeId, 'smart scope');
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
  const baseScope = find(profile.equipment.scopes, train.scopeId, 'scope');
  const camera = find(profile.equipment.cameras, train.cameraId, 'camera');
  const all = train.accessoryIds.map((id) => find(profile.equipment.accessories, id, 'accessory'));
  // An accessory that replaces the optics fixes the focal length; it is not a multiplier.
  const replacing = all.filter((a) => a.effectiveFocalLengthMm !== undefined);
  if (replacing.length > 1) {
    throw new Error(`Train "${train.id}" has more than one accessory with an effective focal length`);
  }
  const accessories = all.filter((a) => a.effectiveFocalLengthMm === undefined);
  const scope: Scope =
    replacing.length === 1 ? { ...baseScope, focalLengthMm: replacing[0].effectiveFocalLengthMm } : baseScope;
  const resolved: ResolvedTrain = { scope, camera };
  if (accessories.length > 0) {
    const known = accessories.every((a) => a.factor !== undefined);
    resolved.accessory = {
      name: accessories.map((a) => a.name).join(' + '),
      factor: known ? accessories.reduce((k, a) => k * (a.factor as number), 1) : undefined,
    };
  }
  return resolved;
}
