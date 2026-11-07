'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import type { AstronomicalNight, Site } from '@/planner/astro';
import type { HorizonPoint } from '@/planner/horizon';
import { CARD_BODIES, clipPlanet, planetSkies, samplingFor } from '@/planner/planets';
import type { CardBody, PlanetCard } from '@/planner/planets';
import { buildGuide } from '@/planner/planets/guide';
import type { GuideBasis } from '@/planner/planets/guide';
import { planetTrainInfo } from '@/planner/planets/train';
import type { Profile, TrainEntry } from '@/planner/profile';
import AltitudeChart from './AltitudeChart';

export interface PlanetsSectionProps {
  profile: Profile;
  train: TrainEntry;
  site: Site;
  night: AstronomicalNight;
  /** The saved horizon points, or null. */
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  formatTime: (d: Date) => string;
}

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const BASIS_WORD: Record<GuideBasis, string> = {
  computed: 'computed',
  sourced: 'sourced',
  assumption: 'assumption',
  practice: 'practice',
  'not-verified': 'not verified',
};

const f1 = (x: number): string => x.toFixed(1);
const f2 = (x: number): string => x.toFixed(2);
const r0 = (x: number): string => String(Math.round(x));

function eventText(c: PlanetCard): string {
  const days = Math.abs(Math.round(c.eventDays));
  const when = `${dayFormat.format(c.event.time)} (${days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'} ${c.eventDays < 0 ? 'ago' : 'ahead'}`})`;
  if (c.event.kind === 'opposition') return `Opposition ${when}. Elongation now ${f1(c.elongationDeg)}°.`;
  if (c.event.kind === 'greatest-elongation') return `Greatest elongation ${f1(c.event.elongationDeg ?? 0)}° in the ${c.event.side} sky, ${when}. Elongation now ${f1(c.elongationDeg)}°.`;
  return `Nearest full Moon ${when}. Elongation now ${f1(c.elongationDeg)}°.`;
}

function phaseText(c: PlanetCard): string {
  const lit = `${f1(c.illuminatedFraction * 100)}% lit`;
  return c.moonPhase ? `${c.moonPhase.name}, ${lit}. Terminator position: not available from the library.` : `${lit}, phase angle ${f1(c.phaseAngleDeg)}°.`;
}

function Row({ label, basis, children }: { label: string; basis: string; children: React.ReactNode }) {
  // Two lines at wide widths, four on a phone: the rows reserve their height so a different planet moves nothing.
  return (
    <div className="py-1.5 border-b border-white/10 last:border-b-0">
      <dt className="text-white/70 text-xs">{label}, {basis}</dt>
      <dd className="text-white text-sm min-h-10 max-md:min-h-[5rem]">{children}</dd>
    </div>
  );
}

const PlanetPanel = memo(function PlanetPanel({
  card,
  info,
  minAltitude,
  horizonSet,
  night,
  formatTime,
  checked,
  onToggle,
}: {
  card: PlanetCard;
  info: ReturnType<typeof planetTrainInfo>;
  minAltitude: number;
  horizonSet: boolean;
  night: AstronomicalNight;
  formatTime: (d: Date) => string;
  checked: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  const body = card.body;
  const rot = card.rotation;
  const guide = useMemo(
    () => (info.apertureMm !== undefined ? buildGuide({ card, apertureMm: info.apertureMm, trains: info.variants, formatTime }) : null),
    [card, info, formatTime],
  );
  const entry = { name: body, windows: card.windows, usableMinutes: card.usableMinutes, peakAltitude: card.peak.altitude, peakAzimuth: card.peak.azimuth, peakTime: card.peak.time };
  const sampling = info.apertureMm !== undefined && info.scaleArcsecPx !== undefined ? samplingFor(info.scaleArcsecPx, info.apertureMm) : null;
  return (
    <div>
      <h3 className="text-white font-normal text-base mb-2">{body}: tonight</h3>
      <dl className="grid gap-x-6 md:grid-cols-2">
        <Row label="Apparent diameter" basis="computed">
          {f1(card.apparentDiameterArcsec)} arcsec{card.diameterPx !== null ? `, about ${r0(card.diameterPx)} pixels across on ${info.trainName}` : ''}.
        </Row>
        <Row label="Phase" basis="computed">{phaseText(card)}</Row>
        <Row label={card.event.kind === 'opposition' ? 'Opposition' : card.event.kind === 'greatest-elongation' ? 'Elongation' : 'Moon'} basis="computed">{eventText(card)}</Row>
        <Row label="Culmination" basis="computed">
          {formatTime(card.culmination.time)} at {r0(card.culmination.altitude)}°, {card.culmination.insideNight ? 'inside tonight’s night' : 'outside tonight’s night'}.
        </Row>
        <Row label="Clear of your horizon" basis="computed">
          {r0(card.usableMinutes)} min{card.goodMinutes !== null && card.dispersionAltitudeDeg !== null ? `, ${r0(card.goodMinutes)} of them above ${r0(card.dispersionAltitudeDeg)}°` : ''}. Peak {r0(card.peak.altitude)}° at {formatTime(card.peak.time)}.
        </Row>
        <Row label="Saturn ring tilt" basis="computed">
          {card.ringTiltDeg !== null ? `${f1(card.ringTiltDeg)}° (the size; the library does not say which face shows).` : 'Not applicable: Saturn only.'}
        </Row>
        <Row label="Clip length limit" basis={rot ? `computed, period ${rot.periodBasis}` : 'computed'}>
          {rot
            ? `${r0(rot.limitS)} s before rotation smears the disc centre by half a resolution element (period ${rot.periodH} h); suggested ${r0(rot.suggestedS)} s.`
            : body === 'Moon'
              ? 'None: the Moon does not rotate under the camera.'
              : 'Needs the telescope aperture.'}
        </Row>
        <Row label="Image scale and sampling" basis={sampling ? 'computed, seeing assumed' : 'computed'}>
          {sampling
            ? `${f2(sampling.scaleArcsecPx)} arcsec per pixel on ${info.trainName}: ${sampling.verdict === 'oversampled' ? 'oversampled' : sampling.verdict === 'coarse' ? 'coarse' : 'near the limit'} against ${f2(sampling.nyquistArcsecPx)}. Seeing assumed ${sampling.seeingArcsec} arcsec (assumption).`
            : (info.missing ?? 'Not available.')}
        </Row>
      </dl>
      {body === 'Moon' && card.mosaicPanelsPerSide !== null && (
        <p className="text-white/80 font-normal text-sm mt-2">Mosaic at this field: about {card.mosaicPanelsPerSide} by {card.mosaicPanelsPerSide} panels (computed).</p>
      )}

      <div className="mt-4">
        {card.track.length > 1 && (
          <AltitudeChart
            entry={entry}
            night={night}
            track={card.track}
            horizonSet={horizonSet}
            minAltitude={minAltitude}
            formatTime={formatTime}
            idPrefix={`planet-${body.toLowerCase()}`}
          />
        )}
      </div>

      <h3 className="text-white font-normal text-base mt-6 mb-2">Lucky-imaging checklist: {body}</h3>
      {guide === null ? (
        <p className="text-white/90 font-normal text-sm">{info.missing ?? 'The guide needs an optical train with a telescope aperture.'}</p>
      ) : (
        guide.map((section) => (
          <fieldset key={section.id} className="mb-3">
            <legend className="text-white/90 font-normal text-sm mb-1">{section.title}</legend>
            <ul className="space-y-2">
              {section.items.map((item) => {
                const key = `${body}:${item.id}`;
                return (
                  <li key={item.id}>
                    <label className="flex items-start gap-2 text-sm font-normal text-white/90">
                      <input type="checkbox" className="mt-1 accent-sky-400 shrink-0" checked={checked.has(key)} onChange={() => onToggle(key)} />
                      <span>
                        <span className="text-white">{item.title}.</span> {item.text}{' '}
                        <span className="ml-1 rounded border border-white/30 px-1.5 py-0.5 text-xs text-white/80 whitespace-nowrap">{BASIS_WORD[item.basis]}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))
      )}
    </div>
  );
});

/**
 * The Planets section: a card for each of Jupiter, Saturn, Mars, Venus, Mercury, Uranus, Neptune and the Moon, one
 * selected planet's detail with its altitude chart and the lucky-imaging checklist. Every number says whether it is
 * computed, estimated, sourced or assumed. The eight detail panels sit in one grid cell, only the selected one visible,
 * so the section is as tall as the tallest and choosing another planet moves nothing.
 */
export default function PlanetsSection({ profile, train, site, night, horizon, minAltitude, formatTime }: PlanetsSectionProps) {
  // The train's numbers as one stable object: a filter change makes a new profile but leaves these as they were.
  const fresh = planetTrainInfo(profile, train);
  const infoKey = JSON.stringify(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- infoKey names exactly what `fresh` holds
  const info = useMemo(() => fresh, [infoKey]);
  // The slow part (positions, sizes, events) does not depend on the minimum altitude or the horizon, so typing a new
  // minimum only redoes the clipping.
  const skies = useMemo(() => {
    if (night.kind !== 'normal') return null;
    return planetSkies({ site, night, apertureMm: info.apertureMm, imageScaleArcsecPx: info.scaleArcsecPx, fieldArcmin: info.fieldArcmin });
  }, [site, night, info]);
  const cards = useMemo(() => (skies ? skies.map((sky) => clipPlanet(sky, horizon, minAltitude)) : null), [skies, horizon, minAltitude]);

  const [picked, setPicked] = useState<CardBody | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (key: string) =>
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  const frame = 'bg-black/70 rounded-lg border border-white/10 p-6';
  const heading = <h2 id="planets-heading" className="text-xl font-light text-white tracking-[0.15em] mb-4">PLANETS</h2>;
  if (cards === null) {
    return (
      <section aria-labelledby="planets-heading" className={frame}>
        {heading}
        <p className="text-white/90 font-normal text-sm">There is no astronomical night on this date, so the planet cards (which use it) are not shown.</p>
      </section>
    );
  }
  // Default: the first planet that is clear of the horizon tonight, else the first card.
  const selectedBody: CardBody = picked ?? cards.find((c) => c.usableMinutes > 0)?.body ?? CARD_BODIES[0];
  const horizonSet = horizon !== null && horizon.length > 0;

  return (
    <section aria-labelledby="planets-heading" className={frame}>
      {heading}
      <p className="text-white/80 font-normal text-sm">
        Computed for the middle of tonight&apos;s astronomical night, the same night as the target list (so Mercury, Venus and the early Moon, which are twilight objects, may show as not clear when they could be imaged earlier; that is not computed). Usable time counts your saved horizon and the minimum altitude. Jupiter&apos;s Great Red Spot transits are not shown: there is no verified longitude model.
      </p>

      <fieldset className="mt-4">
        <legend className="text-white/90 font-normal text-sm mb-2">Planet</legend>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map((c) => {
            const on = c.body === selectedBody;
            return (
              <label key={c.body} className="relative block cursor-pointer">
                <input type="radio" name="planet" value={c.body} checked={on} onChange={() => setPicked(c.body)} className="peer sr-only" />
                <div className="h-full rounded-lg border-2 border-white/15 bg-black/50 p-3 peer-checked:border-sky-300 peer-checked:bg-sky-400/10 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-white font-normal text-base">{c.body}</h3>
                    <span aria-hidden={!on} className={`text-xs text-sky-200 ${on ? '' : 'invisible'}`}>Selected</span>
                  </div>
                  <p className="text-white text-sm min-h-10 max-md:min-h-[3.75rem]">
                    {c.usableMinutes > 0 ? `Clear of your horizon ${r0(c.usableMinutes)} min` : 'Not clear of your horizon tonight'}
                  </p>
                  <p className="text-white/90 text-sm min-h-10">Peak {r0(c.peak.altitude)}° at {formatTime(c.peak.time)}</p>
                  <p className="text-white/90 text-sm min-h-10 max-md:min-h-[3.75rem]">{f1(c.apparentDiameterArcsec)} arcsec, {f1(c.illuminatedFraction * 100)}% lit</p>
                  <p className="text-white/70 text-xs">all computed</p>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 grid">
        {cards.map((c) => {
          const on = c.body === selectedBody;
          return (
            <div
              key={c.body}
              className={`[grid-area:1/1] min-w-0 ${on ? '' : 'invisible'}`}
              aria-hidden={on ? undefined : true}
              inert={!on}
              data-testid={`planet-panel-${c.body}`}
            >
              <PlanetPanel
                card={c}
                info={info}
                minAltitude={minAltitude}
                horizonSet={horizonSet}
                night={night}
                formatTime={formatTime}
                checked={checked}
                onToggle={toggle}
              />
            </div>
          );
        })}
      </div>
      <p className="text-white/60 font-normal text-xs mt-4">
        The checklist ticks are not saved. computed: from the ephemeris or a formula. sourced: a cited figure. assumption: a starting value chosen here, not measured. practice: common amateur practice, no source for this build. not verified: not checked.
      </p>
    </section>
  );
}
