'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { compass } from '@/planner/plan';
import type { PlanEntry, TrackPoint } from '@/planner/plan';
import type { AstronomicalNight } from '@/planner/astro';

/** Width used until the box is measured (and where nothing can be measured). */
const DEFAULT_WIDTH = 680;
const MIN_WIDTH = 260;
/** px on screen: the drawing is as wide as its box, so this is the size the text is shown at. */
const FONT = 12;
const M = { left: 40, right: 16, top: 12, bottom: 34 };
/** Least room between two hour labels, px. */
const LABEL_GAP = 44;

/** What the chart reads from a target: the plan list's entries and the planet cards both fit. */
export type ChartEntry = Pick<PlanEntry, 'name' | 'windows' | 'usableMinutes' | 'peakAltitude' | 'peakAzimuth' | 'peakTime'>;

export interface AltitudeChartProps {
  entry: ChartEntry;
  night: AstronomicalNight;
  track: TrackPoint[];
  horizonSet: boolean;
  minAltitude: number;
  formatTime: (d: Date) => string;
  /** Prefix for the ids the title and description get, so two charts on one page do not share them. */
  idPrefix?: string;
}

export default function AltitudeChart({ entry, night, track, horizonSet, minAltitude, formatTime, idPrefix = 'alt' }: AltitudeChartProps) {
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
  const H = W < 500 ? 240 : 280;
  const t0 = track[0].time.getTime();
  const t1 = track[track.length - 1].time.getTime();
  const x = (t: number): number => M.left + ((t - t0) / (t1 - t0)) * (W - M.left - M.right);
  const y = (alt: number): number => M.top + ((90 - Math.max(0, Math.min(90, alt))) / 90) * (H - M.top - M.bottom);
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
      : `${entry.name}: never clears the limit tonight; peaks at ${entry.peakAltitude.toFixed(0)} degrees.`;

  return (
    <div>
      <div ref={box} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-labelledby={`${idPrefix}-title ${idPrefix}-desc`} className="block w-full" style={{ height: 'auto', aspectRatio: `${W} / ${H}` }}>
        <title id={`${idPrefix}-title`}>{`Altitude of ${entry.name} through the night`}</title>
        <desc id={`${idPrefix}-desc`}>{summary}</desc>
        <rect x={nightX0} y={M.top} width={Math.max(0, nightX1 - nightX0)} height={H - M.top - M.bottom} fill="#6366f1" fillOpacity="0.22" />
        {[0, 30, 60, 90].map((a) => (
          <g key={a}>
            <line x1={M.left} x2={W - M.right} y1={y(a)} y2={y(a)} stroke="#475569" strokeWidth="0.75" />
            <text x={M.left - 6} y={y(a)} fill="#cbd5e1" fontSize={FONT} textAnchor="end" dominantBaseline="middle">
              {a}°
            </text>
          </g>
        ))}
        {ticks.map((t, i) =>
          i % labelEvery === 0 ? (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={H - M.bottom} y2={H - M.bottom + 4} stroke="#94a3b8" />
              <text x={x(t)} y={H - M.bottom + 4 + FONT + 1} fill="#cbd5e1" fontSize={FONT} textAnchor="middle">
                {formatTime(new Date(t))}
              </text>
            </g>
          ) : null,
        )}
        <polygon points={limitArea} fill="#f97316" fillOpacity="0.28" />
        <polyline points={limitTop.join(' ')} fill="none" stroke="#fb923c" strokeWidth="1.5" strokeDasharray="5 3" />
        <polyline points={line} fill="none" stroke="#7dd3fc" strokeWidth="2" />
        {usableSegments.map((pts, i) => (
          <polyline key={i} points={pts} fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round" />
        ))}
        {entry.usableMinutes > 0 && (
          <circle cx={x(entry.peakTime.getTime())} cy={y(entry.peakAltitude)} r="5" fill="#fff" stroke="#0b1020" strokeWidth="2" />
        )}
      </svg>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-white/80 font-normal text-xs mt-1" aria-label="Chart key">
        <li><span aria-hidden="true" className="inline-block w-4 h-0.5 bg-sky-300 align-middle mr-1" />Altitude</li>
        <li><span aria-hidden="true" className="inline-block w-4 h-1 bg-emerald-400 align-middle mr-1" />Usable</li>
        <li>
          <span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed border-orange-400 align-middle mr-1" />
          {horizonSet ? 'Horizon limit' : `Flat limit ${minAltitude}° (horizon not set)`}
        </li>
        <li><span aria-hidden="true" className="inline-block w-4 h-3 bg-indigo-500/40 align-middle mr-1" />Astronomical night</li>
      </ul>
      <p className="text-white/90 font-normal text-sm mt-2">{summary}</p>
      <details className="mt-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-white/90 font-normal text-sm">Altitude as a table</summary>
        <table className="mt-2 text-sm font-normal text-white/90">
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
