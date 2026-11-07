'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { bodyAltAz } from '@/planner/astro';
import type { AstronomicalNight, Site } from '@/planner/astro';
import { starterTargets } from '@/planner/catalog';
import { DEFAULT_BORTLE, MODES, MODE_ORDER } from '@/planner/exposure';
import type { ExposureMode } from '@/planner/exposure';
import { usableWindowsOnTrack } from '@/planner/horizon';
import type { HorizonPoint } from '@/planner/horizon';
import {
  ITINERARY_KEY,
  ItineraryError,
  MAX_NOTE_CHARS,
  MAX_SLOTS,
  buildItinerary,
  moveItem,
  parseItinerary,
  serializeItinerary,
  worstCaseWarningTexts,
} from '@/planner/itinerary';
import type { ItineraryItem, Slot } from '@/planner/itinerary';
import { newItem, planetIdOf, slotInputFor } from '@/planner/itinerary/resolve';
import type { PlanEntry } from '@/planner/plan';
import type { Profile, TrainEntry } from '@/planner/profile';

export interface ItinerarySectionProps {
  profile: Profile;
  /** The train chosen at the top of the page; new slots start on it. */
  train: TrainEntry;
  entries: readonly PlanEntry[];
  site: Site;
  night: AstronomicalNight;
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  formatTime: (d: Date) => string;
}

const field = 'bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';
const btn = 'px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40 aria-disabled:opacity-40';

const MOON_ID = planetIdOf('Moon');

const nextId = (items: readonly ItineraryItem[]): string => {
  const used = new Set(items.map((i) => i.id));
  for (let n = 1; ; n++) if (!used.has(`s${n}`)) return `s${n}`;
};

function Chip({ severity, label }: { severity: 'warning' | 'note'; label: string }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${severity === 'warning' ? 'border-orange-300/60 text-orange-200' : 'border-sky-300/50 text-sky-200'}`}>
      {severity === 'warning' ? 'Warning' : 'Note'}: {label.toLowerCase()}
    </span>
  );
}

function Detail({
  heading,
  changeover,
  window: win,
  warnings,
}: {
  heading: string;
  changeover: { label: string; minutes: number }[];
  window: string;
  warnings: { severity: 'warning' | 'note'; text: string }[];
}) {
  const total = changeover.reduce((s, p) => s + p.minutes, 0);
  return (
    <div>
      <h3 className="text-white font-normal text-base mb-2">{heading}</h3>
      <p className="text-white/90 font-normal text-sm">
        {changeover.length === 0 ? 'Before this slot: nothing (setup happens before the first slot and is not counted).' : `Before this slot: ${changeover.map((p) => `${p.label} ${p.minutes} min`).join(', ')}; ${total} min in all (estimate).`}
      </p>
      <p className="text-white/90 font-normal text-sm mt-1">{win}</p>
      <ul className="mt-2 space-y-2">
        {warnings.length === 0 && <li className="text-sm font-normal text-white/70">No warnings for this slot.</li>}
        {warnings.map((w) => (
          <li key={w.text} className="text-sm font-normal text-white/90">
            <span className={`mr-2 rounded border px-1.5 py-0.5 text-xs font-medium ${w.severity === 'warning' ? 'border-orange-300/60 text-orange-200' : 'border-sky-300/50 text-sky-200'}`}>
              {w.severity === 'warning' ? 'Warning' : 'Note'}
            </span>
            {w.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The night itinerary (spec screen G): the targets you add, in the order you set with the up and down buttons, each with
 * a train, a filter and a mode, scheduled one after the other with the changeover between them. Subs and counts come
 * from the exposure module; every time and number here is an estimate. Saved in this browser with a version.
 */
export default function ItinerarySection({ profile, train, entries, site, night, horizon, minAltitude, formatTime }: ItinerarySectionProps) {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  // A rejected saved itinerary is an alert; a storage that cannot be read or written is a status (the page already reports blocked storage).
  const [problem, setProblem] = useState<{ text: string; urgent: boolean } | null>(null);
  const [bortle, setBortle] = useState<number>(DEFAULT_BORTLE);
  const [addId, setAddId] = useState<string>('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const focusNext = useRef<string | null>(null);

  // Browser-only: the saved itinerary. Stored text that fails the check is reported with its field path and left in storage.
  useEffect(() => {
    try {
      const text = window.localStorage.getItem(ITINERARY_KEY);
      if (text !== null) setItems(parseItinerary(text).items);
    } catch (e) {
      setProblem(
        e instanceof ItineraryError
          ? { text: `Saved itinerary rejected, ${e.message}. Starting empty; the stored text stays until you change the itinerary.`, urgent: true }
          : { text: `Saved itinerary could not be read: ${(e as Error).message}`, urgent: false },
      );
    }
    setLoaded(true);
  }, []);

  const commit = (next: ItineraryItem[], focusId: string | null = null) => {
    setItems(next);
    focusNext.current = focusId;
    try {
      window.localStorage.setItem(ITINERARY_KEY, serializeItinerary(next));
      setProblem(null);
    } catch (e) {
      setProblem({ text: `Itinerary not saved, so it is lost on reload: ${(e as Error).message}`, urgent: false });
    }
  };
  useEffect(() => {
    if (focusNext.current) document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  }, [items]);

  const optical = profile.trains.filter((t) => t.kind === 'optical');
  const plan = useMemo(() => {
    if (night.kind !== 'normal') return null;
    return buildItinerary({
      site,
      night,
      horizon,
      minAltitude,
      bortle,
      slots: items.map((i) => slotInputFor(i, profile, starterTargets)),
      formatTime,
    });
  }, [items, profile, site, night, horizon, minAltitude, bortle, formatTime]);

  // The Moon is not a row of the target table; the itinerary offers it after the planets.
  const options = useMemo((): Pick<PlanEntry, 'id' | 'name' | 'isPlanet' | 'usableMinutes'>[] => {
    let moonMinutes = 0;
    if (night.kind === 'normal' && night.start && night.end) {
      const { windows } = usableWindowsOnTrack({ altAzAt: (d) => bodyAltAz('Moon', d, site), horizon, minAltitude, start: night.start, end: night.end, stepMinutes: 5 });
      moonMinutes = windows.reduce((s, w) => s + (w.end.getTime() - w.start.getTime()), 0) / 60000;
    }
    return [...entries, { id: MOON_ID, name: 'Moon', isPlanet: true, usableMinutes: moonMinutes }];
  }, [entries, night, site, horizon, minAltitude]);

  const update = (id: string, patch: Partial<ItineraryItem>) => commit(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const move = (id: string, dir: 'up' | 'down') => {
    const next = moveItem(items, id, dir === 'up' ? -1 : 1);
    if (next.every((x, k) => x === items[k])) return; // already at the end
    commit(next, `it-${dir}-${id}`);
  };
  const add = () => {
    if (train.kind !== 'optical' || items.length >= MAX_SLOTS) return;
    const entry = options.find((e) => e.id === (addId || options[0]?.id));
    if (!entry) return;
    const id = nextId(items);
    commit([...items, newItem(entry, train.id, train.filterId ?? null, id)], null);
    setDetailId(id);
  };
  const remove = (id: string) => {
    commit(items.filter((i) => i.id !== id), 'it-add-target');
    if (detailId === id) setDetailId(null);
  };

  const heading = <h2 id="itinerary-heading" className="text-xl font-light text-white tracking-[0.15em] mb-4">NIGHT ITINERARY</h2>;
  const frame = 'bg-black/70 rounded-lg border border-white/10 p-6';
  if (night.kind !== 'normal' || plan === null) {
    return (
      <section aria-labelledby="itinerary-heading" className={frame}>
        {heading}
        <p className="text-white/90 font-normal text-sm">There is no astronomical night on this date, so there is nothing to schedule.</p>
      </section>
    );
  }

  const addDisabledReason = train.kind !== 'optical' ? 'Pick an optical train at the top of the page: a smart scope plans its own exposures.' : items.length >= MAX_SLOTS ? `An itinerary holds at most ${MAX_SLOTS} slots.` : '';
  const shown: Slot[] = plan.slots;
  const detailSlot = shown.find((s) => s.id === detailId) ?? shown[0];
  const longestName = shown.reduce((n, s) => (s.name.length > n.length ? s.name : n), 'Orion Nebula');
  const worst = worstCaseWarningTexts(longestName);
  const totals = plan.totals;

  return (
    <section aria-labelledby="itinerary-heading" className={frame}>
      {heading}
      <p className="text-white/80 font-normal text-sm">
        Slots run in the order below, one after the other. Each starts when the one before is done and the changeover is over, or when its target clears your horizon, whichever is later. Times, subs and overhead are estimates for tonight, not predictions. Setup (30 minutes) happens before the first slot and is not counted.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-[2fr_auto_1fr] items-end">
        <div>
          <label htmlFor="it-add-target" className="block text-white/90 font-normal text-sm mb-1">Target to add</label>
          <select id="it-add-target" className={`${field} w-full`} value={addId || options[0]?.id || ''} onChange={(e) => setAddId(e.target.value)} disabled={options.length === 0}>
            {options.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{e.isPlanet && e.id !== MOON_ID ? ' (planet)' : ''}: {e.usableMinutes > 0 ? `${Math.round(e.usableMinutes)} min clear` : 'not clear tonight'}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={btn} onClick={add} disabled={addDisabledReason !== '' || options.length === 0}>
          Add to itinerary
        </button>
        <div>
          <label htmlFor="it-bortle" className="block text-white/90 font-normal text-sm mb-1">Bortle class for the itinerary</label>
          <select id="it-bortle" className={`${field} w-full`} value={bortle} onChange={(e) => setBortle(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => (
              <option key={b} value={b}>Bortle {b}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-1 text-white/70 font-normal text-xs min-h-8" data-testid="itinerary-add-note">
        {addDisabledReason || `New slots start on ${train.name}. Bortle ${DEFAULT_BORTLE} is assumed until you change it; not saved.`}
      </p>
      {problem && (
        <p role={problem.urgent ? 'alert' : 'status'} className="mt-2 bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm" data-testid="itinerary-problem">
          {problem.text}
        </p>
      )}

      <p className="mt-4 text-white font-normal text-sm min-h-10 max-md:min-h-[5rem]" data-testid="itinerary-why">
        <span className="text-white/70">Why this order: </span>
        {plan.why}
      </p>
      <p className="text-white/80 font-normal text-sm min-h-10 max-md:min-h-[7.5rem]" data-testid="itinerary-totals">
        {shown.length === 0
          ? 'No slots yet.'
          : `Light ${Math.round(totals.integrationMin)} min, changeover ${Math.round(totals.changeoverMin)} min, waiting ${Math.round(totals.waitMin)} min; ${totals.filterChanges} filter ${totals.filterChanges === 1 ? 'change' : 'changes'}, ${totals.trainChanges} train ${totals.trainChanges === 1 ? 'change' : 'changes'}; ${totals.ends ? `ends ${formatTime(totals.ends)}` : 'nothing scheduled'}. All estimates.`}
      </p>

      {loaded && shown.length === 0 ? (
        <p className="mt-2 text-white/90 font-normal text-sm">Choose a target above and add it. Reorder with the Up and Down buttons.</p>
      ) : (
        <ol className="mt-2 space-y-3" aria-label="Night itinerary, in order">
          {shown.map((s, k) => {
            const it = items[k];
            const missingTrain = !optical.some((t) => t.id === it.trainId);
            const missingFilter = it.filterId !== null && !profile.equipment.filters.some((f) => f.id === it.filterId);
            const timed = s.end.getTime() > s.start.getTime();
            return (
              <li key={s.id} className="rounded-lg border border-white/15 bg-black/50 p-4" data-testid={`slot-${s.id}`}>
                <div className="flex flex-col md:flex-row md:flex-wrap items-baseline justify-between gap-x-4">
                  <h3 className="text-white font-normal text-base">
                    {k + 1}. {s.name}
                  </h3>
                  <p className="text-white text-sm tabular-nums" data-testid={`slot-time-${k}`}>
                    {timed ? `${formatTime(s.start)} to ${formatTime(s.end)}` : 'no time'} <span className="text-white/70 text-xs">(estimate)</span>
                  </p>
                </div>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <div>
                    <label htmlFor={`it-train-${s.id}`} className="block text-white/70 text-xs mb-0.5">Train for {s.name}</label>
                    <select id={`it-train-${s.id}`} className={`${field} w-full`} value={it.trainId} onChange={(e) => update(s.id, { trainId: e.target.value })}>
                      {missingTrain && <option value={it.trainId}>{it.trainId} (not in profile)</option>}
                      {optical.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`it-filter-${s.id}`} className="block text-white/70 text-xs mb-0.5">Filter for {s.name}</label>
                    <select id={`it-filter-${s.id}`} className={`${field} w-full`} value={it.filterId ?? ''} onChange={(e) => update(s.id, { filterId: e.target.value === '' ? null : e.target.value })}>
                      <option value="">No filter</option>
                      {missingFilter && <option value={it.filterId as string}>{it.filterId} (not in profile)</option>}
                      {profile.equipment.filters.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`it-mode-${s.id}`} className="block text-white/70 text-xs mb-0.5">Mode for {s.name}</label>
                    <select id={`it-mode-${s.id}`} className={`${field} w-full`} value={it.mode} onChange={(e) => update(s.id, { mode: e.target.value as ExposureMode })}>
                      {MODE_ORDER.map((m) => (
                        <option key={m} value={m}>{MODES[m].label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="mt-2 text-white/90 font-normal text-sm min-h-10 max-md:min-h-[5rem]" data-testid={`slot-light-${k}`}>
                  {s.subSeconds !== null && s.subCount !== null
                    ? `Light: ${s.subSeconds} s x ${s.subCount} subs = ${Math.round(s.integrationMin * 10) / 10} min (estimate).`
                    : timed
                      ? `${s.name === 'Moon' ? 'Moon' : 'Planet'}: short video clips, about ${Math.round(s.integrationMin)} min (estimate). See the Planets checklist.`
                      : 'No imaging is planned for this slot.'}{' '}
                  {k > 0 ? `Before it: ${s.changeover.minutes} min (estimate).` : ''}
                </p>
                {/* The chips for the most that can appear together (three) are reserved invisibly, so a change of order or filter moves nothing. */}
                <div className="mt-1 grid">
                  <div className="[grid-area:1/1] flex flex-wrap items-start gap-2" data-testid={`slot-chips-${k}`}>
                    {s.warnings.map((w) => (
                      <Chip key={w.code} severity={w.severity} label={w.label} />
                    ))}
                  </div>
                  <div className="[grid-area:1/1] invisible flex flex-wrap items-start gap-2" aria-hidden="true">
                    {worst.map((w) => (
                      <Chip key={w.label} severity={w.severity} label={w.label} />
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <div className="grow min-w-[12rem]">
                    <label htmlFor={`it-note-${s.id}`} className="block text-white/70 text-xs mb-0.5">Note for {s.name}</label>
                    <input
                      id={`it-note-${s.id}`}
                      type="text"
                      maxLength={MAX_NOTE_CHARS}
                      className={`${field} w-full`}
                      value={it.note}
                      onChange={(e) => update(s.id, { note: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      id={`it-up-${s.id}`}
                      className={btn}
                      aria-disabled={k === 0}
                      aria-label={`Move ${s.name} up`}
                      onClick={() => k > 0 && move(s.id, 'up')}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      id={`it-down-${s.id}`}
                      className={btn}
                      aria-disabled={k === shown.length - 1}
                      aria-label={`Move ${s.name} down`}
                      onClick={() => k < shown.length - 1 && move(s.id, 'down')}
                    >
                      Down
                    </button>
                    <button type="button" className={btn} aria-pressed={detailSlot?.id === s.id} aria-label={`Details for ${s.name}`} onClick={() => setDetailId(s.id)}>
                      Details
                    </button>
                    <button type="button" className={btn} aria-label={`Remove ${s.name}`} onClick={() => remove(s.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {detailSlot && (
        <div className="mt-4 grid rounded-lg border border-white/15 bg-black/40 p-4" role="region" aria-label="Slot details" data-testid="slot-detail">
          <div className="[grid-area:1/1]" aria-live="polite">
            <Detail
              heading={`Slot ${shown.indexOf(detailSlot) + 1} details: ${detailSlot.name}`}
              changeover={shown.indexOf(detailSlot) === 0 ? [] : detailSlot.changeover.parts}
              window={detailSlot.window ? `Usable window ${formatTime(detailSlot.window.start)} to ${formatTime(detailSlot.window.end)} (computed).` : 'This target has no usable window left for this slot (computed).'}
              warnings={detailSlot.warnings}
            />
          </div>
          <div className="[grid-area:1/1] invisible" aria-hidden="true" inert>
            <Detail
              heading={`Slot 8 details: ${longestName}`}
              changeover={[
                { label: 'slew and centre', minutes: 88 },
                { label: 'train change', minutes: 88 },
                { label: 'filter change', minutes: 88 },
                { label: 'refocus', minutes: 88 },
              ]}
              window="Usable window 88:88 to 88:88 (computed)."
              warnings={worst}
            />
          </div>
        </div>
      )}
    </section>
  );
}
