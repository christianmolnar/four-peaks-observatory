'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AstronomicalNight, Site } from '@/planner/astro';
import { altitudeTrack } from '@/planner/plan';
import type { TrackPoint } from '@/planner/plan';
import type { HorizonPoint } from '@/planner/horizon';
import { TREND_TEXT, makeScale, timelineGeometry } from '@/planner/itinerary';
import type { ItineraryPlan, SlotInput } from '@/planner/itinerary';

/** One colour per slot number; the slot is also named by its number on the line and in the key, so colour is never the only cue. */
const COLOURS = ['#7dd3fc', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#a3e635', '#22d3ee', '#e879f9'];
const FONT = 12; // px, and the drawing is 1:1 with the screen, so this is the size on screen
const MARGIN = { left: 34, right: 12, top: 28, bottom: 46 };
const MIN_WIDTH = 220;

export interface NightTimelineProps {
  plan: ItineraryPlan;
  /** The inputs the plan was built from, same order; they say where each slot's target is. */
  inputs: readonly SlotInput[];
  night: AstronomicalNight;
  site: Site;
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  formatTime: (d: Date) => string;
  idPrefix?: string;
}

const deg = (x: number): string => `${Math.round(x)}°`;

/**
 * The whole night in one picture: altitude against time. Each slot is a thick piece of its target's altitude curve between
 * the slot's start and end, numbered; the rest of that curve is faint; a dotted line joins one slot's end to the next slot's
 * start (the changeover or the wait). The drawing is as wide as its box, so text stays the size on screen and nothing scrolls sideways.
 * Nothing moves, so there is no motion to reduce.
 */
export default function NightTimeline({ plan, inputs, night, site, horizon, minAltitude, formatTime, idPrefix = 'timeline' }: NightTimelineProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(MIN_WIDTH, Math.floor(el.clientWidth) || 360));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const t0 = (night.start as Date).getTime();
  const t1 = (night.end as Date).getTime();
  const height = width < 500 ? 250 : 290;
  const frame = useMemo(() => ({ width, height, margin: MARGIN }), [width, height]);
  const { x, y } = makeScale(t0, t1, frame);
  const plotBottom = height - MARGIN.bottom;

  // Each slot's target through the whole night, sampled every 10 minutes, with the limit at its azimuth.
  const tracks = useMemo(
    () => inputs.map((si): TrackPoint[] | null => (si.problem ? null : altitudeTrack(si.source, site, horizon, minAltitude, night.start as Date, night.end as Date, 10))),
    [inputs, site, horizon, minAltitude, night],
  );
  const geometry = useMemo(
    () =>
      timelineGeometry(
        night.start as Date,
        night.end as Date,
        plan.slots.map((s, i) => ({
          id: s.id,
          start: s.start,
          end: s.end,
          altitudeAt: (when: Date) => {
            const track = tracks[i];
            if (!track) return 0;
            // Linear between the 10 minute samples; the ends of a slot are exact on the picture.
            const k = Math.min(track.length - 2, Math.max(0, Math.floor((when.getTime() - t0) / 600000)));
            const a = track[k];
            const b = track[k + 1];
            const f = (when.getTime() - a.time.getTime()) / (b.time.getTime() - a.time.getTime());
            return a.altitude + (b.altitude - a.altitude) * f;
          },
        })),
        frame,
        5,
      ),
    [plan, tracks, night, frame, t0],
  );

  const pts = (list: { x: number; y: number }[]) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const hours: number[] = [];
  for (let t = Math.ceil(t0 / 3600000) * 3600000; t <= t1; t += 3600000) hours.push(t);
  const labelEvery = width < 500 ? 3 : 2;

  const timed = plan.slots.filter((s) => s.altitudes);
  const summary =
    plan.slots.length === 0
      ? 'No slots yet, so nothing is drawn.'
      : `Altitude through the night, ${formatTime(night.start as Date)} to ${formatTime(night.end as Date)}, imaging starts ${formatTime(plan.startsAt)}. ` +
        plan.slots
          .map((s, i) =>
            s.altitudes
              ? `Slot ${i + 1}, ${s.name}, ${formatTime(s.start)} to ${formatTime(s.end)}: ${deg(s.altitudes.start.altitude)} ${s.altitudes.start.direction} to ${deg(s.altitudes.end.altitude)} ${s.altitudes.end.direction}, ${TREND_TEXT[s.altitudes.trend]}.`
              : `Slot ${i + 1}, ${s.name}: no time.`,
          )
          .join(' ');

  const startX = x(plan.startsAt.getTime());
  const startAnchor = startX > width - 80 ? 'end' : startX < MARGIN.left + 40 ? 'start' : 'middle';
  const colour = (i: number) => COLOURS[i % COLOURS.length];

  return (
    <div data-testid="night-timeline">
      <div ref={box} className="w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          tabIndex={0}
          aria-labelledby={`${idPrefix}-title ${idPrefix}-desc`}
          className="block w-full rounded focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-sky-400"
          style={{ height: 'auto', aspectRatio: `${width} / ${height}` }}
        >
          <title id={`${idPrefix}-title`}>Altitude of every slot through the night</title>
          <desc id={`${idPrefix}-desc`}>{summary}</desc>
          <rect x={x(t0)} y={MARGIN.top} width={x(t1) - x(t0)} height={plotBottom - MARGIN.top} fill="#6366f1" fillOpacity="0.18" />
          {[0, 30, 60, 90].map((a) => (
            <g key={a}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(a)} y2={y(a)} stroke="#475569" strokeWidth="0.75" />
              <text x={MARGIN.left - 5} y={y(a)} fill="#cbd5e1" fontSize={FONT} textAnchor="end" dominantBaseline="middle">
                {a}°
              </text>
            </g>
          ))}
          {hours.map((t, i) =>
            i % labelEvery === 0 ? (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={plotBottom} y2={plotBottom + 4} stroke="#94a3b8" />
                <text x={x(t)} y={plotBottom + 4 + FONT + 1} fill="#cbd5e1" fontSize={FONT} textAnchor="middle">
                  {formatTime(new Date(t))}
                </text>
              </g>
            ) : null,
          )}
          <text x={MARGIN.left} y={height - 4} fill="#e2e8f0" fontSize={FONT} textAnchor="start">
            {`Night starts ${formatTime(night.start as Date)}`}
          </text>
          <text x={width - MARGIN.right} y={height - 4} fill="#e2e8f0" fontSize={FONT} textAnchor="end">
            {`ends ${formatTime(night.end as Date)}`}
          </text>

          {/* The minimum altitude. */}
          <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(minAltitude)} y2={y(minAltitude)} stroke="#fb923c" strokeWidth="1.5" strokeDasharray="5 3" />

          {/* The rest of each target's night, faint; the part under its limit (horizon or minimum) dotted orange. */}
          {tracks.map((track, i) => {
            if (!track || !timed.some((s) => s.id === plan.slots[i].id)) return null;
            const runs: { x: number; y: number }[][] = [];
            let run: { x: number; y: number }[] = [];
            for (const p of track) {
              const pt = { x: x(p.time.getTime()), y: y(p.altitude) };
              if (p.altitude < p.limit) run.push(pt);
              else if (run.length > 0) {
                runs.push(run);
                run = [];
              }
            }
            if (run.length > 0) runs.push(run);
            return (
              <g key={plan.slots[i].id}>
                <polyline points={pts(track.map((p) => ({ x: x(p.time.getTime()), y: y(p.altitude) })))} fill="none" stroke={colour(i)} strokeOpacity="0.35" strokeWidth="1.5" />
                {runs.map((r, k) => (r.length > 1 ? <polyline key={k} points={pts(r)} fill="none" stroke="#fb923c" strokeWidth="3" strokeDasharray="1 4" strokeLinecap="round" /> : null))}
              </g>
            );
          })}

          {/* The changeover or the wait between one slot and the next. */}
          {geometry.connectors.map((c) => (
            <line key={`${c.fromId}-${c.toId}`} x1={c.from.x} y1={c.from.y} x2={c.to.x} y2={c.to.y} stroke="#e2e8f0" strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />
          ))}

          {/* The slots: thick, from start to end, numbered. */}
          {geometry.segments.map((s, i) =>
            s.timed ? (
              <g key={s.id}>
                <polyline points={pts(s.points)} fill="none" stroke={colour(i)} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={s.x0} cy={s.y0} r="3.5" fill="#0b1020" stroke={colour(i)} strokeWidth="2" />
                <circle cx={s.x1} cy={s.y1} r="3.5" fill="#0b1020" stroke={colour(i)} strokeWidth="2" />
              </g>
            ) : null,
          )}
          {geometry.segments.map((s, i) => {
            if (!s.timed) return null;
            const mid = s.points[Math.floor(s.points.length / 2)];
            const cy = Math.max(MARGIN.top + 10, mid.y - 15);
            return (
              <g key={`n-${s.id}`}>
                <circle cx={mid.x} cy={cy} r="10" fill="#0b1020" stroke={colour(i)} strokeWidth="2" />
                <text x={mid.x} y={cy} fill="#fff" fontSize={FONT} fontWeight="600" textAnchor="middle" dominantBaseline="central">
                  {s.number}
                </text>
              </g>
            );
          })}

          {/* When imaging starts. */}
          <line x1={startX} x2={startX} y1={MARGIN.top - 4} y2={plotBottom} stroke="#fff" strokeWidth="1.5" strokeDasharray="2 3" />
          <text x={startX} y={FONT + 4} fill="#fff" fontSize={FONT} textAnchor={startAnchor}>
            {`Start ${formatTime(plan.startsAt)}`}
          </text>
        </svg>
      </div>

      <ul className="mt-2 space-y-1 text-white/90 font-normal text-xs" aria-label="Chart key">
        <li>Numbers and thick lines: your slots. Faint line: the rest of that target&apos;s night.</li>
        <li>Dotted white line: changeover or wait between slots. Dashed orange line: minimum altitude {minAltitude}°.</li>
        <li>Dotted orange on a curve: under your horizon or minimum there. Dashed white line: your start.</li>
      </ul>

      {plan.slots.length === 0 ? (
        <p className="mt-2 text-white/90 font-normal text-sm">Add a target to draw it on the night.</p>
      ) : (
        <ol className="mt-2 space-y-1 text-white font-normal text-sm" aria-label="Slots on the graph">
          {plan.slots.map((s, i) => (
            <li key={s.id} className="flex items-baseline gap-2">
              <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-full border-2" style={{ borderColor: colour(i) }} />
              <span className="min-w-0 break-words">
                {i + 1}. {s.name}: {s.altitudes ? `${formatTime(s.start)} to ${formatTime(s.end)}` : 'no time, not drawn'}
              </span>
            </li>
          ))}
        </ol>
      )}

      <details className="mt-2" data-testid="timeline-numbers">
        <summary className="flex min-h-11 cursor-pointer items-center text-white/90 font-normal text-sm">Altitude numbers as a table</summary>
        <table className="mt-1 w-full table-fixed text-left text-xs font-normal text-white/90">
          <caption className="sr-only">Altitude and compass direction at the start, middle and end of each slot</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[26%] pr-1 align-bottom">Slot</th>
              <th scope="col" className="w-[17%] pr-1 align-bottom">Start</th>
              <th scope="col" className="w-[17%] pr-1 align-bottom">Middle</th>
              <th scope="col" className="w-[17%] pr-1 align-bottom">End</th>
              <th scope="col" className="align-bottom">Trend</th>
            </tr>
          </thead>
          <tbody>
            {plan.slots.map((s, i) => (
              <tr key={s.id} className="align-top">
                <th scope="row" className="break-words pr-1 font-normal">{i + 1}. {s.name}</th>
                {s.altitudes ? (
                  <>
                    <td className="break-words pr-1">{formatTime(s.start)}, {deg(s.altitudes.start.altitude)} {s.altitudes.start.direction}</td>
                    <td className="break-words pr-1">{deg(s.altitudes.middle.altitude)} {s.altitudes.middle.direction}</td>
                    <td className="break-words pr-1">{formatTime(s.end)}, {deg(s.altitudes.end.altitude)} {s.altitudes.end.direction}</td>
                    <td className="break-words">{TREND_TEXT[s.altitudes.trend]}</td>
                  </>
                ) : (
                  <td colSpan={4}>no time</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
