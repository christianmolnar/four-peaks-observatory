'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { horizonAltitudeAt } from '@/planner/horizon';
import { arcToHorizonPoints, MAX_ZONES } from '@/planner/profile';
import type { BlockedArc } from '@/planner/profile';
import { compass } from '@/planner/plan';
import { HORIZON_RANGE } from '@/planner/state';
import type { HorizonErrors, HorizonField, HorizonFields } from '@/planner/state';
import NumberSlider from './NumberSlider';

const SIZE = 300;
const C = SIZE / 2;
const R = 120;
/** Smallest text on the diagram as it appears on screen, in px. */
const MIN_TEXT_PX = 12.5;

const radius = (alt: number): number => (R * (90 - alt)) / 90;
const point = (az: number, r: number): string => {
  const a = (az * Math.PI) / 180;
  return `${(C + r * Math.sin(a)).toFixed(2)},${(C - r * Math.cos(a)).toFixed(2)}`;
};

/** SVG path of the blocked sector between the obstruction height and the rim. */
export function arcPath(arc: BlockedArc): string {
  const span = (arc.endAz - arc.startAz + 360) % 360;
  const large = span > 180 ? 1 : 0;
  const ri = radius(arc.heightDeg);
  return [
    `M ${point(arc.startAz, R)}`,
    `A ${R} ${R} 0 ${large} 1 ${point(arc.endAz, R)}`,
    `L ${point(arc.endAz, ri)}`,
    `A ${ri} ${ri} 0 ${large} 0 ${point(arc.startAz, ri)}`,
    'Z',
  ].join(' ');
}

export function describeArcs(arcs: readonly BlockedArc[]): string {
  if (arcs.length === 0) return 'Horizon not set: nothing is blocked and only the flat minimum altitude applies.';
  const one = (a: BlockedArc) => `from ${a.startAz} deg (${compass(a.startAz)}) clockwise to ${a.endAz} deg (${compass(a.endAz)}), up to ${a.heightDeg} deg high`;
  if (arcs.length === 1) return `Blocked ${one(arcs[0])}. Nothing is blocked elsewhere.`;
  return `${arcs.length} blocked zones: ${arcs.map((a, i) => `${i + 1}, ${one(a)}`).join('; ')}. Nothing is blocked elsewhere.`;
}

export interface HorizonEditorProps {
  siteName: string;
  /** The text in the three boxes of each zone row; empty when the draft is "no horizon". */
  fields: readonly HorizonFields[];
  /** Messages for the current text of each row, computed by the parent on every render. */
  errors: readonly HorizonErrors[];
  /** Each row's zone as the chart draws it: the last valid one, or null for a new row with a message. */
  previews: readonly (BlockedArc | null)[];
  /** Slider positions per row: the number in the box when it is fine, else the plan's number. */
  sliderValues: readonly Record<HorizonField, number>[];
  /** The draft differs from what is saved. */
  dirty: boolean;
  /** Just saved, and nothing edited since. */
  saved: boolean;
  onField: (zone: number, field: HorizonField, text: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onUseSample: () => void;
  onClear: () => void;
  onAdd: () => void;
  onRemove: (zone: number) => void;
}

const FIELDS: { key: HorizonField; id: string; label: string }[] = [
  { key: 'start', id: 'arc-start', label: 'Start azimuth' },
  { key: 'end', id: 'arc-end', label: 'End azimuth' },
  { key: 'height', id: 'arc-height', label: 'Height' },
];
/** The first zone keeps the ids the page has always had; later zones add their number. */
const fieldId = (id: string, zone: number): string => (zone === 0 ? id : `${id}-${zone + 1}`);

const btn =
  'inline-flex h-11 w-full sm:w-44 items-center justify-center rounded-lg border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40 disabled:hover:bg-transparent';

export default function HorizonEditor({
  siteName,
  fields,
  errors,
  previews,
  sliderValues,
  dirty,
  saved,
  onField,
  onSave,
  onDiscard,
  onUseSample,
  onClear,
  onAdd,
  onRemove,
}: HorizonEditorProps) {
  const drawn = previews.filter((a): a is BlockedArc => a !== null);
  const points = fields.length > 0 ? arcToHorizonPoints(drawn) : null;
  const summary = describeArcs(drawn);
  const invalid = errors.some((e) => Object.keys(e).length > 0);
  const canSave = dirty && !invalid;
  // The text is sized against the drawing's scale on screen, so it is never smaller than MIN_TEXT_PX whatever the width.
  const compassRef = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = compassRef.current;
    if (!el) return;
    const measure = () => setScale(el.getBoundingClientRect().width / SIZE || 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const font = Math.min(20, Math.ceil((MIN_TEXT_PX / scale) * 10) / 10);
  const status = invalid ? 'Fix the highlighted box to save' : dirty ? 'Unsaved changes' : saved ? 'Saved' : '';

  return (
    <section id="horizon" aria-labelledby="horizon-heading" className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 bg-black/70 rounded-lg border border-white/10 p-6 scroll-mt-44">
      <div className="col-start-1 row-start-1 flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
        <h2 id="horizon-heading" className="basis-full text-xl font-light text-white tracking-[0.15em]">
          HORIZON: {siteName.toUpperCase()}
        </h2>
        {fields.length === 0 ? (
          <span className="inline-block rounded bg-orange-400/20 text-orange-200 font-normal text-sm px-2 py-0.5" data-testid="horizon-not-set">
            Horizon not set
          </span>
        ) : (
          <span className="inline-block rounded bg-emerald-400/20 text-emerald-200 font-normal text-sm px-2 py-0.5">Horizon set</span>
        )}
        <p
          id="horizon-status"
          aria-live="polite"
          data-testid="horizon-status"
          className={`flex h-11 w-60 max-w-full items-center text-sm leading-5 font-normal ${invalid ? 'text-orange-300' : saved && !dirty ? 'text-emerald-300' : 'text-yellow-200'}`}
        >
          {status}
        </p>
      </div>

      <div className="col-span-2 grid md:grid-cols-2 gap-6">
        <div>
          <svg
            ref={compassRef}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-labelledby="polar-title polar-desc"
            className="w-full max-w-sm mx-auto"
          >
            <title id="polar-title">Horizon, seen from above</title>
            <desc id="polar-desc">{summary}</desc>
            <circle cx={C} cy={C} r={R} fill="#0b1020" stroke="#94a3b8" strokeWidth="1" />
            {[30, 60].map((alt) => (
              <circle key={alt} cx={C} cy={C} r={radius(alt)} fill="none" stroke="#475569" strokeWidth="0.75" strokeDasharray="3 3" />
            ))}
            <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="#475569" strokeWidth="0.75" />
            <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="#475569" strokeWidth="0.75" />
            {drawn.map((a, i) => (
              <path key={i} d={arcPath(a)} fill="#f97316" fillOpacity="0.55" stroke="#fb923c" strokeWidth="1.5" />
            ))}
            <circle cx={C} cy={C} r="2.5" fill="#e2e8f0" />
            {(
              [
                ['N', 0],
                ['E', 90],
                ['S', 180],
                ['W', 270],
              ] as const
            ).map(([t, az]) => {
              const [x, y] = point(az, R + 12).split(',');
              return (
                <text key={t} x={x} y={y} fill="#e2e8f0" fontSize={font} textAnchor="middle" dominantBaseline="middle">
                  {t}
                </text>
              );
            })}
            <text x={C + 4} y={C - radius(30) - 2} fill="#94a3b8" fontSize={font}>
              30°
            </text>
            <text x={C + 4} y={C - radius(60) - 2} fill="#94a3b8" fontSize={font}>
              60°
            </text>
          </svg>
          <p className="text-white/80 font-normal text-sm leading-5 mt-2 min-h-[100px] md:min-h-0">{summary}</p>
        </div>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSave();
          }}
        >
          <div className="min-h-[300px]">
            {fields.length === 0 && (
              <p className="text-white/80 font-normal text-sm mb-3">
                No obstruction is entered, so the planner uses the flat minimum altitude only. It does not guess a horizon.
              </p>
            )}
            {fields.map((zone, n) => (
              <div key={n} role="group" aria-labelledby={`zone-${n + 1}-title`} className="mb-3 rounded-lg border border-white/15 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 id={`zone-${n + 1}-title`} className="text-sm font-medium text-white tracking-wide">
                    Zone {n + 1}
                  </h3>
                  <button
                    type="button"
                    onClick={() => onRemove(n)}
                    aria-label={`Remove zone ${n + 1}`}
                    className="h-11 px-3 text-sm font-normal text-white/90 underline underline-offset-2 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400 rounded"
                  >
                    Remove zone
                  </button>
                </div>
                {FIELDS.map(({ key, id, label }) => (
                  <NumberSlider
                    key={key}
                    id={fieldId(id, n)}
                    label={label}
                    unit="deg"
                    min={HORIZON_RANGE[key].min}
                    max={HORIZON_RANGE[key].max}
                    text={zone[key]}
                    sliderValue={sliderValues[n][key]}
                    onText={(t) => onField(n, key, t)}
                    error={key === 'height' ? (errors[n].height ?? null) : (errors[n][key] ?? errors[n].arc ?? null)}
                  />
                ))}
              </div>
            ))}
            <button type="button" className={btn} onClick={onAdd} disabled={fields.length >= MAX_ZONES}>
              {fields.length === 0 ? 'Add a zone' : 'Add another zone'}
            </button>
            {fields.length >= MAX_ZONES && <p className="text-white/80 font-normal text-sm mt-2">{MAX_ZONES} zones is the most.</p>}
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="submit" className={btn} disabled={!canSave}>
              Save horizon
            </button>
            <button type="button" className={btn} onClick={onDiscard} disabled={!dirty}>
              Discard changes
            </button>
            <button type="button" className={`${btn} mt-2 sm:mt-0 sm:ml-auto`} onClick={onUseSample}>
              Use sample horizon
            </button>
          </div>
          <p className="text-white/75 font-normal text-[13px] leading-5 mt-3">
            Azimuth is degrees clockwise from north (0 = N, 90 = E, 180 = S, 270 = W). Each zone runs clockwise from start to end and may cross north. Zones may not overlap or touch. Whole degrees only. Nothing is stored until you press Save horizon.
          </p>
        </form>
      </div>

      {/* After the form in the document so the tab order reaches it after Save, Discard and Use sample; drawn in the heading row. */}
      <button
        type="button"
        onClick={onClear}
        disabled={fields.length === 0}
        className="col-start-2 row-start-1 self-start h-11 px-1 text-sm font-normal text-white/90 underline underline-offset-2 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400 rounded disabled:opacity-40 disabled:no-underline"
      >
        Clear horizon
      </button>

      <details className="col-span-2 mt-4">
        <summary className="cursor-pointer py-3 text-white/90 font-normal text-sm">Horizon as a table</summary>
        <table className="mt-2 text-sm font-normal text-white/90">
          <caption className="sr-only">Obstruction height by compass direction</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left pr-6">Direction</th>
              <th scope="col" className="text-left pr-6">Azimuth (deg)</th>
              <th scope="col" className="text-left">Blocked up to (deg)</th>
            </tr>
          </thead>
          <tbody>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((az) => {
              const h = horizonAltitudeAt(points, az);
              return (
                <tr key={az}>
                  <th scope="row" className="text-left pr-6 font-normal">{compass(az)}</th>
                  <td className="pr-6">{az}</td>
                  <td>{h === null ? 'not set' : h.toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </section>
  );
}
