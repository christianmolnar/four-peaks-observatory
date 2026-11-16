'use client';

import { useId, useMemo, useState } from 'react';
import type { AstronomicalNight, Site } from '@/planner/astro';
import type { HorizonPoint } from '@/planner/horizon';
import { clipPlanet, planetSky, samplingFor } from '@/planner/planets';
import type { CardBody, PlanetCard } from '@/planner/planets';
import { buildGuide } from '@/planner/planets/guide';
import type { GuideBasis } from '@/planner/planets/guide';
import { planetTrainInfo } from '@/planner/planets/train';
import type { Profile, TrainEntry } from '@/planner/profile';

export interface SolarSystemDetailProps {
  /** The Moon or a planet. */
  body: CardBody;
  profile: Profile;
  train: TrainEntry;
  site: Site;
  night: AstronomicalNight;
  /** The saved horizon points, or null. */
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  formatTime: (d: Date) => string;
  /** "tonight" or "that night (date)", from the page. */
  nightWord: string;
  /** Checklist ticks, "Body:item"; kept by the page so they survive closing the row. */
  checked: ReadonlySet<string>;
  onToggle: (key: string) => void;
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
  // No reserved height here: the eight panels share one grid cell, so the section is as tall as the tallest of them.
  return (
    <div className="py-1.5 border-b border-white/10 last:border-b-0">
      <dt className="text-white/70 text-sm">{label}, {basis}</dt>
      <dd className="text-white text-sm">{children}</dd>
    </div>
  );
}

function SolarSystemPanel({
  card,
  info,
  nightWord,
  formatTime,
  checked,
  onToggle,
}: {
  card: PlanetCard;
  info: ReturnType<typeof planetTrainInfo>;
  formatTime: (d: Date) => string;
  nightWord: string;
  checked: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  const body = card.body;
  const rot = card.rotation;
  const guide = useMemo(
    () =>
      info.apertureMm !== undefined && info.scopeName !== undefined && info.cameraName !== undefined
        ? buildGuide({ card, apertureMm: info.apertureMm, scopeName: info.scopeName, cameraName: info.cameraName, cameraColour: info.cameraColour, trains: info.variants, formatTime })
        : null,
    [card, info, formatTime],
  );
  // The 21-item checklist is most of the height: closed until asked for. The ticks live in the page, so closing keeps them.
  const [listOpen, setListOpen] = useState(false);
  const listId = useId();
  const itemCount = guide === null ? 0 : guide.reduce((n, section) => n + section.items.length, 0);
  const sampling = info.apertureMm !== undefined && info.scaleArcsecPx !== undefined ? samplingFor(info.scaleArcsecPx, info.apertureMm) : null;
  return (
    <div>
      <h4 className="text-white font-normal text-base mb-2">{body}: {nightWord}</h4>
      <dl className="grid gap-x-6 md:grid-cols-2">
        <Row label="Apparent diameter" basis="computed">
          {f1(card.apparentDiameterArcsec)} arcsec{card.diameterPx !== null ? `, about ${r0(card.diameterPx)} pixels across on ${info.trainName}` : ''}.
        </Row>
        <Row label="Phase" basis="computed">{phaseText(card)}</Row>
        <Row label={card.event.kind === 'opposition' ? 'Opposition' : card.event.kind === 'greatest-elongation' ? 'Elongation' : 'Moon'} basis="computed">{eventText(card)}</Row>
        <Row label="Culmination" basis="computed">
          {formatTime(card.culmination.time)} at {r0(card.culmination.altitude)}°, {card.culmination.insideNight ? 'inside the astronomical night' : 'outside the astronomical night'}.
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

      <h4 className="mt-6">
        <button
          type="button"
          aria-expanded={listOpen}
          aria-controls={listId}
          onClick={() => setListOpen(!listOpen)}
          className="flex min-h-11 w-full items-center gap-2 rounded text-left text-base font-normal text-white focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          <span aria-hidden="true" className="w-4 text-white/70">{listOpen ? '▾' : '▸'}</span>
          Lucky-imaging checklist: {body}{itemCount > 0 ? ` (${itemCount} items)` : ''}
        </button>
      </h4>
      <div id={listId} hidden={!listOpen}>
      {listOpen && (guide === null ? (
        <p className="text-white/90 font-normal text-sm">{info.missing ?? 'The guide needs an optical setup with a telescope aperture.'}</p>
      ) : (
        guide.map((section) => (
          <fieldset key={section.id} className="mb-3">
            <legend className="text-white/90 font-normal text-sm mb-1">{section.title}</legend>
            <ul className="space-y-2">
              {section.items.map((item) => {
                const key = `${body}:${item.id}`;
                return (
                  <li key={item.id}>
                    <label className="flex min-h-11 items-center gap-2 text-sm font-normal text-white/90">
                      <input type="checkbox" className="mt-1 accent-sky-400 shrink-0" checked={checked.has(key)} onChange={() => onToggle(key)} />
                      <span>
                        <span className="text-white">{item.title}.</span> {item.text}{' '}
                        <span className="ml-1 rounded border border-white/30 px-1.5 py-0.5 text-sm text-white/80 whitespace-nowrap">{BASIS_WORD[item.basis]}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))
      ))}
      </div>
    </div>
  );
}

/**
 * What a solar-system row shows when it opens, besides the list's own detail (why, window, peak, Moon, the altitude chart):
 * the body's size, phase, event, culmination, usable time, ring tilt, clip limit, image scale, and the lucky-imaging checklist.
 * Every number says whether it is computed, estimated, sourced or assumed. Computed for the open row only.
 */
export default function SolarSystemDetail({ body, profile, train, site, night, horizon, minAltitude, formatTime, nightWord, checked, onToggle }: SolarSystemDetailProps) {
  // The train's numbers as one stable object: a filter change makes a new profile but leaves these as they were.
  const fresh = planetTrainInfo(profile, train);
  const infoKey = JSON.stringify(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- infoKey names exactly what `fresh` holds
  const info = useMemo(() => fresh, [infoKey]);
  // The slow part (position, size, events) does not depend on the minimum altitude or the horizon, so typing a new
  // minimum only redoes the clipping.
  const sky = useMemo(
    () => (night.kind === 'normal' ? planetSky({ body, site, night, apertureMm: info.apertureMm, imageScaleArcsecPx: info.scaleArcsecPx, fieldArcmin: info.fieldArcmin }) : null),
    [body, site, night, info],
  );
  const card = useMemo(() => (sky ? clipPlanet(sky, horizon, minAltitude) : null), [sky, horizon, minAltitude]);
  if (card === null) return <p className="text-white/90 font-normal text-sm">There is no astronomical night on this date, so the detail (which uses it) is not shown.</p>;
  return (
    <div data-testid={`solar-detail-${body}`}>
      <p className="text-white/80 font-normal text-sm mb-3">
        Computed for {nightWord}, at the middle of the astronomical night, the same night as the target list (so Mercury, Venus and the early Moon, which are twilight objects, may show as not clear when they could be imaged earlier; that is not computed). Usable time counts your saved horizon and the minimum altitude. Jupiter&apos;s Great Red Spot transits are not shown: there is no verified longitude model.
      </p>
      <SolarSystemPanel card={card} info={info} formatTime={formatTime} nightWord={nightWord} checked={checked} onToggle={onToggle} />
      <p className="text-white/60 font-normal text-sm mt-4">
        The checklist ticks are not saved. computed: from the ephemeris or a formula. sourced: a cited figure. assumption: a starting value chosen here, not measured. practice: common amateur practice, no source for this build. not verified: not checked.
      </p>
    </div>
  );
}
