'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { moonIllumination } from '@/planner/astro';
import { starterTargets } from '@/planner/catalog';
import { formatCsvTime, planToCsv } from '@/planner/export';
import { arcToHorizonPoints, ProfileError, parseProfile } from '@/planner/profile';
import type { BlockedArc, Profile } from '@/planner/profile';
import { altitudeTrack, compass, fitLabel, planTonight, planTrainFor, seasonLabel } from '@/planner/plan';
import {
  PROFILE_KEY,
  defaultTonightDate,
  friendlyArcError,
  loadCaptured,
  loadProfile,
  sampleProfile,
  saveCaptured,
  saveProfile,
  withSiteArc,
} from '@/planner/state';
import AltitudeChart from './AltitudeChart';
import HorizonEditor from './HorizonEditor';
import NumberSlider from './NumberSlider';

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
const formatTime = (d: Date): string => timeFormat.format(d);

type SeasonFilter = 'all' | 'in' | 'out';
type SetupFilter = 'all' | 'fits' | 'too-large' | 'deep-sky' | 'planets';

const SETUP_LABELS: Record<SetupFilter, string> = {
  all: 'All',
  fits: 'Fits this setup',
  'too-large': 'Too large for this setup',
  'deep-sky': 'Deep sky only',
  planets: 'Planets only',
};

function download(filename: string, text: string, mime: string, bom = false): void {
  const blob = new Blob([bom ? '﻿' : '', text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface PlannerAppProps {
  /** For tests and previews: fixes the evening date (YYYY-MM-DD) instead of reading the clock. */
  initialDate?: string;
  /** For tests and previews: skips reading saved data. */
  initialProfile?: Profile;
}

export default function PlannerApp({ initialDate, initialProfile }: PlannerAppProps) {
  const [profile, setProfile] = useState<Profile>(initialProfile ?? sampleProfile());
  const [notice, setNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [date, setDate] = useState<string>(initialDate ?? '');
  const [siteId, setSiteId] = useState<string>('');
  const [trainId, setTrainId] = useState<string>('');
  const [minAltitude, setMinAltitude] = useState<number>(20);
  const [draftArc, setDraftArc] = useState<BlockedArc | null | undefined>(undefined);
  const [captured, setCaptured] = useState<ReadonlySet<string>>(new Set());
  const [season, setSeason] = useState<SeasonFilter>('all');
  const [setup, setSetup] = useState<SetupFilter>('all');
  const [onlyUsable, setOnlyUsable] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [zone, setZone] = useState<string>('');

  // Browser-only state: saved profile, captured list, the clock.
  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    try {
      setCaptured(loadCaptured(window.localStorage));
    } catch (e) {
      setNotice(`Captured list could not be read: ${(e as Error).message}`);
    }
    let loaded = initialProfile;
    if (!loaded) {
      const r = loadProfile({ getItem: (k) => window.localStorage.getItem(k) }); // the getter itself throws when storage is blocked
      loaded = r.profile;
      setProfile(r.profile);
      if (r.error) setImportError(r.error);
    }
    if (!initialDate) {
      // The site's date, from its longitude; with no site, the browser's own longitude.
      const now = new Date();
      const lon = loaded.sites[0]?.longitude ?? (-now.getTimezoneOffset() / 60) * 15;
      setDate(defaultTonightDate(now, lon));
    }
  }, [initialDate, initialProfile]);

  const site = profile.sites.find((s) => s.id === siteId) ?? profile.sites[0];
  const train = profile.trains.find((t) => t.id === trainId) ?? profile.trains[0];
  const arc: BlockedArc | null = site ? (draftArc !== undefined ? draftArc : site.blockedArc) : null;
  const dirty = site !== undefined && draftArc !== undefined && JSON.stringify(draftArc) !== JSON.stringify(site.blockedArc);
  const horizon = useMemo(() => (arc ? arcToHorizonPoints(arc) : null), [arc]);

  const planResult = useMemo(() => {
    if (!site || !train || date === '') return null;
    try {
      const result = planTonight(
        {
          site: { latitude: site.latitude, longitude: site.longitude, elevationM: site.elevationM },
          horizon,
          minAltitude,
          date,
          train: planTrainFor(profile, train),
          targets: starterTargets,
        },
        formatTime,
      );
      return { result, error: null as string | null };
    } catch (e) {
      return { result: null, error: (e as Error).message };
    }
  }, [site, train, date, horizon, minAltitude, profile]);

  const plan = planResult?.result ?? null;

  const filtered = useMemo(() => {
    if (!plan) return [];
    return plan.entries.filter((e) => {
      if (onlyUsable && e.usableMinutes <= 0) return false;
      if (season === 'in' && e.inSeason !== true) return false;
      if (season === 'out' && e.inSeason !== false) return false;
      if (setup === 'fits' && e.fit !== 'fits') return false;
      if (setup === 'too-large' && e.fit !== 'too-large') return false;
      if (setup === 'planets' && !e.isPlanet) return false;
      if (setup === 'deep-sky' && e.isPlanet) return false;
      return true;
    });
  }, [plan, onlyUsable, season, setup]);

  const selected = filtered.find((e) => e.id === selectedId) ?? filtered[0];
  const track = useMemo(() => {
    if (!plan || !selected || !site || plan.night.kind !== 'normal') return null;
    const pad = 2 * 3600000;
    return altitudeTrack(
      selected.source,
      { latitude: site.latitude, longitude: site.longitude, elevationM: site.elevationM },
      horizon,
      minAltitude,
      new Date((plan.night.start as Date).getTime() - pad),
      new Date((plan.night.end as Date).getTime() + pad),
      10,
    );
  }, [plan, selected, site, horizon, minAltitude]);

  const checkArc = (next: BlockedArc | null): string | null => {
    if (!site) return 'No site.';
    try {
      withSiteArc(profile, site.id, next);
    } catch (e) {
      if (e instanceof ProfileError) return friendlyArcError(e);
      throw e;
    }
    return null;
  };

  const saveArc = () => {
    if (!site || draftArc === undefined) return;
    try {
      const next = withSiteArc(profile, site.id, draftArc);
      saveProfile(window.localStorage, next);
      setProfile(next);
      setDraftArc(undefined);
      setNotice('Horizon saved in this browser.');
    } catch (e) {
      setNotice(`Not saved: ${(e as Error).message}`);
    }
  };

  const resetSample = () => {
    if (!window.confirm('Replace the stored profile with the sample profile?')) return;
    try {
      window.localStorage.removeItem(PROFILE_KEY);
    } catch (e) {
      setNotice(`Could not clear the stored profile: ${(e as Error).message}`);
    }
    setProfile(sampleProfile());
    setDraftArc(undefined);
    setSiteId('');
    setTrainId('');
    setImportError(null);
    setNotice('Sample profile restored.');
  };

  const toggleCaptured = (id: string) => {
    const next = new Set(captured);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCaptured(next);
    saveCaptured(window.localStorage, next);
  };

  const importProfile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    try {
      const next = parseProfile(await file.text());
      saveProfile(window.localStorage, next);
      setProfile(next);
      setDraftArc(undefined);
      setSiteId('');
      setTrainId('');
      setNotice(`Imported ${file.name}.`);
    } catch (e) {
      if (e instanceof ProfileError) setImportError(`Import rejected, ${e.message}`);
      else throw e;
    }
  };

  const exportCsv = () => {
    if (!plan) return;
    download(
      `planner-${date}.csv`,
      planToCsv(filtered, { formatTime: formatCsvTime, captured }),
      'text/csv;charset=utf-8',
      true,
    );
  };

  const field =
    'bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';
  const btn =
    'px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';
  const panel = 'bg-black/70 rounded-lg border border-white/10 p-6';

  const importControl = (
    <div>
      <label htmlFor="profile-import" className="block text-white/90 font-normal text-sm mb-1">Import profile (JSON)</label>
      <input
        id="profile-import"
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          void importProfile(e.target.files?.[0]);
          e.target.value = '';
        }}
        className="text-white/90 font-normal text-sm"
      />
    </div>
  );

  if (!site || !train) {
    return (
      <div className={panel}>
        <h1 className="text-2xl font-light text-white tracking-[0.2em]">IMAGING PLANNER</h1>
        <p className="text-white/90 font-normal mt-4">
          The profile needs at least one site and one train. Import a profile below, or reset to the sample.
        </p>
        {importError && (
          <p role="alert" className="bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm mt-4">
            {importError}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-4 mt-4">
          {importControl}
          <button type="button" className={btn} onClick={resetSample}>Reset to sample</button>
        </div>
      </div>
    );
  }

  const night = plan?.night;
  return (
    <div className="space-y-8 text-white">
      <header>
        <h1 className="text-3xl md:text-4xl font-light text-white tracking-[0.2em]">IMAGING PLANNER</h1>
        <p className="text-white/80 font-normal text-sm mt-2">
          Preview. Your profile, horizon and captured list stay in this browser; the planner does not send any of it anywhere.
        </p>
      </header>

      {notice && (
        <p role="status" className="bg-sky-400/15 border border-sky-300/40 rounded px-3 py-2 text-sky-100 font-normal text-sm">
          {notice}
        </p>
      )}
      {importError && (
        <p role="alert" className="bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
          {importError}
        </p>
      )}
      {planResult?.error && (
        <p role="alert" className="bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
          Could not plan: {planResult.error}
        </p>
      )}

      <section aria-labelledby="controls-heading" className={panel}>
        <h2 id="controls-heading" className="text-xl font-light text-white tracking-[0.15em] mb-4">TONIGHT</h2>
        <div className="grid gap-4 md:grid-cols-4 items-start">
          <div>
            <label htmlFor="plan-date" className="block text-white/90 font-normal text-sm mb-1">Evening of</label>
            <input id="plan-date" type="date" className={`${field} w-full`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="plan-site" className="block text-white/90 font-normal text-sm mb-1">Site</label>
            <select
              id="plan-site"
              className={`${field} w-full`}
              value={site.id}
              onChange={(e) => {
                setSiteId(e.target.value);
                setDraftArc(undefined);
              }}
            >
              {profile.sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="plan-train" className="block text-white/90 font-normal text-sm mb-1">Train</label>
            <select id="plan-train" className={`${field} w-full`} value={train.id} onChange={(e) => setTrainId(e.target.value)}>
              {profile.trains.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.kind === 'smart' ? ' (smart scope)' : ''}</option>
              ))}
            </select>
          </div>
          <NumberSlider
            id="min-alt"
            label="Minimum altitude"
            unit="deg"
            min={0}
            max={89}
            step={1}
            value={minAltitude}
            onCommit={setMinAltitude}
          />
        </div>
        <p className="text-white/80 font-normal text-sm mt-2" data-testid="night-summary">
          {night === undefined
            ? 'Loading the date…'
            : night.kind === 'normal'
              ? `Astronomical night ${formatTime(night.start as Date)} to ${formatTime(night.end as Date)} (${(((night.end as Date).getTime() - (night.start as Date).getTime()) / 3600000).toFixed(1)} h), Moon ${(moonIllumination(new Date(((night.start as Date).getTime() + (night.end as Date).getTime()) / 2)) * 100).toFixed(0)}% lit at mid-night. `
              : night.kind === 'none'
                ? 'The Sun does not get below -18 deg at this site on this date: no astronomical night. '
                : 'The Sun stays below -18 deg for the whole day, or the night ends in polar night: no usable night. '}
          {zone && `Times are in your browser's time zone (${zone}).`}
        </p>
        <p className="text-white/80 font-normal text-sm mt-1" data-testid="horizon-summary">
          {arc === null
            ? 'Horizon not set: only the flat minimum altitude applies.'
            : `Horizon: blocked ${arc.startAz}° (${compass(arc.startAz)}) to ${arc.endAz}° (${compass(arc.endAz)}), ${arc.heightDeg}° high.`}
        </p>
      </section>

      <section aria-labelledby="list-heading" className={panel}>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <h2 id="list-heading" className="text-xl font-light text-white tracking-[0.15em]">TARGETS</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="f-season" className="block text-white/90 font-normal text-sm mb-1">Season</label>
              <select id="f-season" className={field} value={season} onChange={(e) => setSeason(e.target.value as SeasonFilter)}>
                <option value="all">All</option>
                <option value="in">In season tonight</option>
                <option value="out">Out of season</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-setup" className="block text-white/90 font-normal text-sm mb-1">Setup</label>
              <select id="f-setup" className={field} value={setup} onChange={(e) => setSetup(e.target.value as SetupFilter)}>
                {(Object.keys(SETUP_LABELS) as SetupFilter[]).map((k) => (
                  <option key={k} value={k}>{SETUP_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-white/90 font-normal text-sm pb-1">
              <input type="checkbox" checked={onlyUsable} onChange={(e) => setOnlyUsable(e.target.checked)} className="accent-sky-400" />
              Only targets usable tonight
            </label>
            <button type="button" className={btn} onClick={exportCsv} disabled={!plan || filtered.length === 0}>
              Export CSV
            </button>
          </div>
        </div>

        {plan && plan.night.kind !== 'normal' ? (
          <p className="text-white/90 font-normal">No astronomical night, so there is nothing to rank.</p>
        ) : filtered.length === 0 ? (
          <p className="text-white/90 font-normal">No targets match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm font-normal text-white/90" data-testid="target-table">
              <caption className="sr-only">Targets ranked for tonight</caption>
              <thead className="text-white">
                <tr className="border-b border-white/20">
                  <th scope="col" className="py-2 pr-3">Captured</th>
                  <th scope="col" className="py-2 pr-3">#</th>
                  <th scope="col" className="py-2 pr-3">Target</th>
                  <th scope="col" className="py-2 pr-3">Season</th>
                  <th scope="col" className="py-2 pr-3">Setup</th>
                  <th scope="col" className="py-2 pr-3">Peak</th>
                  <th scope="col" className="py-2 pr-3">Usable window</th>
                  <th scope="col" className="py-2 pr-3">Moon</th>
                  <th scope="col" className="py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => (
                  <Fragment key={e.id}>
                  <tr className={`align-top ${selected?.id === e.id ? 'bg-sky-400/10' : ''}`}>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        aria-label={`Captured: ${e.name}`}
                        checked={captured.has(e.id)}
                        onChange={() => toggleCaptured(e.id)}
                        className="accent-sky-400"
                      />
                    </td>
                    <td className="py-2 pr-3">{i + 1}</td>
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <button
                        type="button"
                        onClick={() => setSelectedId(e.id)}
                        aria-pressed={selected?.id === e.id}
                        className="underline decoration-dotted text-left text-white focus:outline-none focus:ring-2 focus:ring-sky-400 rounded"
                      >
                        {e.name}
                      </button>
                      {e.isPlanet && <span className="ml-2 rounded bg-yellow-300/20 text-yellow-100 text-xs px-1.5 py-0.5">planet</span>}
                    </th>
                    <td className="py-2 pr-3 whitespace-nowrap">{e.isPlanet ? 'n/a' : `${seasonLabel(e.seasonMonths)}${e.inSeason ? ' (now)' : ''}`}</td>
                    <td className="py-2 pr-3">{fitLabel(e)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{e.peakAltitude.toFixed(0)}° {compass(e.peakAzimuth)} at {formatTime(e.peakTime)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {e.windows.length === 0
                        ? 'none'
                        : e.windows.map((w) => `${formatTime(w.start)} to ${formatTime(w.end)}`).join(', ')}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{(e.moonIllumination * 100).toFixed(0)}% lit, {e.moonSeparation.toFixed(0)}° away{e.moonUp ? '' : ' (down)'}</td>
                    <td className="py-2">{e.score.total}</td>
                  </tr>
                  <tr className={`border-b border-white/10 ${selected?.id === e.id ? 'bg-sky-400/10' : ''}`}>
                    <td colSpan={9} className="pb-3 pl-8 pr-3 text-white/80">
                      <p><span className="text-white">Why recommended:</span> {e.why}</p>
                      <p className="text-xs text-white/60 mt-1">
                        Score parts: usable {e.score.usable.toFixed(0)}, altitude {e.score.altitude.toFixed(0)}, season {e.score.season}, Moon {e.score.moon.toFixed(0)}, fit {e.score.fit}. Fit: {e.fitDetail}.
                      </p>
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-white/60 font-normal text-xs mt-3">
          Score: usable hours up to 50, peak altitude up to 30, in season 10, Moon up to -20, does not fit -25. Each row lists its score parts and fit detail under it.
        </p>
      </section>

      {selected && track && plan && (
        <section aria-labelledby="chart-heading" className={panel}>
          <h2 id="chart-heading" className="text-xl font-light text-white tracking-[0.15em] mb-4">
            ALTITUDE: {selected.name.toUpperCase()}
          </h2>
          <AltitudeChart
            entry={selected}
            night={plan.night}
            track={track}
            horizonSet={plan.horizonSet}
            minAltitude={minAltitude}
            formatTime={formatTime}
          />
        </section>
      )}

      <HorizonEditor
        siteName={site.name}
        arc={arc}
        validate={checkArc}
        onChange={setDraftArc}
        dirty={dirty}
        onSave={saveArc}
        onDiscard={() => setDraftArc(undefined)}
        onResetSample={resetSample}
      />

      <section aria-labelledby="profile-heading" className={panel}>
        <h2 id="profile-heading" className="text-xl font-light text-white tracking-[0.15em] mb-4">PROFILE</h2>
        <div className="flex flex-wrap items-end gap-4">
          <button
            type="button"
            className={btn}
            onClick={() => download('fpo-planner-profile.json', `${JSON.stringify(profile, null, 2)}\n`, 'application/json')}
          >
            Export profile (JSON)
          </button>
          {importControl}
        </div>
        <p className="text-white/60 font-normal text-xs mt-3">
          Imports are checked field by field; a rejected file changes nothing and the error names the field.
        </p>
      </section>
    </div>
  );
}
