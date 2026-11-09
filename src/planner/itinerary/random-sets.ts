/** Random itineraries for the order-search tests: sites around the world, dates, trains, filters and modes. Seeded, so a failure repeats. */
import sample from '@/planner/data/sample-profile.json';
import { starterTargets } from '@/planner/catalog';
import { tonightsNight } from '@/planner/plan';
import { arcToHorizonPoints, validateProfile } from '@/planner/profile';
import { slotInputFor } from './resolve';
import { windowsFor } from './index';
import type { HorizonPoint } from '../horizon';
import type { BuildInput, ItineraryItem } from './index';
export const profile = validateProfile(sample);
export const targets = starterTargets;
export const clock = (tz: string) => { const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return (d: Date) => f.format(d); };
export interface Place { name: string; site: { latitude: number; longitude: number; elevationM: number }; tz: string; horizon: HorizonPoint[] | null; minAltitude: number; dates: string[] }
const H = arcToHorizonPoints;
export const PLACES: Place[] = [
  { name: 'fountain-hills', site: { latitude: 33.6115, longitude: -111.719, elevationM: 500 }, tz: 'America/Phoenix', horizon: H({ startAz: 120, endAz: 320, heightDeg: 42 }), minAltitude: 20, dates: ['2026-11-08', '2026-12-21', '2027-04-10', '2027-08-15'] },
  { name: 'sydney', site: { latitude: -33.87, longitude: 151.21, elevationM: 50 }, tz: 'Australia/Sydney', horizon: H({ startAz: 300, endAz: 60, heightDeg: 25 }), minAltitude: 25, dates: ['2026-10-03', '2026-10-04', '2027-04-03', '2027-01-20'] },
  { name: 'santiago', site: { latitude: -33.45, longitude: -70.67, elevationM: 570 }, tz: 'America/Santiago', horizon: null, minAltitude: 20, dates: ['2026-09-05', '2027-04-03', '2026-12-01'] },
  { name: 'quito', site: { latitude: -0.18, longitude: -78.47, elevationM: 2850 }, tz: 'America/Guayaquil', horizon: H({ startAz: 200, endAz: 260, heightDeg: 30 }), minAltitude: 15, dates: ['2026-11-20', '2027-03-01'] },
  { name: 'kiritimati', site: { latitude: 1.87, longitude: -157.4, elevationM: 0 }, tz: 'Pacific/Kiritimati', horizon: null, minAltitude: 20, dates: ['2026-12-31', '2027-06-01'] },
  { name: 'apia', site: { latitude: -13.83, longitude: -171.76, elevationM: 0 }, tz: 'Pacific/Apia', horizon: null, minAltitude: 20, dates: ['2026-11-15', '2027-07-01'] },
  { name: 'suva', site: { latitude: -18.14, longitude: 178.44, elevationM: 0 }, tz: 'Pacific/Fiji', horizon: null, minAltitude: 25, dates: ['2026-12-10'] },
  { name: 'reykjavik', site: { latitude: 64.13, longitude: -21.9, elevationM: 0 }, tz: 'Atlantic/Reykjavik', horizon: null, minAltitude: 15, dates: ['2026-11-08', '2027-02-14'] },
  { name: 'tromso', site: { latitude: 69.65, longitude: 18.96, elevationM: 0 }, tz: 'Europe/Oslo', horizon: null, minAltitude: 15, dates: ['2026-10-25', '2027-02-20'] },
  { name: 'london', site: { latitude: 51.48, longitude: 0, elevationM: 0 }, tz: 'Europe/London', horizon: H({ startAz: 90, endAz: 180, heightDeg: 20 }), minAltitude: 20, dates: ['2026-10-24', '2026-10-25', '2027-03-28'] },
  { name: 'newyork', site: { latitude: 40.71, longitude: -74.0, elevationM: 10 }, tz: 'America/New_York', horizon: null, minAltitude: 20, dates: ['2026-10-31', '2026-11-01', '2027-03-14'] },
  { name: 'auckland', site: { latitude: -36.85, longitude: 174.76, elevationM: 0 }, tz: 'Pacific/Auckland', horizon: null, minAltitude: 20, dates: ['2026-09-26', '2026-09-27', '2027-04-04'] },
];
export const nightOf = (p: Place, d: string) => tonightsNight(p.site, d, p.tz);
export const BODIES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
export function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const MODES = ['quick', 'balanced', 'deep'] as const;
export function makeSet(r: () => number, n: number, withMoon: boolean): ItineraryItem[] {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const deep = profile.trains.filter((t) => t.id.startsWith('deep') || t.id.startsWith('wide'));
  const planetT = profile.trains.filter((t) => t.id.startsWith('planet'));
  const smart = profile.trains.filter((t) => t.kind === 'smart');
  const filters = [null, null, ...profile.equipment.filters.map((f) => f.id)];
  const out: ItineraryItem[] = [];
  for (let i = 0; i < n; i++) {
    let targetId: string; let trainId: string;
    if (i === 0) { targetId = `planet-${pick(BODIES).toLowerCase()}`; trainId = pick(planetT).id; }
    else if (i === 1 && withMoon) { targetId = 'planet-moon'; trainId = pick([...planetT, ...deep]).id; }
    else if (r() < 0.2) { targetId = `planet-${pick(BODIES).toLowerCase()}`; trainId = pick([...planetT, ...deep]).id; }
    else { targetId = pick(targets).id; trainId = r() < 0.08 ? pick(smart).id : pick(deep).id; }
    out.push({ id: `s${i}`, targetId, trainId, filterId: pick(filters), mode: pick(MODES), note: '' });
  }
  // shuffle so planet/Moon are not always first
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export const toInputs = (items: ItineraryItem[]) => items.map((i) => slotInputFor(i, profile, targets));

export interface Case { site: string; date: string; items: ItineraryItem[]; input: BuildInput }

/**
 * `count` random itineraries of `sizeOf(k)` slots whose targets are each clear for 90+ minutes (so every slot is live and the
 * search really has to choose), spread over every place and date, with a start time before, inside or after the night start.
 */
export function randomCases(seed: number, count: number, sizeOf: (k: number) => number): Case[] {
  const r = mulberry(seed);
  const nights = PLACES.flatMap((p) => p.dates.map((d) => ({ p, d, n: nightOf(p, d) }))).filter((x) => x.n.kind === 'normal' && x.n.start && x.n.end);
  const deepTrains = ['deep-c11-reducer-533', 'deep-c11-reducer-2600', 'wide-c11-hyperstar-2600', 'deep-c11-2600'];
  const out: Case[] = [];
  for (let k = 0; k < count; k++) {
    const { p, d, n } = nights[(k * 5 + seed) % nights.length];
    const base = { site: p.site, night: n, horizon: p.horizon, minAltitude: p.minAltitude };
    const clear = targets.filter((t) => windowsFor({ kind: 'fixed', raHours: t.raHours, decDeg: t.decDeg } as never, base as never).reduce((sum, w) => sum + (w.end.getTime() - w.start.getTime()), 0) > 90 * 60000);
    const used = new Set<string>();
    const items = makeSet(r, sizeOf(k), r() < 0.6).map((it) => {
      if (it.targetId.startsWith('planet-')) return it;
      let t;
      do t = clear[Math.floor(r() * clear.length)]; while (used.has(t.id) && used.size < clear.length);
      used.add(t.id);
      return { ...it, targetId: t.id, trainId: deepTrains[Math.floor(r() * deepTrains.length)] };
    });
    const len = (n.end as Date).getTime() - (n.start as Date).getTime();
    const sr = r();
    const startAt = sr < 0.3 ? null : sr < 0.4 ? new Date((n.start as Date).getTime() - 40 * 60000) : new Date(Math.floor(((n.start as Date).getTime() + r() * len * 0.4) / 60000) * 60000);
    out.push({ site: p.name, date: d, items, input: { ...base, bortle: 1 + Math.floor(r() * 9), formatTime: clock(p.tz), startAt, slots: toInputs(items) } as BuildInput });
  }
  return out;
}
