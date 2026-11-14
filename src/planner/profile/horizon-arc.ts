import { normalizeHorizon } from '../horizon';
import type { HorizonPoint } from '../horizon';
import type { BlockedArc } from './types';

/**
 * Azimuth step in degrees at each vertical edge of the arc. `normalizeHorizon`
 * rejects duplicate azimuths, so an edge is a point on the zone plus a point
 * this far outside it at height 0.
 */
export const EDGE_STEP_DEG = 0.01;

const wrap = (az: number): number => ((az % 360) + 360) % 360;

/** True when `az` lies on the arc, ends included (clockwise from startAz to endAz, may cross north). */
const onArc = (a: BlockedArc, az: number): boolean => (az - a.startAz + 360) % 360 <= (a.endAz - a.startAz + 360) % 360 + 1e-9;

/** Highest height of the zones that contain `az`, or 0 when none does. */
const heightAt = (arcs: readonly BlockedArc[], az: number): number =>
  arcs.reduce((h, a) => (onArc(a, az) ? Math.max(h, a.heightDeg) : h), 0);

/**
 * Horizon points for a site's blocked zones, sorted by azimuth, one height per azimuth.
 * - no zones: one point at height 0, a set and clear horizon.
 * - zones: the blocked region is the union of the zones, each running from startAz to endAz
 *   inclusive (clockwise, may cross north). Where zones overlap or touch the height is the
 *   highest of them (a target is blocked if any zone blocks it); outside every zone it is 0.
 *   Each edge is one step wide (`EDGE_STEP_DEG`, less when edges are closer than that).
 * Pass the result to `horizonAltitudeAt` / `usableWindows`.
 */
export function arcToHorizonPoints(arcs: readonly BlockedArc[]): HorizonPoint[] {
  if (arcs.length === 0) return [{ az: 0, alt: 0 }];
  for (const { startAz, endAz } of arcs) {
    const span = (endAz - startAz + 360) % 360;
    if (!(span >= 2 * EDGE_STEP_DEG) || 360 - span < 2 * EDGE_STEP_DEG) {
      throw new RangeError(`Arc ${startAz} to ${endAz} is too narrow or too wide to place its edges`);
    }
  }
  // Every arc has two distinct edges, so there are at least two. The height only changes at a zone's start or end: constant between these azimuths.
  const edges = [...new Set(arcs.flatMap((a) => [wrap(a.startAz), wrap(a.endAz)]))].sort((a, b) => a - b);
  const points: HorizonPoint[] = [];
  edges.forEach((c, i) => {
    const prev = edges[(i + edges.length - 1) % edges.length];
    const next = edges[(i + 1) % edges.length];
    const gapBefore = (c - prev + 360) % 360;
    const gapAfter = (next - c + 360) % 360;
    const at = heightAt(arcs, c);
    const before = heightAt(arcs, wrap(c - gapBefore / 2));
    const after = heightAt(arcs, wrap(c + gapAfter / 2));
    if (before !== at) points.push({ az: wrap(c - Math.min(EDGE_STEP_DEG, gapBefore / 3)), alt: before });
    points.push({ az: c, alt: at });
    if (after !== at) points.push({ az: wrap(c + Math.min(EDGE_STEP_DEG, gapAfter / 3)), alt: after });
  });
  // A point inside a flat run adds nothing: drop it (every point at one height keeps all of them).
  const flat = points.every((p) => p.alt === points[0].alt);
  const sorted = normalizeHorizon(points);
  return flat ? sorted : sorted.filter((p, i) => !(p.alt === sorted[(i + sorted.length - 1) % sorted.length].alt && p.alt === sorted[(i + 1) % sorted.length].alt));
}

/** A stretch of azimuth blocked by the same set of zones, and the height that applies there (the highest of them). */
export interface ZoneSpan {
  from: number;
  to: number;
  /** Zero-based indexes into the zone list, ascending. */
  zones: number[];
  heightDeg: number;
}

/**
 * The blocked region as stretches clockwise from `from` to `to`, each blocked by one set of zones. A stretch with
 * more than one zone is an overlap. A stretch may cross north. Open horizon is not listed. Every edge changes the set
 * of zones, so neighbouring stretches never have the same set.
 */
export function zoneSpans(arcs: readonly BlockedArc[]): ZoneSpan[] {
  const edges = [...new Set(arcs.flatMap((a) => [wrap(a.startAz), wrap(a.endAz)]))].sort((a, b) => a - b);
  const spans: ZoneSpan[] = [];
  edges.forEach((from, i) => {
    const to = edges[(i + 1) % edges.length];
    const mid = wrap(from + (((to - from + 360) % 360) || 360) / 2);
    const zones = arcs.flatMap((a, n) => (onArc(a, mid) ? [n] : []));
    if (zones.length === 0) return;
    const heightDeg = Math.max(...zones.map((n) => arcs[n].heightDeg));
    spans.push({ from, to, zones, heightDeg });
  });
  return spans;
}
