'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { compass } from '@/planner/plan';
import type { PlanEntry, TrackPoint } from '@/planner/plan';
import type { AstronomicalNight } from '@/planner/astro';
import DisclosureChevron from './DisclosureChevron';

/** Width used until the box is measured (and where nothing can be measured). */
const DEFAULT_WIDTH = 680;
const MIN_WIDTH = 260;
/** px on screen: the drawing is as wide as its box, so this is the size the text is shown at. */
const FONT = 12;
const M = { left: 40, right: 16, top: 12, bottom: 34 };
/** The compact chart's height and margins: no axis text, so no room for it. */
const COMPACT_H = 72;
const CM = { left: 2, right: 2, top: 4, bottom: 2 };
/** Least room between two hour labels, px. */
const LABEL_GAP = 44;

/** What the chart reads from a target: the plan list's entries and the planet cards both fit. */
export type ChartEntry = Pick<PlanEntry, 'name' | 'windows' | 'usableMinutes' | 'peakAltitude' | 'peakAzimuth' | 'peakTime'>;

export interface AltitudeChartProps {
  entry: ChartEntry;
  night: AstronomicalNight;
  track: TrackPoint[];
  formatTime: (d: Date) => string;
  /** "tonight" or "that night (date)", from the page. */
  nightWord: string;
  /** Prefix for the ids the title and description get, so two charts on one page do not share them. */
  idPrefix?: string;
  /** A plan card's small chart: one curve, the limit dash and the slot's start and finish; no axis text, no key, no table. */
  compact?: boolean;
  /** The slot to mark on the compact chart; its start and finish are printed under it. */
  slot?: { start: Date; end: Date } | null;
}

export default function AltitudeChart({ entry, night, track, formatTime, nightWord, idPrefix = 'alt', compact = false, slot = null }: AltitudeChartProps) {
  // Drawn 1:1 with its box (no scaling of the viewBox), so the 12 px text is 12 px on a phone as well.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(DEFAULT_WIDTH);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(Math.max(MIN_WIDTH, Math.floor(el.clientWidth) || DEFAULT_WIDTH));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = compact ? COMPACT_H : W < 500 ? 240 : 280;
  const t0 = track[0].time.getTime();
  const t1 = track[track.length - 1].time.getTime();
  const m = compact ? CM : M;
  const x = (t: number): number => m.left + ((t - t0) / (t1 - t0)) * (W - m.left - m.right);
  const y = (alt: number): number => m.top + ((90 - Math.max(0, Math.min(90, alt))) / 90) * (H - m.top - m.bottom);
  const nightX0 = x((night.start as Date).getTime());
  const nightX1 = x((night.end as Date).getTime());

  const line = track.map((p) => `${x(p.time.getTime()).toFixed(1)},${y(p.altitude).toFixed(1)}`).join(' ');
  // Region under the limit: stepped by sample.
  const limitTop = track.map((p) => `${x(p.time.getTime()).toFixed(1)},${y(p.limit).toFixed(1)}`);
  const limitArea = `${limitTop.join(' ')} ${x(t1).toFixed(1)},${y(0)} ${x(t0).toFixed(1)},${y(0)}`;
  const usableSegments = entry.windows.map((w) => {
    const pts = track.filter((p) => p.time >= w.start && p.time <= w.end);
    return pts.map((p) => `${x(p.time.getTime()).toFixed(1)},${y(p.altitude).toFixed(1)}`).join(' ');
  });

  // Hour ticks every 2 h from the first whole hour.
  const ticks: number[] = [];
  const hour = 3600000;
  for (let t = Math.ceil(t0 / hour) * hour; t <= t1; t += hour) ticks.push(t);
  const labelEvery = Math.max(1, Math.ceil(LABEL_GAP / (((W - M.left - M.right) * hour) / (t1 - t0))));

  const summary =
    entry.usableMinutes > 0
      ? `${entry.name}: peaks at ${entry.peakAltitude.toFixed(0)} degrees, ${compass(entry.peakAzimuth)}, at ${formatTime(entry.peakTime)}. Usable ${entry.windows
          .map((w) => `${formatTime(w.start)} to ${formatTime(w.end)}`)
          .join(' and ')}.`
      : `${entry.name}: never clears the limit ${nightWord}; peaks at ${entry.peakAltitude.toFixed(0)} degrees.`;

  if (compact) {
    const sx0 = slot ? x(Math.max(slot.start.getTime(), t0)) : 0;
    const sx1 = slot ? x(Math.min(slot.end.getTime(), t1)) : 0;
    const pct = (px: number): number => Math.max(0, Math.min(100, (px / W) * 100));
    return (
      <div>
        <div ref={box} className="w-full">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Altitude of ${entry.name} through the night`} className="block w-full" style={{ height: 'auto', aspectRatio: `${W} / ${H}` }}>
            <rect x={nightX0} y={m.top} width={Math.max(0, nightX1 - nightX0)} height={H - m.top - m.bottom} fill="var(--p-c-night)" fillOpacity="0.22" />
            {slot && sx1 > sx0 && <rect data-testid={`${idPrefix}-slot`} x={sx0} y={m.top} width={sx1 - sx0} height={H - m.top - m.bottom} fill="var(--p-mode-on)" fillOpacity="0.28" />}
            <polyline points={limitTop.join(' ')} fill="none" stroke="var(--p-curve-limit)" strokeWidth="1" strokeDasharray="4 3" />
            <polyline points={line} fill="none" stroke="var(--p-curve)" strokeWidth="2" />
          </svg>
        </div>
        {slot && sx1 > sx0 && (
          <div className="relative mt-1 h-5 text-sm tabular-nums text-p-t1" data-testid={`${idPrefix}-times`}>
            <span className="absolute" style={{ left: `${Math.min(pct(sx0), 78)}%` }}>{formatTime(slot.start)}</span>
            <span className="sr-only"> to </span>
            <span className="absolute" style={{ right: `${Math.min(100 - pct(sx1), 78)}%` }}>{formatTime(slot.end)}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div ref={box} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-labelledby={`${idPrefix}-title ${idPrefix}-desc`} className="block w-full" style={{ height: 'auto', aspectRatio: `${W} / ${H}` }}>
        <title id={`${idPrefix}-title`}>{`Altitude of ${entry.name} through the night`}</title>
        <desc id={`${idPrefix}-desc`}>{summary}</desc>
        <rect x={nightX0} y={M.top} width={Math.max(0, nightX1 - nightX0)} height={H - M.top - M.bottom} fill="var(--p-c-night)" fillOpacity="0.22" />
        {[0, 30, 60, 90].map((a) => (
          <g key={a}>
            <line x1={M.left} x2={W - M.right} y1={y(a)} y2={y(a)} stroke="var(--p-c-grid)" strokeWidth="0.75" />
            <text x={M.left - 6} y={y(a)} fill="var(--p-c-label)" fontSize={FONT} textAnchor="end" dominantBaseline="middle">
              {a}°
            </text>
          </g>
        ))}
        {ticks.map((t, i) =>
          i % labelEvery === 0 ? (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={H - M.bottom} y2={H - M.bottom + 4} stroke="var(--p-c-tick)" />
              <text x={x(t)} y={H - M.bottom + 4 + FONT + 1} fill="var(--p-c-label)" fontSize={FONT} textAnchor="middle">
                {formatTime(new Date(t))}
              </text>
            </g>
          ) : null,
        )}
        <polygon className="p-hatch" points={limitArea} fill="var(--p-c-limit)" fillOpacity="0.28" />
        <polyline points={limitTop.join(' ')} fill="none" stroke="var(--p-c-limit-line)" strokeWidth="1.5" strokeDasharray="5 3" />
        <polyline points={line} fill="none" stroke="var(--p-c-alt)" strokeWidth="2" />
        {usableSegments.map((pts, i) => (
          <polyline key={i} className="p-usable" points={pts} fill="none" stroke="var(--p-c-use)" strokeWidth="4" strokeLinecap="round" />
        ))}
        {entry.usableMinutes > 0 && (
          <circle cx={x(entry.peakTime.getTime())} cy={y(entry.peakAltitude)} r="5" fill="var(--p-t1)" stroke="var(--p-c-ink)" strokeWidth="2" />
        )}
      </svg>
      </div>
      <details className="group mt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden text-p-t1 font-normal text-sm"><DisclosureChevron />Altitude as a table</summary>
        <table className="mt-2 text-sm font-normal text-p-t1">
          <caption className="sr-only">{`Altitude of ${entry.name} every 30 minutes`}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left pr-6">Time</th>
              <th scope="col" className="text-left pr-6">Altitude (deg)</th>
              <th scope="col" className="text-left pr-6">Direction</th>
              <th scope="col" className="text-left">Limit (deg)</th>
            </tr>
          </thead>
          <tbody>
            {track
              .filter((_, i) => i % 3 === 0)
              .map((p) => (
                <tr key={p.time.getTime()}>
                  <th scope="row" className="text-left pr-6 font-normal">{formatTime(p.time)}</th>
                  <td className="pr-6">{p.altitude.toFixed(0)}</td>
                  <td className="pr-6">{compass(p.azimuth)}</td>
                  <td>{p.limit.toFixed(0)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
