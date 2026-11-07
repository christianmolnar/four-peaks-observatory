'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { moonIllumination } from '@/planner/astro';
import { starterTargets } from '@/planner/catalog';
import { formatCsvTime, planToCsv } from '@/planner/export';
import { arcToHorizonPoints, ProfileError, parseProfile } from '@/planner/profile';
import type { BlockedArc, Profile } from '@/planner/profile';
import { altitudeTrack, compass, fitLabel, planTonight, planTrainFor, seasonLabel } from '@/planner/plan';
import {
  DEFAULT_ARC,
  DEFAULT_MIN_ALTITUDE,
  MIN_ALTITUDE_RANGE,
  PROFILE_KEY,
  checkArcFields,
  checkWholeDegrees,
  defaultDateForProfile,
  effectiveArc,
  fieldsFromArc,
  friendlyArcError,
  loadCaptured,
  loadProfile,
  sampleProfile,
  saveCaptured,
  sameFields,
  saveProfile,
  withSiteArc,
} from '@/planner/state';
import type { HorizonErrors, HorizonField, HorizonFields } from '@/planner/state';
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

/** How long a toast stays up. */
const TOAST_MS = 6000;
/** A pause this long with no keystroke ends a run of typing in Minimum altitude. */
const MIN_ALT_PAUSE_MS = 600;

const fieldsOf = (arc: BlockedArc | null): HorizonFields | null => (arc ? fieldsFromArc(arc) : null);

export default function PlannerApp({ initialDate, initialProfile }: PlannerAppProps) {
  const [profile, setProfile] = useState<Profile>(initialProfile ?? sampleProfile());
  const [notice, setNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [date, setDate] = useState<string>(initialDate ?? '');
  const [siteId, setSiteId] = useState<string>('');
  const [trainId, setTrainId] = useState<string>('');
  // The one copy of the form: what is in the boxes. Messages and the horizon the plan uses are derived from it.
  const [fields, setFields] = useState<HorizonFields | null>(() => fieldsOf((initialProfile ?? sampleProfile()).sites[0]?.blockedArc ?? null));
  const [minAltText, setMinAltText] = useState<string>(String(DEFAULT_MIN_ALTITUDE));
  // The Minimum altitude in effect when the current run of typing began. While the text is bad the plan
  // keeps this number, never a half-typed prefix. A run ends on focus, Enter, or a pause (MIN_ALT_PAUSE_MS
  // with no keystroke); only then does the anchor move to the current valid value.
  const [minAltAnchor, setMinAltAnchor] = useState<number>(DEFAULT_MIN_ALTITUDE);
  const minAltRef = useRef<number>(DEFAULT_MIN_ALTITUDE); // the value the plan uses now, for the run boundary
  const minAltTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [captured, setCaptured] = useState<ReadonlySet<string>>(new Set());
  const [season, setSeason] = useState<SeasonFilter>('all');
  const [setup, setSetup] = useState<SetupFilter>('all');
  const [onlyUsable, setOnlyUsable] = useState(true);
  const [showNoFit, setShowNoFit] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [zone, setZone] = useState<string>('');

  const endMinAltRun = () => {
    if (minAltTimer.current) clearTimeout(minAltTimer.current);
    minAltTimer.current = null;
    setMinAltAnchor(minAltRef.current);
  };
  useEffect(() => () => { if (minAltTimer.current) clearTimeout(minAltTimer.current); }, []);

  /**
   * The one place the form is set from saved data: Discard, Use sample horizon, a site change, an
   * import and a profile reset all end here. `withMinAltitude` also puts Minimum altitude back to its default.
   */
  const loadForm = (arc: BlockedArc | null, withMinAltitude: boolean) => {
    setFields(fieldsOf(arc));
    setJustSaved(false);
    if (withMinAltitude) {
      setMinAltText(String(DEFAULT_MIN_ALTITUDE));
      setMinAltAnchor(DEFAULT_MIN_ALTITUDE);
    }
  };

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
    loadForm(loaded.sites[0]?.blockedArc ?? null, true);
    if (!initialDate) {
      setDate(defaultDateForProfile(new Date(), loaded));
    }
  }, [initialDate, initialProfile]);

  // Toasts clear themselves, so none of them stays over a button.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!importError || profile.sites.length === 0 || profile.trains.length === 0) return;
    const t = setTimeout(() => setImportError(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [importError, profile]);

  const site = profile.sites.find((s) => s.id === siteId) ?? profile.sites[0];
  const train = profile.trains.find((t) => t.id === trainId) ?? profile.trains[0];
  const savedFields = site ? fieldsOf(site.blockedArc) : null;
  const dirty = site !== undefined && !sameFields(fields, savedFields);

  const checkArc = (next: BlockedArc): string | null => {
    if (!site) return 'No site.';
    try {
      withSiteArc(profile, site.id, next);
    } catch (e) {
      if (e instanceof ProfileError) return friendlyArcError(e);
      throw e;
    }
    return null;
  };

  // Everything below is derived from the text on each render; nothing is stored about it.
  const { errors, arc } = useMemo(() => {
    if (!site || fields === null) return { errors: {} as HorizonErrors, arc: null as BlockedArc | null };
    const errs = checkArcFields(fields, checkArc);
    return { errors: errs, arc: effectiveArc(fields, errs, site.blockedArc ?? DEFAULT_ARC, checkArc) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkArc is a function of site and profile
  }, [fields, site, profile]);
  // A slider follows its own box whenever the box holds a valid number, even when the arc is refused
  // (so an arrow key can step across the other end). Only a box with a message falls back to the preview.
  const sliderValues: Record<HorizonField, number> = {
    start: errors.start === undefined && fields ? Number(fields.start) : (arc?.startAz ?? 0),
    end: errors.end === undefined && fields ? Number(fields.end) : (arc?.endAz ?? 0),
    height: errors.height === undefined && fields ? Number(fields.height) : (arc?.heightDeg ?? 0),
  };
  // The plan, the list and the altitude chart use the saved arc: the draft only previews in the horizon editor.
  const savedArc = site?.blockedArc ?? null;
  const horizon = useMemo(() => (savedArc ? arcToHorizonPoints(savedArc) : null), [savedArc]);

  const minCheck = checkWholeDegrees(minAltText, MIN_ALTITUDE_RANGE.min, MIN_ALTITUDE_RANGE.max, '');
  const minAltitude = minCheck.ok ? minCheck.value : minAltAnchor;
  minAltRef.current = minAltitude;
  const minAltError = minCheck.ok ? null : `${minCheck.error} Planning with ${minAltitude} until fixed.`;

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
      if (!showNoFit && setup !== 'too-large' && e.fit === 'too-large') return false;
      if (season === 'in' && e.inSeason !== true) return false;
      if (season === 'out' && e.inSeason !== false) return false;
      if (setup === 'fits' && e.fit !== 'fits') return false;
      if (setup === 'too-large' && e.fit !== 'too-large') return false;
      if (setup === 'planets' && !e.isPlanet) return false;
      if (setup === 'deep-sky' && e.isPlanet) return false;
      return true;
    });
  }, [plan, onlyUsable, showNoFit, season, setup]);

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

  const editField = (field: HorizonField, text: string) => {
    setFields((f) => (f ? { ...f, [field]: text } : f));
    setJustSaved(false);
  };

  const saveArc = () => {
    if (!site) return;
    try {
      const next = withSiteArc(profile, site.id, fields === null ? null : { startAz: Number(fields.start), endAz: Number(fields.end), heightDeg: Number(fields.height) });
      saveProfile(window.localStorage, next);
      setProfile(next);
      setJustSaved(true);
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
    const sample = sampleProfile();
    setProfile(sample);
    loadForm(sample.sites[0]?.blockedArc ?? null, true);
    setSiteId('');
    setTrainId('');
    setImportError(null);
    setNotice('Sample profile restored.');
  };

  const toggleCaptured = (id: string) => {
    const next = new Set(captured);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      saveCaptured(window.localStorage, next);
    } catch (e) {
      setNotice(`Not saved, so the tick is lost on reload: ${(e as Error).message}`);
    }
    setCaptured(next);
  };

  const importProfile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    try {
      const next = parseProfile(await file.text());
      saveProfile(window.localStorage, next);
      setProfile(next);
      setDate(defaultDateForProfile(new Date(), next));
      loadForm(next.sites[0]?.blockedArc ?? null, true);
      setSiteId('');
      setTrainId('');
      setNotice(`Imported ${file.name}.`);
    } catch (e) {
      if (e instanceof ProfileError) setImportError(`Import rejected, ${e.message}`);
      else setImportError(`Import failed, nothing was changed: ${(e as Error).message}`);
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
          <button type="button" className={btn} onClick={resetSample}>Replace profile with sample</button>
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

      {/* Messages float at the bottom of the window, so showing one never pushes the page down. */}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-col gap-2">
        {notice && (
          <p role="status" className="pointer-events-none bg-slate-900 border border-sky-300/60 rounded px-3 py-2 text-sky-100 font-normal text-sm">
            {notice}
          </p>
        )}
        {importError && (
          <p role="alert" className="pointer-events-none bg-slate-900 border border-orange-300/60 rounded px-3 py-2 text-orange-100 font-normal text-sm">
            {importError}
          </p>
        )}
        {planResult?.error && (
          <p role="alert" className="pointer-events-none bg-slate-900 border border-orange-300/60 rounded px-3 py-2 text-orange-100 font-normal text-sm">
            Could not plan: {planResult.error}
          </p>
        )}
      </div>

      <section aria-labelledby="controls-heading" className={panel}>
        <h2 id="controls-heading" className="text-xl font-light text-white tracking-[0.15em] mb-4">TONIGHT</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-start">
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
                loadForm(profile.sites.find((x) => x.id === e.target.value)?.blockedArc ?? null, true);
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
            min={MIN_ALTITUDE_RANGE.min}
            max={MIN_ALTITUDE_RANGE.max}
            text={minAltText}
            sliderValue={minAltitude}
            onText={(t) => {
              setMinAltText(t);
              if (minAltTimer.current) clearTimeout(minAltTimer.current);
              minAltTimer.current = setTimeout(endMinAltRun, MIN_ALT_PAUSE_MS);
            }}
            onFocus={endMinAltRun}
            onEnter={endMinAltRun}
            error={minAltError}
            lines={2}
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
          {savedArc === null
            ? 'Horizon not set: only the flat minimum altitude applies.'
            : `Horizon: blocked ${savedArc.startAz}° (${compass(savedArc.startAz)}) to ${savedArc.endAz}° (${compass(savedArc.endAz)}), ${savedArc.heightDeg}° high.`}{' '}
          <a href="#horizon" className="inline-flex min-h-11 items-center rounded px-1 text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400">
            Edit horizon
          </a>
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
            <label className="flex items-center gap-2 text-white/90 font-normal text-sm pb-1">
              <input type="checkbox" checked={showNoFit} onChange={(e) => setShowNoFit(e.target.checked)} className="accent-sky-400" />
              Show targets that do not fit
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
                      <p><span className="text-white">{e.fit === 'too-large' ? 'Why it is listed:' : 'Why recommended:'}</span> {e.why}</p>
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
        fields={fields}
        errors={errors}
        preview={arc}
        sliderValues={sliderValues}
        dirty={dirty}
        saved={justSaved}
        onField={editField}
        onSave={saveArc}
        onDiscard={() => loadForm(site.blockedArc, false)}
        onUseSample={() => loadForm(sampleProfile().sites[0]?.blockedArc ?? null, true)}
        onClear={() => {
          setFields(null);
          setJustSaved(false);
        }}
        onAdd={() => {
          setFields(fieldsFromArc(DEFAULT_ARC));
          setJustSaved(false);
        }}
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
          <button type="button" className={btn} onClick={resetSample}>Replace profile with sample</button>
        </div>
        <p className="text-white/60 font-normal text-xs mt-3">
          Imports are checked field by field; a rejected file changes nothing and the error names the field.
        </p>
      </section>
    </div>
  );
}
