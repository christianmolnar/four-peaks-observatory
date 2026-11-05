import { normalizeHorizon } from '../horizon';
import type { HorizonPoint } from '../horizon';
import type { BlockedArc } from './types';

/**
 * Azimuth step in degrees at each vertical edge of the arc. `normalizeHorizon`
 * rejects duplicate azimuths, so an edge is a point on the arc plus a point
 * this far outside it at height 0.
 */
export const EDGE_STEP_DEG = 0.01;

const wrap = (az: number): number => ((az % 360) + 360) % 360;

/**
 * Horizon points for a site's blocked arc, sorted by azimuth.
 * - null arc: one point at height 0, a set and clear horizon.
 * - arc: height is `heightDeg` from startAz to endAz inclusive (clockwise, may
 *   cross north) and 0 outside, with the edges one step wide.
 * Pass the result to `horizonAltitudeAt` / `usableWindows`.
 */
export function arcToHorizonPoints(arc: BlockedArc | null): HorizonPoint[] {
  if (arc === null) return [{ az: 0, alt: 0 }];
  const { startAz, endAz, heightDeg } = arc;
  const span = (endAz - startAz + 360) % 360;
  if (!(span >= 2 * EDGE_STEP_DEG) || 360 - span < 2 * EDGE_STEP_DEG) {
    throw new RangeError(`Arc ${startAz} to ${endAz} is too narrow or too wide to place its edges`);
  }
  return normalizeHorizon([
    { az: wrap(startAz - EDGE_STEP_DEG), alt: 0 },
    { az: wrap(startAz), alt: heightDeg },
    { az: wrap(endAz), alt: heightDeg },
    { az: wrap(endAz + EDGE_STEP_DEG), alt: 0 },
  ]);
}
