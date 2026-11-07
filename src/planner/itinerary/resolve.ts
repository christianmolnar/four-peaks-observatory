import type { CatalogTarget } from '../catalog';
import { exposureTargetFrom } from '../exposure';
import { PLANETS, planTrainFor } from '../plan';
import type { PlanEntry } from '../plan';
import { resolveTrain } from '../profile';
import type { Profile } from '../profile';
import type { ItineraryItem, SlotInput } from './index';

/** Id of a planet entry in the plan list: "planet-jupiter". */
export const planetIdOf = (body: string): string => `planet-${body.toLowerCase()}`;

/**
 * Looks up everything one saved item points at. Anything missing becomes `problem` text on the slot instead of an
 * exception, so a stale itinerary (a removed filter, a target no longer listed) shows what is wrong and the rest still plans.
 */
export function slotInputFor(item: ItineraryItem, profile: Profile, targets: readonly CatalogTarget[]): SlotInput {
  const train = profile.trains.find((t) => t.id === item.trainId);
  const planet = PLANETS.find((b) => planetIdOf(b) === item.targetId);
  const catalog = targets.find((t) => t.id === item.targetId);
  const name = planet ?? catalog?.name ?? item.targetId;
  const base = { item, name, trainName: train?.name ?? item.trainId, filterName: 'No filter', optics: null, camera: null, filter: null } as const;
  const fail = (problem: string): SlotInput => ({ ...base, source: { kind: 'planet', body: 'Mars' }, exposureTarget: { id: item.targetId, name }, problem });

  if (!planet && !catalog) return fail(`"${item.targetId}" is not in the target list.`);
  if (!train) return fail(`Train "${item.trainId}" is not in the profile.`);
  const filter = item.filterId === null ? null : (profile.equipment.filters.find((f) => f.id === item.filterId) ?? null);
  if (item.filterId !== null && !filter) return fail(`Filter "${item.filterId}" is not in the profile.`);
  const filterName = filter ? filter.name : 'No filter';
  const source = planet ? ({ kind: 'planet', body: planet } as const) : ({ kind: 'fixed', raHours: (catalog as CatalogTarget).raHours, decDeg: (catalog as CatalogTarget).decDeg } as const);
  const exposureTarget = catalog ? exposureTargetFrom(catalog) : { id: item.targetId, name };
  if (train.kind === 'smart') return { ...base, filterName, source, exposureTarget, filter };
  const resolved = resolveTrain(profile, train);
  const optics = planTrainFor(profile, train).optics;
  return {
    ...base,
    filterName,
    source,
    exposureTarget,
    optics: optics ? { focalRatio: optics.focalRatio, imageScale: optics.imageScale } : null,
    camera: resolved.cameraSpec ?? null,
    filter,
  };
}

/** A new item for a plan entry, on a train, with the train's own filter unless one is given. */
export function newItem(entry: Pick<PlanEntry, 'id'>, trainId: string, filterId: string | null, id: string): ItineraryItem {
  return { id, targetId: entry.id, trainId, filterId, mode: 'balanced', note: '' };
}
