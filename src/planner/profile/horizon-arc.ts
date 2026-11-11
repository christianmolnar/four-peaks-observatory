import { normalizeHorizon } from '../horizon';
import type { HorizonPoint } from '../horizon';
import type { BlockedArc } from './types';
import { arcsConflict } from './validate';

/**
 * Azimuth step in degrees at each vertical edge of the arc. `normalizeHorizon`
 * rejects duplicate azimuths, so an edge is a point on the zone plus a point
 * this far outside it at height 0.
 */
export const EDGE_STEP_DEG = 0.01;

const wrap = (az: number): number => ((az % 360) + 360) % 360;

/**
 * Horizon points for a site's blocked zones, sorted by azimuth.
 * - no zones: one point at height 0, a set and clear horizon.
 * - zones: each zone's height runs from startAz to endAz inclusive (clockwise, may
 *   cross north) and is 0 outside every zone, with the edges one step wide.
 * Zones must not overlap or touch (`arcsConflict`), so no azimuth has two heights.
 * Pass the result to `horizonAltitudeAt` / `usableWindows`.
 */
export function arcToHorizonPoints(arcs: readonly BlockedArc[]): HorizonPoint[] {
  if (arcs.length === 0) return [{ az: 0, alt: 0 }];
  for (let i = 0; i < arcs.length; i++) {
    for (let j = i + 1; j < arcs.length; j++) {
      if (arcsConflict(arcs[i], arcs[j])) {
        throw new RangeError(`Zones ${i + 1} and ${j + 1} overlap or touch`);
      }
    }
  }
  return normalizeHorizon(
    arcs.flatMap(({ startAz, endAz, heightDeg }) => {
      const span = (endAz - startAz + 360) % 360;
      if (!(span >= 2 * EDGE_STEP_DEG) || 360 - span < 2 * EDGE_STEP_DEG) {
        throw new RangeError(`Arc ${startAz} to ${endAz} is too narrow or too wide to place its edges`);
      }
      return [
        { az: wrap(startAz - EDGE_STEP_DEG), alt: 0 },
        { az: wrap(startAz), alt: heightDeg },
        { az: wrap(endAz), alt: heightDeg },
        { az: wrap(endAz + EDGE_STEP_DEG), alt: 0 },
      ];
    }),
  );
}
