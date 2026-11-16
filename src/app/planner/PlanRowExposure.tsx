'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { MAX_SUBS, MODE_ORDER, needText } from '@/planner/exposure';
import type { ExposureMode, ExposureResult } from '@/planner/exposure';
import { favoriteProblem } from '@/planner/state/favorites';
import type { Favorite } from '@/planner/state/favorites';
import type { PlanPreset } from '@/planner/state/plans';
import { ACT_ON, checkNumber, differsText, exposureSummary, minutesText, presetLabel, resultProblem, splitWarnings } from './rowExposure';
import type { RowExposure } from './rowExposure';

const btn = 'min-h-11 min-w-11 whitespace-nowrap rounded border border-white/30 px-3 text-sm font-normal text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';
const input = 'min-h-11 w-24 rounded border border-white/30 bg-black/60 px-2 text-sm font-normal text-white focus:outline-none focus:ring-2 focus:ring-sky-400';

const SUB_LIMIT: Record<ExposureResult['limitedBy']['sub'], string> = {
  'read-noise': 'the sky and read noise (long enough that the sky, not read noise, sets the noise)',
  'risk-cap': 'the risk cap (a longer sub risks losing more to a trail or a cloud)',
  saturation: 'star saturation (a longer sub would clip the stars)',
  floor: 'the 15 s floor (overhead makes shorter subs wasteful)',
  'count-cap': 'the limit on the number of subs (a longer sub keeps the count down)',
  user: 'your choice',
};
const TOTAL_LIMIT: Record<ExposureResult['limitedBy']['total'], string> = {
  'snr-target': 'the preset’s signal-to-noise target',
  'diminishing-returns': 'diminishing returns (another half hour adds too little)',
  'minimum-total': 'the 30 minute minimum',
  'usable-window': 'the time the target is usable on this night',
  'count-cap': `the limit of ${MAX_SUBS} subs (more light would need more subs than a plan holds)`,
  user: 'your choice',
};
const GO_LABEL = { date: 'Change the date', train: 'Change the setup', filter: 'Change the filter' } as const;

/** A small closed-by-default part of a row: one 44 px button that names it, a body that is hidden while closed. */
function Fold({ id, title, children, level = 0 }: { id: string; title: string; children: ReactNode; level?: 0 | 1 }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={level === 1 ? 'ml-3 border-l border-white/15 pl-3' : ''}>
      <button
        type="button"
        id={id}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center gap-2 rounded text-left text-sm font-normal text-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400"
      >
        <span aria-hidden="true" className="w-4 shrink-0 text-white/70">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      <div id={`${id}-body`} hidden={!open} className="pb-2">
        {open && children}
      </div>
    </div>
  );
}

export interface PlanRowExposureProps {
  id: string;
  name: string;
  preset: PlanPreset;
  view: RowExposure;
  formatTime: (d: Date) => string;
  /** This object's saved favorite, or null. */
  favorite: Favorite | null;
  /** Why saving favorites is off (a held store), or null. */
  favoritesBlocked: string | null;
  /** `ask`: "Restore favorite?" shows; `restored`: the favorite was applied automatically and the line says so; null: neither. */
  prompt: 'ask' | 'restored' | null;
  onPreset: (preset: PlanPreset) => void;
  onNumber: (field: 'subSeconds' | 'subCount', value: number) => void;
  onBack: () => void;
  onSaveFavorite: () => void;
  onRemoveFavorite: () => void;
  onRestore: () => void;
  onNotNow: () => void;
  /** Opens the strip and focuses the plan's own date, train or filter control. */
  onGoTo: (control: 'date' | 'train' | 'filter') => void;
}

/**
 * The exposure of one deep-sky row of the plan: the preset choice, what the engine computes for it (sub length, subs, light, elapsed, finish),
 * the Custom edit with its words and "Back to <preset>", the warnings to act on, the folds ("Why these numbers": limits, range, stop point,
 * notes, a three-column preset comparison, what more time buys and the inputs), and the row's favorite.
 */
export default function PlanRowExposure({ id, name, preset, view, formatTime, favorite, favoritesBlocked, prompt, onPreset, onNumber, onBack, onSaveFavorite, onRemoveFavorite, onRestore, onNotNow, onGoTo }: PlanRowExposureProps) {
  // What is typed in a box until it is applied (Enter or leaving the box); a box that is not being edited shows the stored number.
  const [draft, setDraft] = useState<{ subSeconds?: string; subCount?: string }>({});
  const [errors, setErrors] = useState<{ subSeconds?: string; subCount?: string }>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  // Set when Save or Update favorite is pressed while the row's own numbers do not work on this night.
  const [refusedFavorite, setRefusedFavorite] = useState(false);
  const clear = () => {
    setDraft({});
    setErrors({});
  };
  const ok = view.kind === 'ok' ? view : null;
  const chosen = ok?.chosen ?? null;

  /** The plain reason a typed number cannot be used, or null: the engine's own result for it, judged against the night as it is now. */
  const judge = (field: 'subSeconds' | 'subCount', text: string): { problem: string | null; value: number } => {
    const c = checkNumber(field, text);
    if (!c.ok) return { problem: c.message, value: 0 };
    // The light the engine gives for this number (it recomputes the count when only the sub length is set), not the stored count times the new length.
    const result = ok?.withNumber(field, c.value) ?? null;
    return { problem: result === null ? 'The engine could not compute numbers for that.' : resultProblem(result, ok?.usableMinutes ?? 0), value: c.value };
  };
  const apply = (field: 'subSeconds' | 'subCount') => {
    const text = draft[field];
    if (text === undefined || chosen === null) return;
    const { problem, value } = judge(field, text);
    if (problem !== null) {
      setErrors((e) => ({ ...e, [field]: problem }));
      return;
    }
    const c = { value };
    setErrors((e) => ({ ...e, [field]: undefined }));
    setDraft((d) => ({ ...d, [field]: undefined }));
    if (c.value !== (field === 'subSeconds' ? chosen.subSeconds : chosen.subCount)) onNumber(field, c.value);
  };
  const box = (field: 'subSeconds' | 'subCount', label: string) => {
    // A refusal is judged again on every render: it goes when the other box's number (or the night) makes the draft valid.
    const err = liveError[field];
    return (
      <div>
        <label htmlFor={`plan-${field}-${id}`} className="block text-sm font-medium text-white/80">{label}</label>
        <input
          id={`plan-${field}-${id}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`${label} for ${name}`}
          aria-invalid={err !== undefined}
          aria-describedby={err ? `plan-${field}-err-${id}` : undefined}
          className={`${input} ${err ? 'border-orange-300' : ''}`}
          value={draft[field] ?? String(chosen === null ? '' : field === 'subSeconds' ? chosen.subSeconds : chosen.subCount)}
          onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
          onBlur={() => apply(field)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply(field);
            }
          }}
        />
      </div>
    );
  };

  const liveError = {
    subSeconds: errors.subSeconds !== undefined && draft.subSeconds !== undefined ? (judge('subSeconds', draft.subSeconds).problem ?? undefined) : undefined,
    subCount: errors.subCount !== undefined && draft.subCount !== undefined ? (judge('subCount', draft.subCount).problem ?? undefined) : undefined,
  };
  const unusable = ok?.customUnusable ?? null;
  // A row that gives no subs on this night cannot be saved as a favorite: refused in plain words, never sent to the store.
  const noSubs = unusable === null && chosen !== null && chosen.subCount < 1;
  const refuse = unusable !== null || noSubs;
  const split = chosen === null ? null : splitWarnings(chosen.warnings);
  const dropFavoriteFocus = () => requestAnimationFrame(() => document.getElementById(`plan-fav-${id}`)?.focus());
  const summary = favorite === null ? '' : exposureSummary(favorite);
  // A favorite saved under older limits stays saved but is not offered: the row says why.
  const favoriteUnusable = favorite === null ? null : favoriteProblem(favorite);
  const differsFromFavorite =
    favorite !== null && chosen !== null && (favorite.subSeconds !== chosen.subSeconds || favorite.subCount !== chosen.subCount);
  const base: ExposureMode | null = chosen === null ? null : chosen.mode;

  return (
    <div className="mt-2 space-y-1" data-testid={`plan-exposure-${id}`}>
      <div role="group" aria-label={`Exposure preset for ${name}`} className="grid grid-cols-2 gap-1 min-[360px]:grid-cols-4">
        {([...MODE_ORDER, 'custom'] as const).map((p) => (
          <button
            key={p}
            type="button"
            id={`plan-preset-${id}-${p}`}
            aria-pressed={preset === p}
            onClick={() => {
              if (preset === p) return;
              clear();
              onPreset(p);
            }}
            className={`min-h-11 rounded border px-0 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-sky-400 ${preset === p ? 'border-sky-300 bg-sky-400/20 text-white' : 'border-white/30 text-white/90 hover:bg-white/10'}`}
          >
            {p === 'custom' ? 'Custom' : presetLabel(p)}
          </button>
        ))}
      </div>

      {chosen === null ? (
        <p className="break-words text-sm font-normal text-white/80" data-testid={`plan-numbers-${id}`}>{view.kind === 'ok' ? '' : view.reason}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {box('subSeconds', 'Exposure per shot (seconds)')}
            {box('subCount', 'Number of shots')}
          </div>
          {(liveError.subSeconds || liveError.subCount) && (
            <p role="alert" className="text-sm font-normal text-orange-200">
              {liveError.subSeconds && <span id={`plan-subSeconds-err-${id}`} className="block">{liveError.subSeconds}</span>}
              {liveError.subCount && <span id={`plan-subCount-err-${id}`} className="block">{liveError.subCount}</span>}
            </p>
          )}
          {ok?.customUnusable != null && (
            <p role="alert" className="text-sm font-normal text-orange-200" data-testid={`plan-custom-unusable-${id}`}>{ok.customUnusable}</p>
          )}
          <p className="text-sm font-normal text-white/90" data-testid={`plan-numbers-${id}`}>
            <span data-testid="plan-figure" className="block font-medium text-white">{chosen.subSeconds} s × {chosen.subCount} {chosen.subCount === 1 ? 'sub' : 'subs'}</span>
            <span className="sr-only"> · </span>{chosen.integrationMin === 0 && chosen.subCount > 0 ? 'under 1 min' : minutesText(chosen.integrationMin)} of light · {minutesText(chosen.elapsedMin)} with setup and overhead
            {chosen.finish !== null && <> · finish about {formatTime(chosen.finish)} if it starts when the target is up</>}
          </p>
          {preset === 'custom' && base !== null && (
            <p className="flex flex-wrap items-center gap-x-3 text-sm font-normal text-white/90" data-testid={`plan-custom-${id}`}>
              <span>{unusable === null ? differsText(chosen) : 'Custom: not used on this night.'}</span>
              <button type="button" className={btn} onClick={() => { clear(); onBack(); requestAnimationFrame(() => document.getElementById(`plan-preset-${id}-${base}`)?.focus()); }}>
                Back to {presetLabel(base)}
              </button>
            </p>
          )}
        </>
      )}

      {split?.act.map((w) => {
        const a = ACT_ON[w.code];
        return (
          <div key={w.code} className="rounded border border-orange-300/40 bg-orange-400/10 p-2 text-sm font-normal text-white/90" data-testid={`plan-warning-${id}`}>
            <p><span className="mr-2 rounded bg-orange-300/30 px-1.5 py-0.5 text-sm text-white">Warning</span>{w.text}</p>
            <p className="mt-1">What to change: {a.change}</p>
            {a.to.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {a.to.map((c) => (
                  <button key={c} type="button" className={btn} onClick={() => onGoTo(c)}>{GO_LABEL[c]}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {chosen !== null && ok !== null && split !== null && (
        <Fold id={`plan-why-${id}`} title="Why these numbers">
          <div className="space-y-1 text-sm font-normal text-white/90">
            <p>Sub length is held by {SUB_LIMIT[chosen.limitedBy.sub]}. Total light is held by {TOTAL_LIMIT[chosen.limitedBy.total]}.</p>
            <p>Range: subs of {chosen.subSecondsRange[0]} to {chosen.subSecondsRange[1]} s; total light {minutesText(chosen.modeRangeMin[0])} to {minutesText(chosen.modeRangeMin[1])}; about {minutesText(chosen.usableIntegrationRangeMin[0])} to {minutesText(chosen.usableIntegrationRangeMin[1])} usable after clouds, trails and rejected frames.</p>
            <p>
              Stop point {minutesText(chosen.knee.minutes)}, set by {chosen.knee.setBy === 'snr-target' ? 'the signal-to-noise target' : 'diminishing returns'}: the target needs {needText(chosen.knee.snrTimeMin)}, and another half hour adds too little after {minutesText(chosen.knee.marginalMin)}.
              Surface brightness {chosen.knee.surfaceBrightnessMu.toFixed(1)} mag per square arcsecond ({chosen.knee.surfaceBrightnessFrom === 'catalog' ? 'the catalog’s number' : chosen.knee.surfaceBrightnessFrom === 'class' ? 'a stand-in for its class' : 'assumed medium'}).
            </p>
            <p>Read noise adds {(chosen.readNoisePenalty * 100).toFixed(1)}% to the noise at this sub length. Dither every {chosen.ditherEveryFrames} subs. {chosen.filterNote} {chosen.gain.note}</p>
            <p className="text-sm text-white/70">Every number is an estimate, computed by the planner from the sky, optics and camera.</p>
            <Fold id={`plan-notes-${id}`} title={`Notes (${split.notes.length})`} level={1}>
              {split.notes.length === 0 ? (
                <p>No notes for this target.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5">
                  {split.notes.map((n, i) => (
                    <li key={`${n.code}-${i}`}>{n.severity === 'warning' ? 'Warning: ' : ''}{n.text}</li>
                  ))}
                </ul>
              )}
            </Fold>
            <Fold id={`plan-compare-${id}`} title="Compare presets" level={1}>
              <table className="w-full table-fixed text-left text-sm font-normal text-white/90 [&_td]:pr-2 [&_th]:pr-2 [&_td]:align-top" data-testid={`plan-compare-table-${id}`}>
                <caption className="sr-only">Quick, Balanced and Deep for {name}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-[28%]"><span className="sr-only">Number</span></th>
                    {MODE_ORDER.map((m) => (
                      <th key={m} scope="col">{presetLabel(m)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr><th scope="row" className="font-normal text-white/70">Sub length</th>{MODE_ORDER.map((m) => <td key={m}>{ok.presets[m].subSeconds} s</td>)}</tr>
                  <tr><th scope="row" className="font-normal text-white/70">Subs</th>{MODE_ORDER.map((m) => <td key={m}>{ok.presets[m].subCount}</td>)}</tr>
                  <tr><th scope="row" className="font-normal text-white/70">Light</th>{MODE_ORDER.map((m) => <td key={m}>{minutesText(ok.presets[m].integrationMin)}</td>)}</tr>
                  <tr><th scope="row" className="font-normal text-white/70">Elapsed</th>{MODE_ORDER.map((m) => <td key={m}>{minutesText(ok.presets[m].elapsedMin)}</td>)}</tr>
                </tbody>
              </table>
            </Fold>
            <Fold id={`plan-buys-${id}`} title="What more time buys and the inputs used" level={1}>
              <table className="w-full table-fixed text-left text-sm font-normal text-white/90 [&_td]:pr-2 [&_th]:pr-2" data-testid={`plan-buys-table-${id}`}>
                <caption className="sr-only">What more light buys for {name}, sky-limited</caption>
                <thead>
                  <tr><th scope="col">Light</th><th scope="col">Signal to noise</th><th scope="col">Gain</th><th scope="col">Tonight</th></tr>
                </thead>
                <tbody>
                  {ok.marginal.map((r) => (
                    <tr key={r.minutes}>
                      <td>{r.minutes} min</td>
                      <td>{r.relativeSnr.toFixed(2)}×</td>
                      <td>{r.gainPercent === null ? 'base' : `+${r.gainPercent.toFixed(0)}%`}</td>
                      <td>{r.availableTonight ? 'fits' : 'too long'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-sm text-white/70" data-testid={`plan-inputs-${id}`}>Inputs: {ok.inputs}.</p>
            </Fold>
          </div>
        </Fold>
      )}

      {favorite !== null && favoriteUnusable !== null && (
        <p className="text-sm font-normal text-orange-200" data-testid={`plan-favorite-unusable-${id}`}>
          Your saved exposure for this object ({summary}) cannot be used: {favoriteUnusable}. It stays saved; save new numbers to replace it, or remove it.
        </p>
      )}
      {prompt === 'ask' && favorite !== null && favoriteUnusable === null && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm font-normal text-white/90" data-testid={`plan-favorite-ask-${id}`}>
          <span>You saved an exposure for this object: {summary}. Restore favorite?</span>
          <span className="flex gap-2">
            <button type="button" className={btn} onClick={() => { onRestore(); dropFavoriteFocus(); }}>Restore</button>
            <button type="button" className={btn} onClick={() => { onNotNow(); dropFavoriteFocus(); }}>Not now</button>
          </span>
        </p>
      )}
      {prompt === 'restored' && favorite !== null && favoriteUnusable === null && (
        <p className="text-sm font-normal text-white/90" data-testid={`plan-favorite-restored-${id}`}>
          Your saved exposure for this object was restored automatically: {summary}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4">
        <label className="flex min-h-11 w-fit items-center gap-2 pr-2 text-sm font-normal text-white/90">
          <input
            id={`plan-fav-${id}`}
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-sky-400"
            checked={favorite !== null}
            disabled={favoritesBlocked !== null || (favorite === null && chosen === null)}
            onChange={() => {
              if (favorite !== null) {
                setConfirmUpdate(false);
                setConfirmRemove(true);
              } else if (refuse) setRefusedFavorite(true);
              else {
                setRefusedFavorite(false);
                onSaveFavorite();
              }
            }}
          />
          <span>Save as favorite</span>
        </label>
        {favorite !== null && <span className="rounded border border-white/20 px-1.5 py-0.5 text-sm font-normal text-white/80">Favorite saved</span>}
        {favorite !== null && differsFromFavorite && favoritesBlocked === null && prompt !== 'ask' && !confirmUpdate && (
          <button type="button" className={btn} onClick={() => { setConfirmRemove(false); if (refuse) setRefusedFavorite(true); else setConfirmUpdate(true); }}>Update favorite to these numbers</button>
        )}
      </div>
      {refusedFavorite && refuse && (
        <p role="alert" className="text-sm font-normal text-orange-200" data-testid={`plan-favorite-refused-${id}`}>
          {unusable !== null
            ? 'The favorite was not saved: your custom numbers do not work on this night. Change the sub length or the number of subs, or go back to the preset.'
            : 'The favorite was not saved: this night gives no subs for this target. Pick another night or target.'}
        </p>
      )}
      {favoritesBlocked !== null && <p className="text-sm font-normal text-orange-100" data-testid={`plan-favorite-blocked-${id}`}>{favoritesBlocked}</p>}
      {confirmUpdate && favorite !== null && differsFromFavorite && prompt !== 'ask' && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm font-normal text-white/90" data-testid={`plan-favorite-update-confirm-${id}`}>
          <span>Replace the favorite for {name} ({summary}) with {exposureSummary({ preset, ...(base !== null && preset === 'custom' ? { base } : {}), subSeconds: chosen?.subSeconds ?? 0, subCount: chosen?.subCount ?? 0 })}?</span>
          <span className="flex gap-2">
            <button type="button" className={btn} onClick={() => { setConfirmUpdate(false); onSaveFavorite(); dropFavoriteFocus(); }}>Update favorite</button>
            <button type="button" className={btn} onClick={() => { setConfirmUpdate(false); dropFavoriteFocus(); }}>Keep the old one</button>
          </span>
        </p>
      )}
      {confirmRemove && favorite !== null && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm font-normal text-white/90" data-testid={`plan-favorite-confirm-${id}`}>
          <span>Remove the favorite exposure for {name}? Only this favorite is removed.</span>
          <span className="flex gap-2">
            <button type="button" className={btn} onClick={() => { setConfirmRemove(false); onRemoveFavorite(); dropFavoriteFocus(); }}>Remove favorite</button>
            <button type="button" className={btn} onClick={() => { setConfirmRemove(false); dropFavoriteFocus(); }}>Keep it</button>
          </span>
        </p>
      )}
    </div>
  );
}
