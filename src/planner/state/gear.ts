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
  name: string;
  siteId: string;
  trainId: string;
}

/** The trains and plans that still point at one item. */
export interface Use {
  trains: string[];
  plans: string[];
}

/** Who uses an item: gear is used by trains; a site or a train is used by plans (the saved plans and the profile's own examples). */
export function usesOf(profile: Profile, plans: readonly PlanRef[], what: ListKey | 'trains', id: string): Use {
  const all: PlanRef[] = [...plans, ...profile.plans];
  if (what === 'sites') return { trains: [], plans: all.filter((p) => p.siteId === id).map((p) => p.name) };
  if (what === 'trains') return { trains: [], plans: all.filter((p) => p.trainId === id).map((p) => p.name) };
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
  return { trains, plans: [] };
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

export const isUsed = (use: Use) => use.trains.length > 0 || use.plans.length > 0;

/** Why an item is not removed, in plain words, with the way out. `of` is what the item is when plans use it ("site" or "train"). */
export function refusalText(use: Use, of: 'site' | 'train' | 'gear'): string {
  const way =
    use.trains.length > 0
      ? `Change or remove ${use.trains.length === 1 ? 'that train' : 'those trains'} first.`
      : `Open ${use.plans.length === 1 ? 'that plan' : 'those plans'} and choose another ${of === 'site' ? 'site' : 'train'} first.`;
  return `Not removed. ${usedText(use)} ${way}`;
}

/** The open plan's site or train that is no longer in the profile; absent when both are there. */
export function missingOf(profile: Profile, plan: { siteId: string; trainId: string } | null): { site: boolean; train: boolean } {
  return {
    site: plan !== null && !profile.sites.some((s) => s.id === plan.siteId),
    train: plan !== null && !profile.trains.some((t) => t.id === plan.trainId),
  };
}
