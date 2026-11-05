'use client';

import { horizonAltitudeAt } from '@/planner/horizon';
import { arcToHorizonPoints } from '@/planner/profile';
import type { BlockedArc } from '@/planner/profile';
import { compass } from '@/planner/plan';
import NumberSlider from './NumberSlider';

const SIZE = 300;
const C = SIZE / 2;
const R = 120;

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

export function describeArc(arc: BlockedArc | null): string {
  if (arc === null) return 'Horizon not set: nothing is blocked and only the flat minimum altitude applies.';
  return `Blocked from ${arc.startAz} deg (${compass(arc.startAz)}) clockwise to ${arc.endAz} deg (${compass(arc.endAz)}), up to ${arc.heightDeg} deg high. Nothing is blocked elsewhere.`;
}

export interface HorizonEditorProps {
  siteName: string;
  arc: BlockedArc | null;
  /** Pure check of an arc: a message when it would be refused, else null. */
  validate: (arc: BlockedArc | null) => string | null;
  /** Applies an arc that passed `validate`. */
  onChange: (arc: BlockedArc | null) => void;
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onResetSample: () => void;
}

const DEFAULT_ARC: BlockedArc = { startAz: 90, endAz: 180, heightDeg: 30 };

export default function HorizonEditor({ siteName, arc, validate, onChange, dirty, onSave, onDiscard, onResetSample }: HorizonEditorProps) {
  const points = arc ? arcToHorizonPoints(arc) : null;
  const summary = describeArc(arc);
  const btn =
    'px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';

  return (
    <section aria-labelledby="horizon-heading" className="bg-black/70 rounded-lg border border-white/10 p-6">
      <h2 id="horizon-heading" className="text-xl font-light text-white tracking-[0.15em] mb-1">
        HORIZON: {siteName.toUpperCase()}
      </h2>
      <p className="mb-4">
        {arc === null ? (
          <span className="inline-block rounded bg-orange-400/20 text-orange-200 font-normal text-sm px-2 py-0.5" data-testid="horizon-not-set">
            Horizon not set
          </span>
        ) : (
          <span className="inline-block rounded bg-emerald-400/20 text-emerald-200 font-normal text-sm px-2 py-0.5">Horizon set</span>
        )}
        {dirty && <span className="ml-2 text-yellow-200 font-normal text-sm">Unsaved changes</span>}
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <svg
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
            {arc && <path d={arcPath(arc)} fill="#f97316" fillOpacity="0.55" stroke="#fb923c" strokeWidth="1.5" />}
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
                <text key={t} x={x} y={y} fill="#e2e8f0" fontSize="12" textAnchor="middle" dominantBaseline="middle">
                  {t}
                </text>
              );
            })}
            <text x={C + 4} y={C - radius(30) - 2} fill="#94a3b8" fontSize="8">
              30°
            </text>
            <text x={C + 4} y={C - radius(60) - 2} fill="#94a3b8" fontSize="8">
              60°
            </text>
          </svg>
          <p className="text-white/80 font-normal text-sm mt-2">{summary}</p>
        </div>

        <div>
          {arc === null ? (
            <div>
              <p className="text-white/80 font-normal text-sm mb-3">
                No obstruction is entered, so the planner uses the flat minimum altitude only. It does not guess a horizon.
              </p>
              <button type="button" className={btn} onClick={() => onChange(DEFAULT_ARC)}>
                Add a blocked arc
              </button>
            </div>
          ) : (
            <>
              <NumberSlider
                id="arc-start"
                label="Start azimuth"
                unit="deg"
                min={0}
                max={359}
                step={1}
                value={arc.startAz}
                resetKey={arc}
                validate={(n) => validate({ ...arc, startAz: n })}
                onCommit={(n) => onChange({ ...arc, startAz: n })}
              />
              <NumberSlider
                id="arc-end"
                label="End azimuth"
                unit="deg"
                min={0}
                max={359}
                step={1}
                value={arc.endAz}
                resetKey={arc}
                validate={(n) => validate({ ...arc, endAz: n })}
                onCommit={(n) => onChange({ ...arc, endAz: n })}
              />
              <NumberSlider
                id="arc-height"
                label="Height"
                unit="deg"
                min={0}
                max={90}
                step={1}
                value={arc.heightDeg}
                resetKey={arc}
                validate={(n) => validate({ ...arc, heightDeg: n })}
                onCommit={(n) => onChange({ ...arc, heightDeg: n })}
              />
              <p className="text-white/60 font-normal text-xs mb-3">
                Azimuth is degrees clockwise from north (E 90, S 180, W 270). The arc runs clockwise from start to end and may cross north.
              </p>
              <button type="button" className={btn} onClick={() => onChange(null)}>
                Clear horizon
              </button>
            </>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" className={btn} onClick={onSave} disabled={!dirty}>
              Save horizon
            </button>
            <button type="button" className={btn} onClick={onDiscard} disabled={!dirty}>
              Discard changes
            </button>
            <button type="button" className={btn} onClick={onResetSample}>
              Reset to sample
            </button>
          </div>
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-white/90 font-normal text-sm">Horizon as a table</summary>
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
