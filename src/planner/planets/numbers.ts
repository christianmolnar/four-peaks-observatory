import { ROI_MARGIN, ROI_STEP_PX, SATURN_RING_SPAN_FACTOR, SESSION_MIN, START_EXPOSURE } from './constants';
import { clipsInSession, dispersionArcsec, MOON_CLIP_S } from './index';
import type { CardBody, PlanetCard } from './index';

/** Altitudes where the colour spread is listed, degrees. */
export const DISPERSION_ALTITUDES_DEG = [80, 70, 60, 45, 30] as const;

/** Region of interest, px square: the object (Saturn with its rings) times ROI_MARGIN, rounded up to ROI_STEP_PX. Null: no size in px. */
export function roiPx(body: CardBody, diameterPx: number | null): number | null {
  if (diameterPx === null) return null;
  const span = body === 'Saturn' ? SATURN_RING_SPAN_FACTOR : 1;
  return Math.ceil((diameterPx * span * ROI_MARGIN) / ROI_STEP_PX) * ROI_STEP_PX;
}

/** The camera cannot send more frames a second than 1000 / exposure in ms. Null: no starting exposure. */
export function maxFramesPerSecond(body: CardBody): number | null {
  const ms = START_EXPOSURE[body].ms;
  return ms === null ? null : Math.floor(1000 / ms);
}

/** Clips in one session: the clip is the suggested rotation clip, or the Moon's fixed one. Null: no clip length (planet without aperture). */
export function sessionClips(card: PlanetCard): { clipS: number; clips: number } | null {
  const clipS = card.rotation ? card.rotation.suggestedS : card.body === 'Moon' ? MOON_CLIP_S : null;
  return clipS === null ? null : { clipS, clips: clipsInSession(SESSION_MIN, clipS) };
}

/** "80° 0.12″, 70° …": the colour spread at the listed altitudes. */
export function dispersionList(): { altitudeDeg: number; arcsec: number }[] {
  return DISPERSION_ALTITUDES_DEG.map((altitudeDeg) => ({ altitudeDeg, arcsec: dispersionArcsec(altitudeDeg) }));
}
