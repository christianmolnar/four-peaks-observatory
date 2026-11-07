import { opticalTrain } from '../optics';
import { resolveTrain } from '../profile';
import type { Profile, TrainEntry } from '../profile';
import type { GuideTrain } from './guide';

export interface PlanetTrainInfo {
  /** The telescope's aperture; undefined when the profile has none. */
  apertureMm?: number;
  /** Arcsec per pixel of the selected train; undefined for a smart scope or when the profile lacks a number. */
  scaleArcsecPx?: number;
  /** Names and colour flag from the profile, for the guide's text. Absent for a smart scope. */
  scopeName?: string;
  cameraName?: string;
  cameraColour?: boolean;
  /** The narrow side of the selected train's field, arcminutes. */
  fieldArcmin?: number;
  /** The selected train's own name. */
  trainName: string;
  /** The selected train and its siblings (same scope and camera, other accessories), for the sampling table and the guide. */
  variants: GuideTrain[];
  /** Why no numbers are given, or null. */
  missing: string | null;
}

/**
 * What the planet cards and the guide need from the profile's selected train. A smart scope has no optics numbers: it
 * returns `missing` text. A variant that uses an extender (factor above 1) is marked nominal: the extender's real scale
 * depends on a spacing the profile does not hold.
 */
export function planetTrainInfo(profile: Profile, train: TrainEntry): PlanetTrainInfo {
  if (train.kind === 'smart') {
    return { trainName: train.name, variants: [], missing: `${train.name} is a smart scope with fixed optics: pick an optical train for image scale and clip numbers.` };
  }
  const own = resolveTrain(profile, train);
  const optics = opticalTrain(own.scope, own.camera, own.accessory);
  const variants: GuideTrain[] = [];
  for (const t of profile.trains) {
    if (t.kind !== 'optical' || t.scopeId !== train.scopeId || t.cameraId !== train.cameraId) continue;
    const r = resolveTrain(profile, t);
    const o = opticalTrain(r.scope, r.camera, r.accessory);
    if (o.imageScale === undefined) continue;
    variants.push({ name: t.name, scaleArcsecPx: o.imageScale, nominal: (r.accessory?.factor ?? 1) > 1 });
  }
  const aperture = own.scope.apertureMm;
  const missing =
    aperture === undefined
      ? 'The telescope has no aperture in the profile, so clip, dispersion and sampling numbers are not given.'
      : optics.imageScale === undefined
        ? `The profile lacks ${optics.missing.join(', ')}, so the image scale is not given.`
        : null;
  return {
    apertureMm: aperture,
    scopeName: own.scope.name,
    cameraName: own.camera.name,
    cameraColour: own.cameraSpec?.colour,
    scaleArcsecPx: optics.imageScale,
    fieldArcmin:
      optics.fovWidthArcmin !== undefined && optics.fovHeightArcmin !== undefined ? Math.min(optics.fovWidthArcmin, optics.fovHeightArcmin) : undefined,
    trainName: train.name,
    variants,
    missing,
  };
}
