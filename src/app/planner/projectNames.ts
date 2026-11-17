import { BROADBAND_ID } from '@/planner/projects';
import type { ProjectSetup, SheetNames } from '@/planner/projects';
import type { Profile } from '@/planner/profile';

/** How the Broadband slot (light with no filter, or an L filter) is named wherever a filter is named. */
export const BROADBAND_NAME = 'Broadband';

/** The name of a project's filter id: Broadband, a filter of the user's gear, or a plain sentence when the gear no longer has it. */
export function filterName(profile: Profile, id: string): string {
  if (id === BROADBAND_ID) return BROADBAND_NAME;
  return profile.equipment.filters.find((f) => f.id === id)?.name ?? 'A filter that is no longer in your gear';
}

/** "EdgeHD 11 + ASI2600MC Duo": the scope and camera of the setup that the gear still has; empty when neither is known. */
export function gearLine(profile: Profile, setup: ProjectSetup): string {
  const scope = setup.scopeId === null ? undefined : profile.equipment.scopes.find((s) => s.id === setup.scopeId)?.name;
  const camera = setup.cameraId === null ? undefined : profile.equipment.cameras.find((c) => c.id === setup.cameraId)?.name;
  return [scope, camera].filter((x): x is string => x !== undefined).join(' + ');
}

/** The names a project's sheet prints. `targetName` is the page's one way to name a target id. */
export const sheetNames = (profile: Profile, setup: ProjectSetup, targetName: (id: string) => string): SheetNames => ({
  gear: gearLine(profile, setup),
  target: targetName,
  filter: (id) => filterName(profile, id),
});
