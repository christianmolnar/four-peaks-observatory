'use client';

import { useMemo, useState } from 'react';
import { nextMeridianTransit } from '@/planner/astro';
import type { Site } from '@/planner/astro';
import {
  DEFAULT_BORTLE,
  MODE_ORDER,
  NO_STOP_TIME_NOTE,
  SNR_ASSUMPTION,
  planExposure,
} from '@/planner/exposure';
import type { ExposureMode, ExposureTarget, ExposureWarning, ModeEstimate } from '@/planner/exposure';
import type { OpticalTrain } from '@/planner/optics';
import type { PlanEntry } from '@/planner/plan';
import type { ProfileCamera, ProfileFilter } from '@/planner/profile';

export interface ExposurePanelProps {
  entry: PlanEntry;
  target: ExposureTarget;
  /** Null for a smart scope, which has no optics numbers. */
  optics: OpticalTrain | null;
  camera: ProfileCamera | null;
  filter: ProfileFilter | null;
  /** The site, for the real meridian crossing. */
  site: Site;
  formatTime: (d: Date) => string;
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

function WarningList({ warnings }: { warnings: ExposureWarning[] }) {
  if (warnings.length === 0) return <p className="text-white/70 font-normal text-sm">No warnings for this choice.</p>;
  return (
    <ul className="space-y-2">
      {warnings.map((w) => (
        <li key={`${w.code}-${w.text.slice(0, 24)}`} className="text-sm font-normal text-white/90">
          <span className={`mr-2 rounded border px-1.5 py-0.5 text-xs font-medium ${w.severity === 'warning' ? 'border-orange-300/60 text-orange-200' : 'border-sky-300/50 text-sky-200'}`}>
            {w.severity === 'warning' ? 'Warning' : 'Note'}
          </span>
          {w.text}
        </li>
      ))}
    </ul>
  );
}

/** `room` reserves the height of the longest the row can wrap to, so a different number never changes the card's height. */
function Row({ label, room, children }: { label: string; room: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5 border-b border-white/10 last:border-b-0">
      <dt className="text-white/70 text-xs">{label}, estimate</dt>
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
        <p className="text-white/70 text-xs mt-0.5">Aims for {m.modeRangeMin[0]} to {m.modeRangeMin[1]} minutes of light. All values are estimates.</p>
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
 * The Exposure panel for the selected target: three mode cards, the marginal-benefit rows, and the warnings.
 * Every number is an estimate and says so. The panel's size does not depend on the chosen mode, filter or
 * sky: the cards always hold the same rows and the warnings area keeps a fixed minimum height.
 */
export default function ExposurePanel({ entry, target, optics, camera, filter, site, formatTime }: ExposurePanelProps) {
  const [mode, setMode] = useState<ExposureMode>('balanced');
  const [bortle, setBortle] = useState<number>(DEFAULT_BORTLE);

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
        <p className="text-white/90 font-normal text-sm">Exposure planning here is for deep-sky targets. Planets use short video clips instead of long integrations.</p>
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
  const warnings = [...report.warnings, ...selected.warnings];

  return (
    <section aria-labelledby="exposure-heading" className={frame}>
      {heading}
      <p className="text-white/80 font-normal text-sm">
        Estimates for tonight, not predictions. Each number carries a range, and the sky, seeing and equipment will move it. Light means integrated exposure; elapsed adds setup, dithers, autofocus and a meridian flip.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3 items-start">
        <div>
          <label htmlFor="exposure-bortle" className="block text-white/90 font-normal text-sm mb-1">Sky darkness (Bortle class)</label>
          <select id="exposure-bortle" className="bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 w-full" value={bortle} onChange={(e) => setBortle(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => (
              <option key={b} value={b}>Bortle {b}</option>
            ))}
          </select>
          <p className="text-white/60 text-xs mt-1 h-8 overflow-hidden">Assumed {DEFAULT_BORTLE} until you change it; not saved.</p>
        </div>
        <p className="md:col-span-2 text-white/80 font-normal text-sm h-[9rem] md:h-[5rem] overflow-y-auto" data-testid="exposure-filter">
          {filterLine(filter)}
        </p>
      </div>

      <fieldset className="mt-2">
        <legend className="text-white/90 font-normal text-sm mb-2">Mode</legend>
        <div className="grid gap-4 md:grid-cols-3">
          {MODE_ORDER.map((m) => (
            <ModeCard key={m} m={report.modes[m]} checked={mode === m} onSelect={() => setMode(m)} formatTime={formatTime} />
          ))}
        </div>
      </fieldset>

      {/* Fixed text: a heading that named the mode would wrap to two lines for the longer names and push everything below it. */}
      <h3 id="exposure-warnings-heading" className="text-white font-normal text-base mt-6 mb-2">Warnings and notes for the chosen mode</h3>
      {/* A fixed height with its own always-visible scrollbar: whatever the mode, filter or target says, nothing below this box moves. */}
      <div
        className="h-[26rem] md:h-[16.5rem] overflow-y-scroll pr-2 [scrollbar-color:rgba(255,255,255,0.5)_rgba(255,255,255,0.1)]"
        role="region"
        aria-labelledby="exposure-warnings-heading"
        tabIndex={0}
        aria-live="polite"
        data-testid="exposure-warnings"
      >
        <WarningList warnings={warnings} />
      </div>

      <h3 className="text-white font-normal text-base mt-6 mb-2">What more time buys (estimate)</h3>
      <table className="w-full table-fixed text-left text-xs md:text-sm font-normal text-white/90" data-testid="marginal-table">
        <caption className="sr-only">Signal-to-noise against integration time, relative to 30 minutes</caption>
        <thead className="text-white">
          <tr className="border-b border-white/20 align-bottom">
            <th scope="col" className="w-[4.25rem] py-2 pr-2">Light</th>
            <th scope="col" className="py-2 pr-2">Signal-to-noise vs 30 min, estimate (range)</th>
            <th scope="col" className="w-[4.5rem] md:w-auto py-2 pr-2">Gain on the step before</th>
            <th scope="col" className="py-2">Tonight</th>
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
              <td className="py-2 pr-2 tabular-nums">{r.gainPercent === null ? 'baseline' : `+${r.gainPercent.toFixed(0)}%`}</td>
              <td className="py-2">{r.availableTonight ? 'enough usable time' : `only ${Math.round(entry.usableMinutes)} usable min`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-white/70 font-normal text-xs mt-2">{SNR_ASSUMPTION}</p>
      <p className="text-white/70 font-normal text-xs mt-1">{NO_STOP_TIME_NOTE}</p>

      <p className="text-white/60 font-normal text-xs mt-4" data-testid="exposure-inputs">
        Inputs: f/{optics.focalRatio?.toFixed(2)}, {camera.pixelSizeUm} um pixels, read noise {report.readNoiseE} e (class {camera.readNoiseClass ?? 'not set, medium assumed'}), passband {report.bandwidthNm} nm, Bortle {bortle}, Moon {(entry.moonIllumination * 100).toFixed(0)}% lit and {entry.moonSeparation.toFixed(0)} degrees away{entry.moonUp ? '' : ' (down)'}, {Math.round(entry.usableMinutes)} usable minutes. Sky-limited sub about {Math.round(report.skyLimitedSeconds)} s before each mode&apos;s margin. Finish assumes imaging runs without a gap from the first usable minute; setup happens before it.
      </p>
    </section>
  );
}
