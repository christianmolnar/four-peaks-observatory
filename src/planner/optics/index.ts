export interface Scope {
  name?: string;
  focalLengthMm?: number;
  apertureMm?: number;
}

/** Reducer (factor < 1), flattener (1) or extender (factor > 1). Multiplies focal length. */
export interface Accessory {
  name?: string;
  factor?: number;
}

export interface Camera {
  name?: string;
  pixelSizeUm?: number;
  sensorWidthPx?: number;
  sensorHeightPx?: number;
}

export interface Target {
  /** Angular size in arcminutes. */
  widthArcmin?: number;
  heightArcmin?: number;
}

export interface OpticalTrain {
  focalLengthMm?: number;
  focalRatio?: number;
  /** Arcseconds per pixel. */
  imageScale?: number;
  fovWidthArcmin?: number;
  fovHeightArcmin?: number;
  /** Names of the inputs that were absent, so the UI can ask for them. */
  missing: string[];
}

// 206265 arcsec per radian; with pixel size in um and focal length in mm the 1000s cancel.
const ARCSEC_PER_RADIAN = 206.264806;

function positive(name: string, v: number | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (!Number.isFinite(v) || v <= 0) {
    throw new RangeError(`${name} must be a positive number: ${v}`);
  }
  return v;
}

/** Focal length after the accessory factor (no accessory means factor 1). */
export function effectiveFocalLengthMm(
  scope: Scope,
  accessory?: Accessory,
): number | undefined {
  const f = positive('focalLengthMm', scope.focalLengthMm);
  if (f === undefined) return undefined;
  const k = positive('accessory factor', accessory?.factor) ?? 1;
  return f * k;
}

/** Arcseconds per pixel: 206.265 * pixel size (um) / focal length (mm). */
export function imageScale(
  scope: Scope,
  camera: Camera,
  accessory?: Accessory,
): number | undefined {
  const f = effectiveFocalLengthMm(scope, accessory);
  const p = positive('pixelSizeUm', camera.pixelSizeUm);
  if (f === undefined || p === undefined) return undefined;
  return (ARCSEC_PER_RADIAN * p) / f;
}

/** Image scale, field of view and focal ratio; absent inputs are listed in `missing`. */
export function opticalTrain(
  scope: Scope,
  camera: Camera,
  accessory?: Accessory,
): OpticalTrain {
  const missing: string[] = [];
  if (scope.focalLengthMm === undefined) missing.push('scope.focalLengthMm');
  if (camera.pixelSizeUm === undefined) missing.push('camera.pixelSizeUm');
  if (camera.sensorWidthPx === undefined) missing.push('camera.sensorWidthPx');
  if (camera.sensorHeightPx === undefined) missing.push('camera.sensorHeightPx');

  const focalLengthMm = effectiveFocalLengthMm(scope, accessory);
  const aperture = positive('apertureMm', scope.apertureMm);
  const scale = imageScale(scope, camera, accessory);
  const w = positive('sensorWidthPx', camera.sensorWidthPx);
  const h = positive('sensorHeightPx', camera.sensorHeightPx);

  return {
    focalLengthMm,
    focalRatio:
      focalLengthMm !== undefined && aperture !== undefined
        ? focalLengthMm / aperture
        : undefined,
    imageScale: scale,
    fovWidthArcmin: scale !== undefined && w !== undefined ? (scale * w) / 60 : undefined,
    fovHeightArcmin: scale !== undefined && h !== undefined ? (scale * h) / 60 : undefined,
    missing,
  };
}

/**
 * True when the target fits inside the frame, allowing the camera to be
 * rotated by 90 degrees. `margin` is the fraction of the frame to leave free
 * (0.1 keeps 10%). Returns null when the field of view or the target size is
 * unknown: it does not guess.
 */
export function targetFitsFrame(
  train: Pick<OpticalTrain, 'fovWidthArcmin' | 'fovHeightArcmin'>,
  target: Target,
  margin = 0,
): boolean | null {
  const { fovWidthArcmin: fw, fovHeightArcmin: fh } = train;
  const { widthArcmin: tw, heightArcmin: th } = target;
  if (fw === undefined || fh === undefined || tw === undefined || th === undefined) {
    return null;
  }
  if (!(margin >= 0 && margin < 1)) throw new RangeError(`margin must be in [0, 1): ${margin}`);
  const keep = 1 - margin;
  const longFov = Math.max(fw, fh) * keep;
  const shortFov = Math.min(fw, fh) * keep;
  return Math.max(tw, th) <= longFov && Math.min(tw, th) <= shortFov;
}
