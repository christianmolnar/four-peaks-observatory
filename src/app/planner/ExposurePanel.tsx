'use client';

import { useMemo, useState } from 'react';
import { nextMeridianTransit } from '@/planner/astro';
import type { Site } from '@/planner/astro';
import {
  MODE_ORDER,
  NO_STOP_TIME_NOTE,
  SKY_LIMIT_K,
  SNR_ASSUMPTION,
  coreAdvice,
  planExposure,
} from '@/planner/exposure';
import type { ExposureMode, ExposureTarget, ExposureWarning, ModeEstimate, WarningCode } from '@/planner/exposure';
import type { OpticalTrain } from '@/planner/optics';
import type { PlanEntry } from '@/planner/plan';
import type { ProfileCamera, ProfileFilter } from '@/planner/profile';
import DisclosureChevron from './DisclosureChevron';

export interface ExposurePanelProps {
  entry: PlanEntry;
  target: ExposureTarget;
  /** Null for a smart scope, which has no optics numbers. */
  optics: OpticalTrain | null;
  camera: ProfileCamera | null;
  filter: ProfileFilter | null;
  /** The site, for the real meridian crossing. */
  site: Site;
  /** Sky darkness of the chosen site (Bortle 1 to 9); set once in the site editor. */
  bortle: number;
  /** False: the site has none and DEFAULT_BORTLE is an assumption, said so. */
  bortleSet: boolean;
  formatTime: (d: Date) => string;
  /** "tonight" or "that night (date)", from the page. */
  nightWord: string;
  /** Opens the page's controls and puts focus on one of them (Evening of, Train, Filter). */
  onGoToControl: (id: ControlId) => void;
}

/** The page controls a warning can send the reader to; the ids are the controls' own. */
export type ControlId = 'plan-date' | 'plan-train' | 'plan-filter';

interface WarningAction {
  /** One sentence: what to change (or, where nothing can be changed, what to do). */
  sentence: string;
  /** Real controls on this page that make the change; none when the sentence is all there is. */
  controls?: readonly { id: ControlId; label: string }[];
}

const CHANGE_FILTER = { id: 'plan-filter', label: 'Change the filter' } as const;
const CHANGE_TRAIN = { id: 'plan-train', label: 'Change the train' } as const;
const CHANGE_DATE = { id: 'plan-date', label: 'Change the date' } as const;

/**
 * The warnings a reader can act on, each with what to change. A code that is not here is context only and goes to Notes;
 * a warning with no possible action belongs there too, so every entry must say what to do.
 */
const ACT_ON: Partial<Record<WarningCode, WarningAction>> = {
  'filter-rated-slower': { sentence: 'Pick a filter rated for this speed, or another train.', controls: [CHANGE_FILTER, CHANGE_TRAIN] },
  'filter-uvir-missing': { sentence: 'Pick a filter that blocks UV/IR, or add a UV/IR cut filter to the train.', controls: [CHANGE_FILTER] },
  'filter-visual-colour': { sentence: 'Pick an imaging filter instead.', controls: [CHANGE_FILTER] },
  'moon-near': { sentence: 'Pick a night when the Moon is farther away or down, or a target farther from it.', controls: [CHANGE_DATE] },
  'no-usable-time': { sentence: 'Pick another date or another target.', controls: [CHANGE_DATE] },
  'limited-by-usable-time': { sentence: 'Pick a night with more usable time to reach the mode\'s length.', controls: [CHANGE_DATE] },
  'meridian-flip': { sentence: 'Plan a pause to flip and re-centre at the crossing; its time is already counted.' },
  'target-ou4': { sentence: 'Pick a brighter target for a short session, or plan many nights of narrowband.' },
  'short-session-faint': { sentence: 'Pick a brighter, more compact target for a short session, or choose Balanced or Deep Project.' },
};

/** Warnings to act on, and the rest, which fold into one closed line of Notes. */
export function splitWarnings(warnings: readonly ExposureWarning[]): { act: ExposureWarning[]; notes: ExposureWarning[] } {
  const act: ExposureWarning[] = [];
  const notes: ExposureWarning[] = [];
  for (const w of warnings) (w.code in ACT_ON ? act : notes).push(w);
  return { act, notes };
}

const num = (x: number): string => String(Number(x.toFixed(1)));
const range = (r: readonly [number, number], unit: string): string => `${num(r[0])} to ${num(r[1])} ${unit}`;

function filterLine(f: ProfileFilter | null): string {
  if (!f) return 'No filter.';
  const uv = f.blocksUvIr === undefined ? 'unknown' : f.blocksUvIr ? 'yes' : 'no';
  const rated = f.ratedMinFRatio !== undefined ? `f/${f.ratedMinFRatio} and slower` : f.maxIncidentAngleDeg !== undefined ? `beam angles up to ${f.maxIncidentAngleDeg} degrees` : 'not published';
  return [
    `${f.name}: ${f.kind ?? 'kind unknown'}${f.sizeMm !== undefined ? `, ${f.sizeMm} mm` : ''}.`,
    f.bandpassNotes ? `Bandpass: ${f.bandpassNotes}.` : 'Bandpass: unknown.',
    `Blocks UV/IR: ${uv}.`,
    `Rated for: ${rated}.`,
  ].join(' ');
}

const linkBtn = 'min-h-11 px-1 text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400 rounded';

/**
 * The warnings and notes for the chosen mode. It grows to fit and is not there at all when there is nothing to say.
 * Warnings to act on come first with the word "Warning", what they mean and what to change; everything else is
 * one closed "Notes (N)" line.
 */
export function Warnings({ warnings, onGoToControl }: { warnings: ExposureWarning[]; onGoToControl: (id: ControlId) => void }) {
  if (warnings.length === 0) return null;
  const { act, notes } = splitWarnings(warnings);
  return (
    <div className="mt-6" role="region" aria-label="Warnings and notes for the chosen mode" aria-live="polite" data-testid="exposure-warnings">
      {act.length > 0 && (
        <ul className="space-y-3">
          {act.map((w) => {
            const action = ACT_ON[w.code]!;
            return (
              <li key={`${w.code}-${w.text.slice(0, 24)}`} className="text-sm font-normal text-white/90" data-testid={`warning-${w.code}`}>
                <span className="mr-2 rounded border border-orange-300/60 px-1.5 py-0.5 text-xs font-medium text-orange-200">Warning</span>
                {w.text}
                <span className="mt-1 block text-white/80">
                  <span className="text-white/70">What to change: </span>
                  {action.sentence}
                  {action.controls?.map((c) => (
                    <button key={c.id} type="button" className={`${linkBtn} ml-1`} onClick={() => onGoToControl(c.id)}>
                      {c.label}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {notes.length > 0 && (
        <details className="group mt-1" data-testid="exposure-notes">
          <summary className="flex min-h-11 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden text-white/90 font-normal text-sm">
            <DisclosureChevron />
            Notes ({notes.length})
          </summary>
          <ul className="space-y-2 pb-2">
            {notes.map((w) => (
              <li key={`${w.code}-${w.text.slice(0, 24)}`} className="text-sm font-normal text-white/90">
                <span className="mr-2 rounded border border-sky-300/50 px-1.5 py-0.5 text-xs font-medium text-sky-200">Note</span>
                {w.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * One line for a flagged bright core, and a fold with the three steps to blend the two sets. The line's height
 * is reserved (three lines on a phone, one from md up) and a flagged target without a core set keeps the same
 * height, so the card never moves with the mode or the sky.
 */
function CoreAdvice({ name, advice }: { name: string; advice: ReturnType<typeof coreAdvice> }) {
  return (
    <div className="mt-4" data-testid="core-advice">
      <p className="h-[3.75rem] md:h-5 overflow-hidden text-white font-normal text-sm" data-testid="core-advice-line">
        {advice ? (
          <>
            {name}: add {advice.frames} x {advice.subSeconds} s for the core <span className="text-white/70 text-xs">({advice.label})</span>
          </>
        ) : (
          'No short set needed here.'
        )}
      </p>
      {advice ? (
        <details className="group mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden text-white/90 font-normal text-sm"><DisclosureChevron />How to blend</summary>
          <ul className="list-disc space-y-1 pl-5 text-white/80 font-normal text-sm">
            <li>Stack the long and the short subs as two separate stacks.</li>
            <li>Blend with a mask that takes the short stack where the long one nears clipping.</li>
            <li>Tools: PixInsight HDRComposition, Siril, or a Photoshop layer mask.</li>
          </ul>
        </details>
      ) : (
        <div className="mt-1 min-h-11" aria-hidden="true" />
      )}
    </div>
  );
}

/** `room` reserves the height of the longest the row can wrap to, so a different number never changes the card's height. */
function Row({ label, room, children }: { label: string; room: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5 border-b border-white/10 last:border-b-0">
      <dt className="text-white/70 text-xs">{label}</dt>
      <dd className={`text-white text-sm tabular-nums ${room}`}>{children}</dd>
    </div>
  );
}

function ModeCard({ m, checked, onSelect, formatTime }: { m: ModeEstimate; checked: boolean; onSelect: () => void; formatTime: (d: Date) => string }) {
  const oh = m.overhead;
  return (
    <label className="relative block cursor-pointer">
      <input type="radio" name="exposure-mode" value={m.mode} checked={checked} onChange={onSelect} className="peer sr-only" />
      {/* The border is always 2 px wide, so choosing a card changes colour and the word "Selected", never the size. */}
      <div className="h-full rounded-lg border-2 border-white/15 bg-black/50 p-4 peer-checked:border-sky-300 peer-checked:bg-sky-400/10 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-white font-normal text-base">{m.modeLabel}</h3>
          <span aria-hidden={!checked} className={`text-xs text-sky-200 ${checked ? '' : 'invisible'}`}>Selected</span>
        </div>
        <p className="text-white/70 text-xs mt-0.5">Aims for {m.modeRangeMin[0]} to {m.modeRangeMin[1]} minutes of light.</p>
        <dl className="mt-2">
          <Row label="Sub length" room="min-h-10">{m.subSeconds} s (range {range(m.subSecondsRange, 's')})</Row>
          <Row label="Sub count" room="min-h-10">{m.subCount} (range {range(m.subCountRange, 'subs')})</Row>
          <Row label="Total light" room="min-h-10">
            {num(m.integrationMin)} min (after lost frames {range(m.usableIntegrationRangeMin, 'min')})
          </Row>
          <Row label="Overhead" room="min-h-[4.5rem]">
            {num(oh.totalMin)} min (range {range(m.overheadRangeMin, 'min')})
            <span className="block text-white/70 text-xs">
              setup {num(oh.setupMin)}, dithers {num(oh.ditherMin)}, autofocus {num(oh.autofocusMin)}, meridian flip {num(oh.meridianFlipMin)}
            </span>
          </Row>
          <Row label="Elapsed" room="min-h-10">{num(m.elapsedMin)} min (range {range(m.elapsedRangeMin, 'min')})</Row>
          <Row label="Finish" room="min-h-10">
            {m.finish && m.finishRange
              ? `${formatTime(m.finish)} (range ${formatTime(m.finishRange[0])} to ${formatTime(m.finishRange[1])})`
              : 'no usable time'}
          </Row>
        </dl>
      </div>
    </label>
  );
}

/**
 * The Exposure panel for the selected target: three mode cards, the warnings, and one closed fold with the marginal-benefit
 * rows and the inputs used. One line at the top says every number is an estimate. The cards always hold the same rows and
 * each row reserves the height of its longest wrap, so a different mode, filter or sky does not resize them; the warnings
 * take the room they need and none when there are none.
 */
export default function ExposurePanel({ entry, target, optics, camera, filter, site, bortle, bortleSet, formatTime, nightWord, onGoToControl }: ExposurePanelProps) {
  const [mode, setMode] = useState<ExposureMode>('balanced');

  const report = useMemo(() => {
    if (!optics || !camera || entry.isPlanet) return null;
    const start = entry.windows[0]?.start ?? null;
    // The real crossing (hour angle zero) after imaging begins; unknown for anything without fixed coordinates.
    const transitTime = start && entry.source.kind === 'fixed' ? nextMeridianTransit(entry.source.raHours, entry.source.decDeg, start, site) : null;
    return planExposure({
      target,
      train: { focalRatio: optics.focalRatio, imageScale: optics.imageScale },
      camera,
      filter,
      sky: { bortle, moonIllumination: entry.moonIllumination, moonSeparationDeg: entry.moonSeparation, moonUp: entry.moonUp },
      usableMinutes: entry.usableMinutes,
      acquisitionStart: start,
      transitTime,
    });
  }, [entry, target, optics, camera, filter, site, bortle]);

  const frame = 'bg-black/70 rounded-lg border border-white/10 p-6';
  const heading = (
    <h2 id="exposure-heading" className="text-xl font-light text-white tracking-[0.15em] mb-4">
      EXPOSURE: {entry.name.toUpperCase()}
    </h2>
  );

  if (entry.isPlanet) {
    return (
      <section aria-labelledby="exposure-heading" className={frame}>
        {heading}
        <p className="text-white/90 font-normal text-sm">Exposure planning here is for deep-sky targets. The Moon and planets (solar system) use short video clips instead of long integrations.</p>
      </section>
    );
  }
  if (!optics || !camera) {
    return (
      <section aria-labelledby="exposure-heading" className={frame}>
        {heading}
        <p className="text-white/90 font-normal text-sm">Exposure planning needs an optical train (a telescope and a camera with known pixel size). Smart scopes control their own exposures.</p>
      </section>
    );
  }
  if (!report || !report.ok) {
    return (
      <section aria-labelledby="exposure-heading" className={frame}>
        {heading}
        <p className="text-white/90 font-normal text-sm">
          Not enough data in the profile for an estimate. Missing: {report && !report.ok ? report.missing.join(', ') : 'unknown'}.
        </p>
      </section>
    );
  }

  const selected = report.modes[mode];
  const warnings = selected.warnings;
  const core = coreAdvice(target, selected.subSeconds);

  return (
    <section aria-labelledby="exposure-heading" className={frame}>
      {heading}
      <p className="text-white font-normal text-sm" data-testid="exposure-estimate-line">These numbers are estimates; trust the range, not the single number.</p>
      <p className="mt-1 text-white/70 font-normal text-xs">
        Worked out for {nightWord}. Light means integrated exposure; elapsed adds setup, dithers, autofocus and a meridian flip.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3 items-start">
        <div>
          <p className="block text-white/90 font-normal text-sm mb-1" data-testid="exposure-sky">Sky darkness: Bortle {bortle}</p>
          <p className="text-white/60 text-xs mt-1 min-h-8">{bortleSet ? 'From the site.' : `Assumed, the site has none.`} Change it under Site and gear.</p>
        </div>
        <p className="md:col-span-2 text-white/80 font-normal text-sm h-[9rem] md:h-[5rem] overflow-y-auto" data-testid="exposure-filter">
          {filterLine(filter)}
        </p>
      </div>

      <fieldset className="mt-2">
        <legend className="text-white/90 font-normal text-sm mb-2">Mode</legend>
        {/* One column below 1024 px: three cards side by side are narrow enough at 768 px for a row to wrap past its reserved height. */}
        <div className="grid gap-4 lg:grid-cols-3">
          {MODE_ORDER.map((m) => (
            <ModeCard key={m} m={report.modes[m]} checked={mode === m} onSelect={() => setMode(m)} formatTime={formatTime} />
          ))}
        </div>
      </fieldset>

      {target.brightCore === true && <CoreAdvice name={entry.name} advice={core} />}

      <Warnings warnings={warnings} onGoToControl={onGoToControl} />

      <details className="group mt-4" data-testid="exposure-more">
        <summary className="flex min-h-11 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden text-white/90 font-normal text-sm">
          <DisclosureChevron />
          What more time buys and the inputs used
        </summary>
        <table className="w-full table-fixed text-left text-xs md:text-sm font-normal text-white/90" data-testid="marginal-table">
          <caption className="sr-only">Signal-to-noise against integration time, relative to 30 minutes</caption>
          <thead className="text-white">
            <tr className="border-b border-white/20 align-bottom">
              <th scope="col" className="w-[3.5rem] md:w-[4.25rem] py-2 pr-2">Light</th>
              <th scope="col" className="py-2 pr-2">Signal-to-noise vs 30 min, estimate (range)</th>
              <th scope="col" className="w-[5.25rem] md:w-auto py-2 pr-2">Gain on step before, estimate (range)</th>
              <th scope="col" className="py-2">{nightWord.charAt(0).toUpperCase() + nightWord.slice(1)}</th>
            </tr>
          </thead>
          <tbody>
            {report.marginal.map((r) => (
              <tr key={r.minutes} className="border-b border-white/10 align-top">
                <th scope="row" className="py-2 pr-2 font-normal">{r.minutes} min</th>
                <td className="py-2 pr-2 tabular-nums">
                  x{r.relativeSnr.toFixed(2)}
                  <span className="block text-white/70">range x{r.relativeSnrRange[0].toFixed(2)} to x{r.relativeSnrRange[1].toFixed(2)}</span>
                </td>
                <td className="py-2 pr-2 tabular-nums">
                  {r.gainPercent === null || r.gainPercentRange === null ? (
                    'baseline'
                  ) : (
                    <>
                      +{r.gainPercent.toFixed(0)}%
                      <span className="block text-white/70">range +{r.gainPercentRange[0].toFixed(0)}% to +{r.gainPercentRange[1].toFixed(0)}%</span>
                    </>
                  )}
                </td>
                <td className="py-2">{r.availableTonight ? 'enough usable time' : `only ${Math.round(entry.usableMinutes)} usable min`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-white/70 font-normal text-xs mt-2">{SNR_ASSUMPTION}</p>
        <p className="text-white/70 font-normal text-xs mt-1">{NO_STOP_TIME_NOTE}</p>

        <p className="text-white/60 font-normal text-xs mt-4" data-testid="exposure-inputs">
          Inputs: f/{optics.focalRatio?.toFixed(2)}, {camera.pixelSizeUm} um pixels, read noise {report.readNoiseE} e (class {camera.readNoiseClass ?? 'not set, medium assumed'}), passband {report.bandwidthNm} nm, Bortle {bortle}, Moon {(entry.moonIllumination * 100).toFixed(0)}% lit and {entry.moonSeparation.toFixed(0)} degrees away{entry.moonUp ? '' : ' (down)'}, {Math.round(entry.usableMinutes)} usable minutes. Sky-limited sub about {Math.round(report.skyLimitedSeconds)} s at the standard margin (K = {SKY_LIMIT_K}); each mode&apos;s own margin and caps are applied to it. Finish assumes imaging runs without a gap from the first usable minute; setup happens before it.
        </p>
      </details>
    </section>
  );
}
