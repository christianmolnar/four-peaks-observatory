'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { MODE_ORDER, needText } from '@/planner/exposure';
import type { ExposureWarning } from '@/planner/exposure';
import { favoriteProblem } from '@/planner/state/favorites';
import type { Favorite } from '@/planner/state/favorites';
import type { PlanPreset } from '@/planner/state/plans';
import { ACT_ON, checkNumber, differsText, minutesText, presetLabel, resultProblem, splitWarnings } from './rowExposure';
import type { RowExposure } from './rowExposure';

const btn = 'min-h-11 min-w-11 whitespace-nowrap rounded border border-p-line/30 px-3 text-sm font-normal text-p-t1 hover:bg-p-raised/10 disabled:opacity-40';
const input = 'min-h-11 w-24 rounded border border-p-line/30 bg-p-bg/60 px-2 text-sm font-normal text-p-t1';

const GO_LABEL = { date: 'Change the date', train: 'Change the setup', filter: 'Change the filter' } as const;

/** A small closed-by-default part of a row: one 44 px button that names it, a body that is hidden while closed. */
export function Fold({ id, title, children, level = 0 }: { id: string; title: string; children: ReactNode; level?: 0 | 1 }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={level === 1 ? 'ml-3 border-l border-p-line/15 pl-3' : ''}>
      <button
        type="button"
        id={id}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center gap-2 rounded text-left text-sm font-normal text-p-accent"
      >
        <span aria-hidden="true" className="w-4 shrink-0 text-p-t2">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      <div id={`${id}-body`} hidden={!open} className="pb-2">
        {open && children}
      </div>
    </div>
  );
}

/** The mode chips of a card: Quick, Balanced, Deep, and Custom only while it is set (typing a number sets it). The pressed one is filled. */
export function ExposureChips({ id, name, preset, onPreset }: { id: string; name: string; preset: PlanPreset; onPreset: (preset: PlanPreset) => void }) {
  return (
    <div role="group" aria-label={`Exposure preset for ${name}`} className="flex flex-wrap gap-1.5">
      {(preset === 'custom' ? ([...MODE_ORDER, 'custom'] as const) : MODE_ORDER).map((p) => (
        <button
          key={p}
          type="button"
          id={`plan-preset-${id}-${p}`}
          aria-pressed={preset === p}
          onClick={() => {
            if (preset !== p) onPreset(p);
          }}
          className={`min-h-11 rounded-full border px-3 text-sm font-normal ${preset === p ? 'border-p-mode-on bg-p-mode-on text-p-on-mode' : 'border-p-line/40 text-p-t1 hover:bg-p-raised/10'}`}
        >
          {p === 'custom' ? 'Custom' : presetLabel(p)}
        </button>
      ))}
    </div>
  );
}

/** The warnings on a card that have a control that changes them: the short text and the one button. */
export function ExposureWarnings({ id, warnings, onGoTo }: { id: string; warnings: readonly ExposureWarning[]; onGoTo: (control: 'date' | 'train' | 'filter') => void }) {
  return (
    <>
      {warnings.map((w) => {
        const to = ACT_ON[w.code];
        return (
          <span key={w.code} className="inline-flex flex-wrap items-center gap-1.5" data-testid={`plan-warning-${id}`}>
            <span className="p-chip-plain rounded bg-p-warn/15 px-2 py-0.5 text-sm text-p-warn-text">{w.text}</span>
            {to.map((c) => (
              <button key={c} type="button" className={btn} onClick={() => onGoTo(c)}>{GO_LABEL[c]}</button>
            ))}
          </span>
        );
      })}
    </>
  );
}

export interface PlanRowExposureProps {
  id: string;
  name: string;
  preset: PlanPreset;
  view: RowExposure;
  /** This object's saved favorite, or null. */
  favorite: Favorite | null;
  /** Why saving favorites is off (a held store), or null. */
  favoritesBlocked: string | null;
  /** `ask`: "Restore favorite?" shows; null: it does not. */
  prompt: 'ask' | 'restored' | null;
  onNumber: (field: 'subSeconds' | 'subCount', value: number) => void;
  onBack: () => void;
  onSaveFavorite: () => void;
  onRemoveFavorite: () => void;
  onRestore: () => void;
  onNotNow: () => void;
}

const surfaceFrom = { catalog: 'catalog', class: 'class', assumed: 'assumed' } as const;

/**
 * The numbers of one deep-sky row, for the card's Details: the sub length and count (editable), the Custom line, the figures behind them
 * (range, stop point, what the target needs, surface brightness, read noise, dither, image scale), the preset comparison, what more time buys,
 * the inputs, and the row's favorite. Nothing here explains; each line is a label and a number.
 */
export default function PlanRowExposure({ id, name, preset, view, favorite, favoritesBlocked, prompt, onNumber, onBack, onSaveFavorite, onRemoveFavorite, onRestore, onNotNow }: PlanRowExposureProps) {
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

  /** The short reason a typed number cannot be used, or null: the engine's own result for it, judged against the night as it is now. */
  const judge = (field: 'subSeconds' | 'subCount', text: string): { problem: string | null; value: number } => {
    const c = checkNumber(field, text);
    if (!c.ok) return { problem: c.message, value: 0 };
    // The light the engine gives for this number (it recomputes the count when only the sub length is set), not the stored count times the new length.
    const result = ok?.withNumber(field, c.value) ?? null;
    return { problem: result === null ? 'No numbers' : resultProblem(result, ok?.usableMinutes ?? 0), value: c.value };
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
        <label htmlFor={`plan-${field}-${id}`} className="block text-sm font-medium text-p-t2">{label}</label>
        <input
          id={`plan-${field}-${id}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`${label} for ${name}`}
          aria-invalid={err !== undefined}
          aria-describedby={err ? `plan-${field}-err-${id}` : undefined}
          className={`${input} ${err ? 'border-p-warn' : ''}`}
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
  // A row that gives no subs on this night cannot be saved as a favorite: refused in a few words, never sent to the store.
  const noSubs = unusable === null && chosen !== null && chosen.subCount < 1;
  const refuse = unusable !== null || noSubs;
  const dropFavoriteFocus = () => requestAnimationFrame(() => document.getElementById(`plan-fav-${id}`)?.focus());
  const figure = (f: { subSeconds: number; subCount: number }) => `${f.subSeconds} s × ${f.subCount}`;
  // A favorite saved under older limits stays saved but is not offered.
  const favoriteUnusable = favorite === null ? null : favoriteProblem(favorite);
  const differsFromFavorite =
    favorite !== null && chosen !== null && (favorite.subSeconds !== chosen.subSeconds || favorite.subCount !== chosen.subCount);
  const base = chosen === null ? null : chosen.mode;
  const th = 'font-normal text-p-t2';

  return (
    <div className="space-y-1" data-testid={`plan-exposure-${id}`}>
      {chosen === null ? (
        <p className="break-words text-sm font-normal text-p-t2" data-testid={`plan-numbers-${id}`}>{view.kind === 'ok' ? '' : view.reason}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {box('subSeconds', 'Sub (s)')}
            {box('subCount', 'Subs')}
          </div>
          {(liveError.subSeconds || liveError.subCount) && (
            <p role="alert" className="text-sm font-normal text-p-warn-strong">
              {liveError.subSeconds && <span id={`plan-subSeconds-err-${id}`} className="block">{liveError.subSeconds}</span>}
              {liveError.subCount && <span id={`plan-subCount-err-${id}`} className="block">{liveError.subCount}</span>}
            </p>
          )}
          {unusable !== null && (
            <p role="alert" className="text-sm font-normal text-p-warn-strong" data-testid={`plan-custom-unusable-${id}`}>{unusable}</p>
          )}
          <p className="text-sm font-normal text-p-t1" data-testid={`plan-numbers-${id}`}>
            <span data-testid="plan-figure" className="block font-medium text-p-t1">{chosen.subSeconds} s × {chosen.subCount} {chosen.subCount === 1 ? 'sub' : 'subs'}</span>
            <span className="sr-only"> · </span>{chosen.integrationMin === 0 && chosen.subCount > 0 ? 'under 1 min' : minutesText(chosen.integrationMin)} light · {minutesText(chosen.elapsedMin)} total
          </p>
          {preset === 'custom' && base !== null && (
            <p className="flex flex-wrap items-center gap-x-3 text-sm font-normal text-p-t1" data-testid={`plan-custom-${id}`}>
              <span>{unusable === null ? differsText() : 'Custom not used'}</span>
              <button type="button" className={btn} onClick={() => { clear(); onBack(); requestAnimationFrame(() => document.getElementById(`plan-preset-${id}-${base}`)?.focus()); }}>
                Back to {presetLabel(base)}
              </button>
            </p>
          )}
        </>
      )}

      {chosen !== null && ok !== null && (
        <div className="space-y-1">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm font-normal text-p-t1" data-testid={`plan-figures-${id}`}>
            <dt className={th}>Sub range</dt><dd>{chosen.subSecondsRange[0]} to {chosen.subSecondsRange[1]} s</dd>
            <dt className={th}>Light range</dt><dd>{minutesText(chosen.modeRangeMin[0])} to {minutesText(chosen.modeRangeMin[1])}</dd>
            <dt className={th}>Stop point</dt><dd>{minutesText(chosen.knee.minutes)}</dd>
            <dt className={th}>Needs</dt><dd>{needText(chosen.knee.snrTimeMin)}</dd>
            <dt className={th}>Surface brightness</dt><dd>{chosen.knee.surfaceBrightnessMu.toFixed(1)} <span className="text-p-t2">{surfaceFrom[chosen.knee.surfaceBrightnessFrom]}</span></dd>
            <dt className={th}>Read noise</dt><dd>{(chosen.readNoisePenalty * 100).toFixed(1)}%</dd>
            <dt className={th}>Dither every</dt><dd>{chosen.ditherEveryFrames} subs</dd>
            {ok.imageScale != null && <><dt className={th}>Image scale</dt><dd>{ok.imageScale.toFixed(2)}″/px</dd></>}
          </dl>
          <Fold id={`plan-compare-${id}`} title="Compare" level={1}>
            <table className="w-full table-fixed text-left text-sm font-normal text-p-t1 [&_td]:pr-2 [&_th]:pr-2 [&_td]:align-top" data-testid={`plan-compare-table-${id}`}>
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
                <tr><th scope="row" className={th}>Sub</th>{MODE_ORDER.map((m) => <td key={m}>{ok.presets[m].subSeconds} s</td>)}</tr>
                <tr><th scope="row" className={th}>Subs</th>{MODE_ORDER.map((m) => <td key={m}>{ok.presets[m].subCount}</td>)}</tr>
                <tr><th scope="row" className={th}>Light</th>{MODE_ORDER.map((m) => <td key={m}>{minutesText(ok.presets[m].integrationMin)}</td>)}</tr>
                <tr><th scope="row" className={th}>Total</th>{MODE_ORDER.map((m) => <td key={m}>{minutesText(ok.presets[m].elapsedMin)}</td>)}</tr>
              </tbody>
            </table>
          </Fold>
          <Fold id={`plan-buys-${id}`} title="Extra light" level={1}>
            <table className="w-full table-fixed text-left text-sm font-normal text-p-t1 [&_td]:pr-2 [&_th]:pr-2" data-testid={`plan-buys-table-${id}`}>
              <caption className="sr-only">What more light buys for {name}</caption>
              <thead>
                <tr><th scope="col">Light</th><th scope="col">SNR</th><th scope="col">Gain</th><th scope="col">Tonight</th></tr>
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
          </Fold>
          <p className="text-sm font-normal text-p-t2" data-testid={`plan-inputs-${id}`}>Inputs: {ok.inputs}.</p>
        </div>
      )}

      {favorite !== null && favoriteUnusable !== null && (
        <p className="text-sm font-normal text-p-warn-strong" data-testid={`plan-favorite-unusable-${id}`}>Favorite not usable</p>
      )}
      {prompt === 'ask' && favorite !== null && favoriteUnusable === null && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm font-normal text-p-t1" data-testid={`plan-favorite-ask-${id}`}>
          <span>Restore your favorite ({figure(favorite)})?</span>
          <span className="flex gap-2">
            <button type="button" className={btn} onClick={() => { onRestore(); dropFavoriteFocus(); }}>Restore</button>
            <button type="button" className={btn} onClick={() => { onNotNow(); dropFavoriteFocus(); }}>Not now</button>
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4">
        <label className="flex min-h-11 w-fit items-center gap-2 pr-2 text-sm font-normal text-p-t1">
          <input
            id={`plan-fav-${id}`}
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-p-focus"
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
        {favorite !== null && differsFromFavorite && favoritesBlocked === null && prompt !== 'ask' && !confirmUpdate && (
          <button type="button" className={btn} onClick={() => { setConfirmRemove(false); if (refuse) setRefusedFavorite(true); else setConfirmUpdate(true); }}>Update favorite to these numbers</button>
        )}
      </div>
      {refusedFavorite && refuse && (
        <p role="alert" className="text-sm font-normal text-p-warn-strong" data-testid={`plan-favorite-refused-${id}`}>
          {unusable !== null ? 'Not saved: custom not used' : 'Not saved: no subs fit'}
        </p>
      )}
      {favoritesBlocked !== null && <p className="text-sm font-normal text-p-warn-text" data-testid={`plan-favorite-blocked-${id}`}>{favoritesBlocked}</p>}
      {confirmUpdate && favorite !== null && differsFromFavorite && prompt !== 'ask' && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm font-normal text-p-t1" data-testid={`plan-favorite-update-confirm-${id}`}>
          <span>Replace the favorite with {figure({ subSeconds: chosen?.subSeconds ?? 0, subCount: chosen?.subCount ?? 0 })}?</span>
          <span className="flex gap-2">
            <button type="button" className={btn} onClick={() => { setConfirmUpdate(false); onSaveFavorite(); dropFavoriteFocus(); }}>Update favorite</button>
            <button type="button" className={btn} onClick={() => { setConfirmUpdate(false); dropFavoriteFocus(); }}>Keep the old one</button>
          </span>
        </p>
      )}
      {confirmRemove && favorite !== null && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm font-normal text-p-t1" data-testid={`plan-favorite-confirm-${id}`}>
          <span>Remove the favorite for {name}?</span>
          <span className="flex gap-2">
            <button type="button" className={btn} onClick={() => { setConfirmRemove(false); onRemoveFavorite(); dropFavoriteFocus(); }}>Remove favorite</button>
            <button type="button" className={btn} onClick={() => { setConfirmRemove(false); dropFavoriteFocus(); }}>Keep it</button>
          </span>
        </p>
      )}
    </div>
  );
}

export { splitWarnings };
