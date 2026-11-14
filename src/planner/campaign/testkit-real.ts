import targets from '../data/targets.json';
import type { Site } from '../astro';
import type { CampaignSubject } from './types';

/** Test helpers for suites that plan real curated targets at the owner's site. Nothing imports this but tests. */

export const FOUNTAIN_HILLS: Site = { latitude: 33.6115, longitude: -111.719, elevationM: 0 };

interface Curated { id: string; name: string; type: string; raHours: number; decDeg: number }
const CURATED = (targets as unknown as { targets: Curated[] }).targets;

/** The curated catalog's targets by id, as campaign subjects in that order (id, name, position and type, as the page builds them). */
export const subjects = (ids: readonly string[]): CampaignSubject[] =>
  ids.map((id) => {
    const t = CURATED.find((x) => x.id === id);
    if (!t) throw new Error(`No curated target ${id}`);
    return { id, name: t.name, targets: [{ id, name: t.name, raHours: t.raHours, decDeg: t.decDeg }], type: t.type };
  });
