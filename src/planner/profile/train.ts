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
  const scope = find(profile.equipment.scopes, train.scopeId, 'scope');
  const camera = find(profile.equipment.cameras, train.cameraId, 'camera');
  const accessories = train.accessoryIds.map((id) => find(profile.equipment.accessories, id, 'accessory'));
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
