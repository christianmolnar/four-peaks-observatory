import { usableSites } from '../profile';
import type { Profile } from '../profile';
import type { ListKey } from './edit';

/** The classes of the Gear section's picker. Scopes holds both the scopes and the smart scopes. */
export type GearClass = 'trains' | 'scopes' | 'cameras' | 'filters' | 'accessories' | 'sites';

export const GEAR_CLASSES: readonly { id: GearClass; label: string }[] = [
  { id: 'trains', label: 'Trains' },
  { id: 'scopes', label: 'Scopes' },
  { id: 'cameras', label: 'Cameras' },
  { id: 'filters', label: 'Filters' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'sites', label: 'Sites' },
];

/** What a saved plan points at: its name and the site and train it was made for. */
export interface PlanRef {
  /** The plan's id; absent for a reference that cannot be opened. */
  id?: string;
  name: string;
  siteId: string;
  trainId: string;
}

/** The trains and plans that still point at one item. */
export interface Use {
  trains: string[];
  plans: string[];
  /** The ids of `plans`, in the same order, for the ones that can be opened. */
  planIds: string[];
}

/**
 * Who uses an item: gear is used by trains; a site or a train is used by the saved plans. The profile's own example plans (hidden: no plan
 * switcher shows them) never count: removing a site or train drops them, so nothing the user cannot open ever blocks a removal.
 */
export function usesOf(profile: Profile, plans: readonly PlanRef[], what: ListKey | 'trains', id: string): Use {
  const byPlan = (match: (p: PlanRef) => boolean): Use => {
    const hit = plans.filter(match);
    return { trains: [], plans: hit.map((p) => p.name), planIds: hit.flatMap((p) => (p.id === undefined ? [] : [p.id])) };
  };
  if (what === 'sites') return byPlan((p) => p.siteId === id);
  if (what === 'trains') return byPlan((p) => p.trainId === id);
  const trains = profile.trains
    .filter((t) => {
      if (t.kind === 'smart') return what === 'smartScopes' && t.smartScopeId === id;
      return (
        (what === 'scopes' && t.scopeId === id) ||
        (what === 'cameras' && t.cameraId === id) ||
        (what === 'filters' && t.filterId === id) ||
        (what === 'accessories' && t.accessoryIds.includes(id))
      );
    })
    .map((t) => t.name);
  return { trains, plans: [], planIds: [] };
}

const quoted = (names: readonly string[]) => {
  const shown = names.slice(0, 3).map((n) => `"${n}"`).join(', ');
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
};

/** "Used by 2 trains: "A", "B"." or "Not used." */
export function usedText(use: Use): string {
  if (use.trains.length > 0) return `Used by ${use.trains.length} ${use.trains.length === 1 ? 'train' : 'trains'}: ${quoted(use.trains)}.`;
  if (use.plans.length > 0) return `Used by ${use.plans.length} ${use.plans.length === 1 ? 'plan' : 'plans'}: ${quoted(use.plans)}.`;
  return 'Not used.';
}

/** A removal refused because trains or plans still use the item (the way out is to change those). */
export class UsedError extends Error {}

export const isUsed = (use: Use) => use.trains.length > 0 || use.plans.length > 0;

/** Why an item is not removed, in plain words, with the way out. `of` is what the item is when plans use it ("site" or "train"). */
export function refusalText(use: Use, of: 'site' | 'train' | 'gear'): string {
  const way =
    use.trains.length > 0
      ? `Change or remove ${use.trains.length === 1 ? 'that train' : 'those trains'} first.`
      : `Open ${use.plans.length === 1 ? 'that plan' : 'those plans'} and choose another ${of === 'site' ? 'site' : 'train'} first.`;
  return `Not removed. ${usedText(use)} ${way}`;
}

/**
 * The open plan's site or train that is not usable: gone from the profile, or (a site) kept with a saved number that cannot be used.
 * `siteKept` is true when the site is still in the profile and only its saved numbers are bad.
 */
export function missingOf(profile: Profile, plan: { siteId: string; trainId: string } | null): { site: boolean; siteKept: boolean; train: boolean } {
  return {
    site: plan !== null && !usableSites(profile).some((s) => s.id === plan.siteId),
    siteKept: plan !== null && profile.sites.some((s) => s.id === plan.siteId) && !usableSites(profile).some((s) => s.id === plan.siteId),
    train: plan !== null && !profile.trains.some((t) => t.id === plan.trainId),
  };
}
