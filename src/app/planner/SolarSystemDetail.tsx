'use client';

import { useMemo } from 'react';
import type { AstronomicalNight, Site } from '@/planner/astro';
import type { HorizonPoint } from '@/planner/horizon';
import { clipPlanet, planetSky, samplingFor } from '@/planner/planets';
import type { CardBody, PlanetCard } from '@/planner/planets';
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
}

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const f1 = (x: number): string => x.toFixed(1);
const f2 = (x: number): string => x.toFixed(2);
const r0 = (x: number): string => String(Math.round(x));

function eventText(c: PlanetCard): string {
  const days = Math.abs(Math.round(c.eventDays));
  const when = `${dayFormat.format(c.event.time)} (${days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'} ${c.eventDays < 0 ? 'ago' : 'ahead'}`})`;
  if (c.event.kind === 'opposition') return `${when}, elongation ${f1(c.elongationDeg)}°`;
  if (c.event.kind === 'greatest-elongation') return `${f1(c.event.elongationDeg ?? 0)}° ${c.event.side}, ${when}`;
  return `${when}, elongation ${f1(c.elongationDeg)}°`;
}

function phaseText(c: PlanetCard): string {
  const lit = `${f1(c.illuminatedFraction * 100)}% lit`;
  return c.moonPhase ? `${c.moonPhase.name}, ${lit}` : `${lit}, phase angle ${f1(c.phaseAngleDeg)}°`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  // No reserved height here: the eight panels share one grid cell, so the section is as tall as the tallest of them.
  return (
    <div className="py-1.5 border-b border-p-line/10 last:border-b-0">
      <dt className="text-p-t1/70 text-sm">{label}</dt>
      <dd className="text-p-t1 text-sm">{children}</dd>
    </div>
  );
}

function SolarSystemPanel({ card, info, nightWord, formatTime }: { card: PlanetCard; info: ReturnType<typeof planetTrainInfo>; formatTime: (d: Date) => string; nightWord: string }) {
  const body = card.body;
  const rot = card.rotation;
  const sampling = info.apertureMm !== undefined && info.scaleArcsecPx !== undefined ? samplingFor(info.scaleArcsecPx, info.apertureMm) : null;
  return (
    <div>
      <h4 className="text-p-t1 font-normal text-base mb-2">{body}: {nightWord}</h4>
      <dl className="grid gap-x-6 md:grid-cols-2">
        <Row label="Apparent diameter">
          {f1(card.apparentDiameterArcsec)}″{card.diameterPx !== null ? `, ${r0(card.diameterPx)} px on ${info.trainName}` : ''}
        </Row>
        <Row label="Phase">{phaseText(card)}</Row>
        <Row label={card.event.kind === 'opposition' ? 'Opposition' : card.event.kind === 'greatest-elongation' ? 'Elongation' : 'Moon'}>{eventText(card)}</Row>
        <Row label="Culmination">
          {formatTime(card.culmination.time)} at {r0(card.culmination.altitude)}°
        </Row>
        <Row label="Clear of your horizon">
          {r0(card.usableMinutes)} min{card.goodMinutes !== null && card.dispersionAltitudeDeg !== null ? `, ${r0(card.goodMinutes)} above ${r0(card.dispersionAltitudeDeg)}°` : ''}. Peak {r0(card.peak.altitude)}° at {formatTime(card.peak.time)}
        </Row>
        {card.ringTiltDeg !== null && <Row label="Saturn ring tilt">{f1(card.ringTiltDeg)}°</Row>}
        <Row label="Clip length limit">
          {rot ? `${r0(rot.limitS)} s, suggested ${r0(rot.suggestedS)} s (period ${rot.periodH} h)` : body === 'Moon' ? 'None' : 'Needs aperture'}
        </Row>
        <Row label="Image scale and sampling">
          {sampling
            ? `${f2(sampling.scaleArcsecPx)} arcsec/px on ${info.trainName}: ${sampling.verdict === 'oversampled' ? 'oversampled' : sampling.verdict === 'coarse' ? 'coarse' : 'near the limit'} vs ${f2(sampling.nyquistArcsecPx)}. Seeing ${sampling.seeingArcsec}″ assumed`
            : (info.missing ?? 'Not available')}
        </Row>
      </dl>
      {body === 'Moon' && card.mosaicPanelsPerSide !== null && (
        <p className="text-p-t1/70 font-normal text-sm mt-2">Mosaic {card.mosaicPanelsPerSide} × {card.mosaicPanelsPerSide} panels</p>
      )}
    </div>
  );
}

/**
 * What a solar-system row shows when it opens, besides the list's own detail (why, window, peak, Moon, the altitude chart):
 * the body's size, phase, event, culmination, usable time, ring tilt, clip limit and image scale. Computed for the open row only.
 */
export default function SolarSystemDetail({ body, profile, train, site, night, horizon, minAltitude, formatTime, nightWord }: SolarSystemDetailProps) {
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
  if (card === null) return <p className="text-p-t1 font-normal text-sm">No astronomical night</p>;
  return (
    <div data-testid={`solar-detail-${body}`}>
      <SolarSystemPanel card={card} info={info} formatTime={formatTime} nightWord={nightWord} />
    </div>
  );
}
