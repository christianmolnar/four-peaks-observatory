'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { moonIllumination } from '@/planner/astro';
import { loadCatalog } from '@/planner/catalog/loader';
import type { CatalogIndex, SearchTarget } from '@/planner/catalog/search';
import { makeCsvTime, planToCsv } from '@/planner/export';
import { arcsConflict, arcToHorizonPoints, ProfileError, resolveTrain } from '@/planner/profile';
import type { BlockedArc, Profile } from '@/planner/profile';
import { DEFAULT_BORTLE, exposureTargetFrom } from '@/planner/exposure';
import { PLANETS, altitudeTrack, compass, fitLabel, planTrainFor, seasonLabel, tonightsNight } from '@/planner/plan';
import type { PlanEntry, PlanTrain } from '@/planner/plan';
import type { RankResult } from '@/planner/plan/rank';
import { planetIdOf } from '@/planner/itinerary/resolve';
import { rankTonightAsync } from '@/planner/tonight';
import type { TonightQuery } from '@/planner/tonight';
import {
  DEFAULT_MIN_ALTITUDE,
  MIN_ALTITUDE_RANGE,
  MAX_MY_PLAN,
  MY_PLAN_KEY,
  PROFILE_KEY,
  SELECTION_KEY,
  checkZoneFields,
  checkWholeDegrees,
  defaultDateForProfile,
  defaultTonightDate,
  effectiveArc,
  fieldsFromArc,
  newZoneFields,
  friendlyArcError,
  loadCaptured,
  loadMyPlan,
  loadProfile,
  loadSelection,
  sampleProfile,
  saveCaptured,
  saveMyPlan,
  sameFields,
  saveProfile,
  saveSelection,
  withSiteArcs,
  withTrainFilter,
} from '@/planner/state';
import { assertImportSize, profileFromText } from '@/planner/state/edit';
import type { HorizonErrors, HorizonField, HorizonFields } from '@/planner/state';
import AltitudeChart from './AltitudeChart';
import ExposurePanel from './ExposurePanel';
import HorizonEditor from './HorizonEditor';
import ItinerarySection from './ItinerarySection';
import NumberSlider from './NumberSlider';
import PlanetsSection from './PlanetsSection';
import PrintSheet from './PrintSheet';
import { download } from './download';
import type { ItineraryReport } from './ItinerarySection';
import WrapSelect from './WrapSelect';
import ProfileEditor from './ProfileEditor';
import MyPlan from './MyPlan';
import type { MyPlanRow } from './MyPlan';
import TargetSearch from './TargetSearch';
import { createNightScorer } from './nightScorer';
import { designationOf, nightStatus, sizeText, typeLabel } from './catalogText';
import { useCatalog } from './useCatalog';
import { useTonightList } from './useTonightList';

/** 24 h clock time in `timeZone` (IANA name), or in the browser's zone when none is given. */
const clockIn = (timeZone?: string): ((d: Date) => string) => {
  const f = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
  return (d) => f.format(d);
};

type TypeFilter = 'all' | 'deep-sky' | 'planets';

const TYPE_LABELS: Record<TypeFilter, string> = {
  all: 'All',
  'deep-sky': 'Deep-sky',
  planets: 'Planets',
};

/** The picked day as the date input shows it: the browser's own locale. */
const dateLabel = (iso: string) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

type RankedEntry = PlanEntry;

/** Tonight's list holds at most this many targets. */
const LIST_LIMIT = 100;

/** The text of one ranked target, shared by the table row (md and up) and the card (below md). */
function targetText(e: RankedEntry, formatTime: (d: Date) => string) {
  return {
    // Only the curated targets carry a season; a catalog object has none, and the page says so instead of guessing.
    season: e.isPlanet ? 'n/a' : e.seasonMonths.length === 0 ? 'Not listed' : `${seasonLabel(e.seasonMonths)}${e.inSeason ? ' (now)' : ''}`,
    setup: fitLabel(e),
    peak: `${e.peakAltitude.toFixed(0)}° ${compass(e.peakAzimuth)} at ${formatTime(e.peakTime)}`,
    windows: e.windows.map((w) => `${formatTime(w.start)} to ${formatTime(w.end)}`),
    moon: `${(e.moonIllumination * 100).toFixed(0)}% lit, ${e.moonSeparation.toFixed(0)}° away${e.moonUp ? '' : ' (down)'}`,
    whyLabel: e.fit === 'too-large' ? 'Why it is listed' : 'Why recommended',
    parts: `Score parts: usable ${e.score.usable.toFixed(0)}, altitude ${e.score.altitude.toFixed(0)}, season ${e.score.season}, Moon ${e.score.moon.toFixed(0)}, fit ${e.score.fit}.${e.fitDetail ? ` ${e.fitDetail}.` : ''}`,
  };
}

/** Usable windows as one unbreakable range each: a long list wraps between ranges, never inside one. */
function Windows({ ranges }: { ranges: string[] }) {
  if (ranges.length === 0) return <>none</>;
  return (
    <>
      {ranges.map((r, i) => (
        <Fragment key={i}>
          <span className="whitespace-nowrap">{i < ranges.length - 1 ? `${r},` : r}</span>
          {i < ranges.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </>
  );
}

/** The first sentence of a reason, cut at a word and ended with an ellipsis only if it runs past `max` characters. */
export function shortWhy(why: string, max = 80): string {
  const first = why.match(/^.*?\.(?=\s|$)/)?.[0] ?? why;
  if (first.length <= max) return first;
  let cut = first.slice(0, max).replace(/\s+\S*$/, '');
  // Never end on a number: the unit that follows it travels with it ("-10 deg in the E").
  while (/(^|\s)-?\d+(\.\d+)?$/.test(cut)) cut = cut.replace(/\s*\S+$/, '');
  cut = cut.replace(/[,;:\s]+$/, '');
  return `${cut}…`;
}

/** "Why recommended" toggle: closed shows one short line, open shows the full reason and the score parts. */
function WhyToggle({ e, t, open, onToggle, idPrefix }: { e: RankedEntry; t: ReturnType<typeof targetText>; open: boolean; onToggle: () => void; idPrefix: string }) {
  const id = `${idPrefix}-${e.id}`;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex min-h-11 items-center gap-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-sky-400 rounded"
      >
        <span aria-hidden="true" className="inline-block w-3 text-white/70">{open ? '▾' : '▸'}</span>
        <span className="underline decoration-dotted">{t.whyLabel}</span>
      </button>
      <div id={id} className="text-white/80 break-words">
        {open ? (
          <>
            <p>{e.why}</p>
            <p className="text-xs text-white/60 mt-1">{t.parts}</p>
          </>
        ) : (
          <p>{shortWhy(e.why)}</p>
        )}
      </div>
    </div>
  );
}

const names = (list: readonly { name: string }[]): string => (list.length < 2 ? list.map((h) => h.name).join('') : `${list.slice(0, -1).map((h) => h.name).join(', ')} and ${list[list.length - 1].name}`);

/**
 * What the size screen left out of the list, said with names instead of a silent disappearance. Too large can be shown
 * (the "show targets that do not fit" switch); too small is reported only.
 */
function HiddenNote({ counts, hidden, showNoFit, onShow }: { counts: RankResult['counts']; hidden: RankResult['hidden']; showNoFit: boolean; onShow: () => void }) {
  const large = showNoFit ? 0 : counts.tooLarge;
  if (large === 0 && counts.tooSmall === 0) return null;
  const more = (n: number, shown: number) => (n > shown ? ` and ${n - shown} more` : '');
  return (
    <div className="mb-3 space-y-1 text-white/80 font-normal text-sm" data-testid="hidden-note">
      {large > 0 && (
        <p>
          {names(hidden.tooLarge)}
          {more(large, hidden.tooLarge.length)} {large === 1 ? 'is' : 'are'} larger than this frame ({large} hidden):{' '}
          <button type="button" onClick={onShow} className="min-h-11 rounded px-1 text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400">
            show anyway
          </button>
        </p>
      )}
      {counts.tooSmall > 0 && (
        <p>
          {names(hidden.tooSmall)}
          {more(counts.tooSmall, hidden.tooSmall.length)} {counts.tooSmall === 1 ? 'is' : 'are'} too small for this frame ({counts.tooSmall} hidden).
        </p>
      )}
    </div>
  );
}

export interface PlannerAppProps {
  /** For tests and previews: fixes the evening date (YYYY-MM-DD) instead of reading the clock. */
  initialDate?: string;
  /** For tests and previews: skips reading saved data. */
  initialProfile?: Profile;
  /** Tonight's ranking over the catalog; defaults to the app-wide worker-backed one. A test stands in a fake. */
  rank?: (query: TonightQuery) => Promise<RankResult>;
  /** The bundled catalog; defaults to the app-wide lazy loader. A test stands in a fake fetch behind its own loader. */
  loadCatalogIndex?: () => Promise<CatalogIndex>;
}

/** How long a toast stays up. */
const TOAST_MS = 6000;
/** A pause this long with no keystroke ends a run of typing in Minimum altitude. */
const MIN_ALT_PAUSE_MS = 600;

/** A site with no blocked zones; one array so memo keys stay stable. */
const NO_ZONES: readonly BlockedArc[] = [];

const fieldsOf = (arcs: readonly BlockedArc[]): HorizonFields[] => arcs.map(fieldsFromArc);

export default function PlannerApp({ initialDate, initialProfile, rank = rankTonightAsync, loadCatalogIndex = loadCatalog }: PlannerAppProps) {
  const [profile, setProfile] = useState<Profile>(initialProfile ?? sampleProfile());
  const [notice, setNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [date, setDate] = useState<string>(initialDate ?? '');
  const [siteId, setSiteId] = useState<string>('');
  const [trainId, setTrainId] = useState<string>('');
  // The one copy of the form: what is in the boxes. Messages and the horizon the plan uses are derived from it.
  const [fields, setFields] = useState<HorizonFields[]>(() => fieldsOf((initialProfile ?? sampleProfile()).sites[0]?.blockedArcs ?? []));
  // Each row's own last saved (or loaded) zone, in the same order as `fields`; null for a row added since. A bad box falls back to its own row's base only.
  const [bases, setBases] = useState<(BlockedArc | null)[]>(() => [...((initialProfile ?? sampleProfile()).sites[0]?.blockedArcs ?? [])]);
  const [minAltText, setMinAltText] = useState<string>(String(DEFAULT_MIN_ALTITUDE));
  // The Minimum altitude in effect when the current run of typing began. While the text is bad the plan
  // keeps this number, never a half-typed prefix. A run ends on focus, Enter, or a pause (MIN_ALT_PAUSE_MS
  // with no keystroke); only then does the anchor move to the current valid value.
  const [minAltAnchor, setMinAltAnchor] = useState<number>(DEFAULT_MIN_ALTITUDE);
  const minAltRef = useRef<number>(DEFAULT_MIN_ALTITUDE); // the value the plan uses now, for the run boundary
  const minAltTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [captured, setCaptured] = useState<ReadonlySet<string>>(new Set());
  // Targets whose "Why recommended" is open; every target starts closed and a reload resets it.
  const [whyOpen, setWhyOpen] = useState<ReadonlySet<string>>(new Set());
  const toggleWhy = (id: string) =>
    setWhyOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const [type, setType] = useState<TypeFilter>('all');
  const [showNoFit, setShowNoFit] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  // My plan: catalog ids in the user's priority order; remembered in this browser like the site and train choice.
  const [planIds, setPlanIds] = useState<readonly string[]>([]);
  const [zone, setZone] = useState<string>('');
  // The print sheet is built only while the browser is printing (Print button or Ctrl+P), so it costs the page nothing otherwise.
  const [printing, setPrinting] = useState(false);
  // The itinerary section leaves its current plan here; the print sheet reads it when printing starts (no re-render on every change).
  const itineraryReport = useRef<ItineraryReport | null>(null);

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
  const loadForm = (arcs: readonly BlockedArc[], withMinAltitude: boolean) => {
    setFields(fieldsOf(arcs));
    setBases([...arcs]);
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
      setNotice((e as Error).message);
    }
    try {
      setPlanIds(loadMyPlan(window.localStorage));
    } catch (e) {
      setNotice((e as Error).message);
    }
    let loaded = initialProfile;
    if (!loaded) {
      const r = loadProfile({ getItem: (k) => window.localStorage.getItem(k) }); // the getter itself throws when storage is blocked
      loaded = r.profile;
      setProfile(r.profile);
      if (r.error) setImportError(r.error);
    }
    // The site and train last chosen; one that is gone from the profile falls back to the first, as before.
    let remembered = null;
    try {
      remembered = loadSelection(window.localStorage);
    } catch (e) {
      setNotice((e as Error).message);
    }
    const home = loaded.sites.find((s) => s.id === remembered?.siteId) ?? loaded.sites[0];
    if (home && home.id === remembered?.siteId) setSiteId(home.id);
    if (loaded.trains.some((t) => t.id === remembered?.trainId)) setTrainId(remembered!.trainId);
    loadForm(home?.blockedArcs ?? [], true);
    if (!initialDate) {
      setDate(defaultDateForProfile(new Date(), home ? { ...loaded, sites: [home] } : loaded));
    }
  }, [initialDate, initialProfile]);

  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

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

  /** Stores an edited profile. The edit has been validated; a storage failure is said out loud and the edit stays on screen. */
  const applyProfile = useCallback((next: Profile) => {
    setProfile(next);
    try {
      saveProfile(window.localStorage, next);
    } catch (e) {
      setNotice(`Edit not saved, so it is lost on reload: ${(e as Error).message}`);
    }
  }, []);

  const site = profile.sites.find((s) => s.id === siteId) ?? profile.sites[0];
  const train = profile.trains.find((t) => t.id === trainId) ?? profile.trains[0];
  // The site as the astro functions take it, stable between renders so the sections below can memoise on it.
  const siteLat = site?.latitude;
  const siteLon = site?.longitude;
  const siteElev = site?.elevationM;
  const siteZone = site?.timeZone;
  const formatTime = useMemo(() => clockIn(siteZone), [siteZone]);
  // The evening "tonight" means at this site; any other picked date is "that night".
  const [, setClockTick] = useState(0); // bumped when the site's date moves on, to re-render with a fresh read of the clock
  const tonightDate = siteLon !== undefined ? defaultTonightDate(new Date(), siteLon, siteZone) : '';
  // A page left open: once a minute and when the tab comes back, re-read the clock; only a new site date re-renders.
  useEffect(() => {
    if (siteLon === undefined) return undefined;
    const check = () => {
      if (defaultTonightDate(new Date(), siteLon, siteZone) !== tonightDate) setClockTick((n) => n + 1);
    };
    const id = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [siteLon, siteZone, tonightDate]);
  const astroSite = useMemo(
    () => (siteLat !== undefined && siteLon !== undefined ? { latitude: siteLat, longitude: siteLon, elevationM: siteElev } : null),
    [siteLat, siteLon, siteElev],
  );
  const savedArcs = site?.blockedArcs ?? NO_ZONES;
  const dirty = site !== undefined && !sameFields(fields, fieldsOf(savedArcs));

  const checkArc = (next: BlockedArc): string | null => {
    if (!site) return 'No site.';
    try {
      withSiteArcs(profile, site.id, [next]); // this zone alone; overlaps between rows are checked by checkZoneFields
    } catch (e) {
      if (e instanceof ProfileError) return friendlyArcError(e);
      throw e;
    }
    return null;
  };

  // Everything below is derived from the text on each render; nothing is stored about it.
  const { errors, arcs } = useMemo(() => {
    if (!site) return { errors: [] as HorizonErrors[], arcs: [] as (BlockedArc | null)[] };
    const errs = checkZoneFields(fields, checkArc);
    // A row that falls back to its saved zone can clash with a row typed over it; the clash is not drawn.
    const shown: BlockedArc[] = [];
    const arcs = fields.map((f, i) => {
      const a = effectiveArc(f, errs[i], bases[i] ?? null, checkArc);
      if (a === null || shown.some((o) => arcsConflict(a, o))) return null;
      shown.push(a);
      return a;
    });
    return { errors: errs, arcs };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkArc is a function of site and profile
  }, [fields, bases, site, profile]);
  // A slider follows its own box whenever the box holds a valid number, even when the zone is refused
  // (so an arrow key can step across the other end). Only a box with a message falls back to the preview.
  const sliderValues: Record<HorizonField, number>[] = fields.map((f, i) => ({
    start: errors[i].start === undefined ? Number(f.start) : (arcs[i]?.startAz ?? 0),
    end: errors[i].end === undefined ? Number(f.end) : (arcs[i]?.endAz ?? 0),
    height: errors[i].height === undefined ? Number(f.height) : (arcs[i]?.heightDeg ?? 0),
  }));
  // The plan, the list and the altitude chart use the saved zones: the draft only previews in the horizon editor.
  // Keyed on the zones' numbers, not the objects: saving the profile for another reason (a filter) makes new objects.
  const savedKey = JSON.stringify(savedArcs);
  const horizon = useMemo(
    () => (savedArcs.length > 0 ? arcToHorizonPoints(savedArcs) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedKey is savedArcs' content
    [savedKey],
  );

  const minCheck = checkWholeDegrees(minAltText, MIN_ALTITUDE_RANGE.min, MIN_ALTITUDE_RANGE.max, '');
  const minAltitude = minCheck.ok ? minCheck.value : minAltAnchor;
  minAltRef.current = minAltitude;
  const minAltError = minCheck.ok ? null : `${minCheck.error} Planning with ${minAltitude} until fixed.`;

  // The night is cheap and needed at once (the planets, the itinerary, the labels); the ranking over the catalog is not, so it runs off the main thread.
  const nightInfo = useMemo(() => {
    if (siteLat === undefined || siteLon === undefined || date === '') return { night: null, error: null as string | null };
    try {
      return { night: tonightsNight({ latitude: siteLat, longitude: siteLon, elevationM: siteElev }, date, siteZone), error: null as string | null };
    } catch (e) {
      return { night: null, error: (e as Error).message };
    }
  }, [siteLat, siteLon, siteElev, siteZone, date]);
  const stableNight = nightInfo.night;
  const hasNight = stableNight?.kind === 'normal';

  // The train as the plan sees it, kept as the same object while its numbers do not change: a filter pick or a Bortle edit makes a new
  // profile but not a new train, and must not send the whole catalog through the ranking again.
  const planTrainMemo = useRef<{ key: string; train: PlanTrain } | null>(null);
  const trainPlan = useMemo((): { train: PlanTrain | null; error: string | null } => {
    if (!train) return { train: null, error: null };
    try {
      const next = planTrainFor(profile, train);
      const key = JSON.stringify(next);
      if (planTrainMemo.current?.key !== key) planTrainMemo.current = { key, train: next };
      return { train: planTrainMemo.current.train, error: null };
    } catch (e) {
      return { train: null, error: (e as Error).message };
    }
  }, [profile, train]);

  const planTrain = trainPlan.train;
  const trainError = trainPlan.error;
  // What the night is planned against: everything the ranking and the single-target scoring share, or why it cannot be built.
  const planning = useMemo(() => {
    if (siteLat === undefined || siteLon === undefined || date === '' || nightInfo.error !== null) return { base: null, error: nightInfo.error };
    if (planTrain === null) return { base: null, error: trainError };
    return {
      base: {
        site: { latitude: siteLat, longitude: siteLon, elevationM: siteElev },
        horizon,
        minAltitude,
        date,
        timeZone: siteZone,
        train: planTrain,
      },
      error: null as string | null,
    };
  }, [siteLat, siteLon, siteElev, siteZone, date, horizon, minAltitude, planTrain, trainError, nightInfo.error]);
  const planError = planning.error;
  const rankQuery = useMemo<TonightQuery | null>(
    () => (planning.base !== null && hasNight ? { ...planning.base, includeTooLarge: showNoFit, limit: LIST_LIMIT } : null),
    [planning.base, hasNight, showNoFit],
  );
  const scorer = useMemo(() => (planning.base !== null && hasNight ? createNightScorer(planning.base) : null), [planning.base, hasNight]);
  const { state: tonight, retry: retryTonight } = useTonightList(rank, rankQuery);
  const { state: catalog, retry: retryCatalog } = useCatalog(loadCatalogIndex);
  const catalogById = useMemo(() => (catalog.status === 'ready' ? new Map(catalog.index.targets.map((t) => [t.id, t])) : null), [catalog]);

  const ranked = useMemo(() => (tonight.status === 'ready' ? tonight.result : null), [tonight]);
  const filtered = useMemo(() => {
    if (!ranked) return [];
    return ranked.entries.filter((e) => {
      if (type === 'planets' && !e.isPlanet) return false;
      if (type === 'deep-sky' && e.isPlanet) return false;
      return true;
    });
  }, [ranked, type]);
  const placeOf = useMemo(() => new Map((ranked?.entries ?? []).map((e, i) => [e.id, i + 1])), [ranked]);

  const isTonight = date === '' || date === tonightDate;
  const nightWord = isTonight ? 'tonight' : `that night (${dateLabel(date)})`;

  // My plan resolved for the night: a catalog target or a planet, scored by the same single-target path as the search.
  const planItems = useMemo(
    () =>
      planIds.map((id) => {
        const target = catalogById?.get(id);
        const body = PLANETS.find((b) => planetIdOf(b) === id);
        const entry = body !== undefined ? (scorer?.planet(body) ?? null) : target !== undefined ? (scorer?.target(target) ?? null) : null;
        return { id, target, body, entry };
      }),
    [planIds, catalogById, scorer],
  );

  const planIdSet = useMemo(() => new Set(planIds), [planIds]);

  const selected = filtered.find((e) => e.id === selectedId) ?? filtered[0];
  const track = useMemo(() => {
    if (!stableNight || stableNight.kind !== 'normal' || !selected || !site) return null;
    const pad = 2 * 3600000;
    return altitudeTrack(
      selected.source,
      { latitude: site.latitude, longitude: site.longitude, elevationM: site.elevationM },
      horizon,
      minAltitude,
      new Date((stableNight.start as Date).getTime() - pad),
      new Date((stableNight.end as Date).getTime() + pad),
      10,
    );
  }, [stableNight, selected, site, horizon, minAltitude]);

  // What the Exposure panel needs from the train: optics numbers, the camera record and the chosen filter.
  const trainInfo = useMemo(() => {
    if (!train || train.kind !== 'optical') return { optics: null, camera: null, filter: null };
    try {
      const r = resolveTrain(profile, train);
      return { optics: planTrainFor(profile, train).optics, camera: r.cameraSpec ?? null, filter: r.filter ?? null };
    } catch {
      return { optics: null, camera: null, filter: null }; // the plan already reports an unresolved train
    }
  }, [profile, train]);
  // A catalog entry has no curated flags (brightCore): the exposure panel treats the absence as no, not as a value.
  const selectedTarget = selected ? catalogById?.get(selected.id) : undefined;

  /** Remembers the site and train chosen at the top, so a reload opens on them. */
  const rememberSelection = (nextSiteId: string, nextTrainId: string) => {
    try {
      saveSelection(window.localStorage, { siteId: nextSiteId, trainId: nextTrainId });
    } catch (e) {
      setNotice(`Site and train choice not saved, so it is lost on reload: ${(e as Error).message}`);
    }
  };

  const chooseFilter = (filterId: string) => {
    if (!train) return;
    try {
      const next = withTrainFilter(profile, train.id, filterId === '' ? null : filterId);
      setProfile(next);
      try {
        saveProfile(window.localStorage, next);
      } catch (e) {
        setNotice(`Filter choice not saved, so it is lost on reload: ${(e as Error).message}`);
      }
    } catch (e) {
      setNotice(`Filter not changed: ${(e as Error).message}`);
    }
  };

  const editField = (zone: number, field: HorizonField, text: string) => {
    setFields((f) => f.map((z, i) => (i === zone ? { ...z, [field]: text } : z)));
    setJustSaved(false);
  };

  const saveArc = () => {
    if (!site) return;
    try {
      const arcs = fields.map((z) => ({ startAz: Number(z.start), endAz: Number(z.end), heightDeg: Number(z.height) }));
      const next = withSiteArcs(profile, site.id, arcs);
      saveProfile(window.localStorage, next);
      setProfile(next);
      setBases(arcs);
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
    try {
      window.localStorage.removeItem(SELECTION_KEY);
    } catch (e) {
      setNotice(`Could not clear the stored site and train choice: ${(e as Error).message}`);
    }
    try {
      window.localStorage.removeItem(MY_PLAN_KEY);
    } catch (e) {
      setNotice(`Could not clear the stored plan: ${(e as Error).message}`);
    }
    setPlanIds([]);
    const sample = sampleProfile();
    setProfile(sample);
    loadForm(sample.sites[0]?.blockedArcs ?? [], true);
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

  const commitPlan = (next: readonly string[]) => {
    setPlanIds(next);
    try {
      saveMyPlan(window.localStorage, next);
    } catch (e) {
      setNotice(`Plan not saved, so it is lost on reload: ${(e as Error).message}`);
    }
  };
  const addToPlan = (id: string) => {
    if (planIds.includes(id)) return;
    if (planIds.length >= MAX_MY_PLAN) {
      setNotice(`My plan holds at most ${MAX_MY_PLAN} targets. Remove one to add another.`);
      return;
    }
    commitPlan([...planIds, id]);
  };
  const movePlan = (id: string, direction: 'up' | 'down') => {
    const i = planIds.indexOf(id);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= planIds.length) return;
    const next = [...planIds];
    [next[i], next[j]] = [next[j], next[i]];
    commitPlan(next);
  };
  const removeFromPlan = (id: string) => commitPlan(planIds.filter((x) => x !== id));

  const importProfile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    let next: Profile;
    try {
      assertImportSize(file.size);
      next = profileFromText(await file.text());
    } catch (e) {
      setImportError(`Import rejected, nothing was changed. ${(e as Error).message}`);
      return;
    }
    setProfile(next);
    setPlanIds([]);
    setDate(defaultDateForProfile(new Date(), next));
    loadForm(next.sites[0]?.blockedArcs ?? [], true);
    setSiteId('');
    setTrainId('');
    try {
      window.localStorage.removeItem(SELECTION_KEY); // the old ids belong to the old profile
      window.localStorage.removeItem(MY_PLAN_KEY);
      saveProfile(window.localStorage, next);
      setNotice(`Imported ${file.name}.`);
    } catch (e) {
      setNotice(`Imported ${file.name}. Not saved, so it is lost on reload: ${(e as Error).message}`);
    }
  };

  const exportCsv = () => {
    if (ranked === null) return;
    download(
      `planner-${date}.csv`,
      planToCsv(filtered, { formatTime: makeCsvTime(siteZone), captured }),
      'text/csv;charset=utf-8',
      true,
    );
  };

  const planRows: MyPlanRow[] = planItems.map(({ id, target, body, entry }) => {
    const name = body ?? target?.displayName ?? target?.name ?? id;
    const detail =
      body !== undefined
        ? 'Planet'
        : target !== undefined
          ? [designationOf(target.id), typeLabel(target.type), sizeText(target.sizeArcmin)].filter((x) => x !== '').join(' · ')
          : catalog.status === 'loading'
            ? 'Loading the catalog…'
            : 'Not in the bundled catalog.';
    const status = entry !== null ? nightStatus(entry, nightWord, formatTime) : scorer === null && stableNight ? 'No astronomical night on this date.' : '';
    return { id, name, detail, status };
  });
  // What the itinerary may add: the plan's targets that resolved, with their clear time on the night.
  const planOptions = planItems.flatMap(({ id, target, body, entry }) =>
    body === undefined && target === undefined
      ? []
      : [{ id, name: body ?? target?.displayName ?? target?.name ?? id, isPlanet: body !== undefined, usableMinutes: entry?.usableMinutes ?? 0 }],
  );

  const field =
    'bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';
  const btn =
    'px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';
  const panel = 'bg-black/70 rounded-lg border border-white/10 p-4 sm:p-6';
  const btn44 = `${btn} min-h-11`;
  // The target is named by the description (its own name button), so the button's name stays "Add to my plan" and names are not repeated in a list of buttons.
  const planButton = (e: RankedEntry, prefix: string) =>
    planIds.includes(e.id) ? (
      <span className="inline-flex min-h-11 items-center text-white/70 text-sm">In my plan</span>
    ) : (
      <button type="button" aria-describedby={`${prefix}-name-${e.id}`} onClick={() => addToPlan(e.id)} className={btn44}>
        Add to my plan
      </button>
    );

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

  const night = stableNight ?? undefined;
  const bortle = site.bortle ?? DEFAULT_BORTLE;
  const zoneName = siteZone ?? zone;
  const zoneText = zoneName ? `Times are in ${siteZone ? "the site's" : "your browser's"} time zone (${zoneName}).` : '';
  const horizonText =
    savedArcs.length === 0
      ? 'Horizon not set: only the flat minimum altitude applies.'
      : `Horizon: ${savedArcs.map((a) => `blocked ${a.startAz}° (${compass(a.startAz)}) to ${a.endAz}° (${compass(a.endAz)}), ${a.heightDeg}° high`).join('; ')}.`;
  const nightText =
    night === undefined
      ? 'Loading the date…'
      : night.kind === 'normal'
        ? `Astronomical night ${formatTime(night.start as Date)} to ${formatTime(night.end as Date)} (${(((night.end as Date).getTime() - (night.start as Date).getTime()) / 3600000).toFixed(1)} h), Moon ${(moonIllumination(new Date(((night.start as Date).getTime() + (night.end as Date).getTime()) / 2)) * 100).toFixed(0)}% lit at mid-night. `
        : night.kind === 'none'
          ? 'The Sun does not get below -18 deg at this site on this date: no astronomical night. '
          : 'The Sun stays below -18 deg for the whole day, or the night ends in polar night: no usable night. ';
  return (
    <>
    <div className="space-y-8 text-white print:hidden">
      <header>
        <h1 className="text-3xl md:text-4xl font-light text-white tracking-[0.2em]">IMAGING PLANNER</h1>
        <p className="text-white/90 font-normal text-sm mt-2 max-w-3xl">
          A free guest tool; signing in is optional and only for owner features. It starts from a sample profile; change the site, gear and horizon to plan your night.
          Exposure and other worked-out values are estimates. Your profile and captured list stay in this browser and are never sent anywhere; export your profile to keep a copy.
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
        {planError && (
          <p role="alert" className="pointer-events-none bg-slate-900 border border-orange-300/60 rounded px-3 py-2 text-orange-100 font-normal text-sm">
            Could not plan: {planError}
          </p>
        )}
      </div>

      <section aria-labelledby="controls-heading" className={panel}>
        <h2 id="controls-heading" className="text-xl font-light text-white tracking-[0.15em] mb-4">{nightWord.toUpperCase()}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1.2fr_1.2fr_1.6fr] items-start">
          <div>
            <label htmlFor="plan-date" className="block text-white/90 font-normal text-sm mb-1">Evening of</label>
            <input id="plan-date" type="date" className={`${field} w-full`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="plan-site" className="block text-white/90 font-normal text-sm mb-1">Site</label>
            <WrapSelect
              id="plan-site"
              className="w-full"
              value={site.id}
              onChange={(e) => {
                setSiteId(e.target.value);
                rememberSelection(e.target.value, train.id);
                loadForm(profile.sites.find((x) => x.id === e.target.value)?.blockedArcs ?? [], true);
              }}
            >
              {profile.sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </WrapSelect>
          </div>
          <div>
            <label htmlFor="plan-train" className="block text-white/90 font-normal text-sm mb-1">Train</label>
            <WrapSelect id="plan-train" className="w-full" value={train.id} onChange={(e) => { setTrainId(e.target.value); rememberSelection(site.id, e.target.value); }}>
              {profile.trains.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.kind === 'smart' ? ' (smart scope)' : ''}</option>
              ))}
            </WrapSelect>
          </div>
          <div>
            <label htmlFor="plan-filter" className="block text-white/90 font-normal text-sm mb-1">Filter</label>
            <WrapSelect
              id="plan-filter"
              className="w-full"
              value={train.kind === 'optical' ? (train.filterId ?? '') : ''}
              disabled={train.kind !== 'optical'}
              aria-describedby="plan-filter-msg"
              onChange={(e) => chooseFilter(e.target.value)}
            >
              <option value="">{train.kind === 'optical' ? 'No filter' : 'Built in (smart scope)'}</option>
              {train.kind === 'optical' &&
                profile.equipment.filters.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}{f.sizeMm !== undefined ? ` (${f.sizeMm} mm)` : ''}</option>
                ))}
            </WrapSelect>
            <p id="plan-filter-msg" className="mt-1 h-10 overflow-hidden text-sm leading-5 text-white/70 font-normal">
              {train.kind === 'optical' && profile.equipment.filters.length === 0
                ? 'No filters. Use Replace profile with sample.'
                : ''}
            </p>
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
          {nightText}
          {zoneText}
        </p>
        <p className="text-white/80 font-normal text-sm mt-1" data-testid="horizon-summary">
          {horizonText}{' '}
          <a href="#horizon" className="inline-flex min-h-11 items-center rounded px-1 text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400">
            Edit horizon
          </a>
        </p>
      </section>

      <TargetSearch
        catalog={catalog}
        onRetryCatalog={retryCatalog}
        scorer={scorer}
        nightWord={nightWord}
        formatTime={formatTime}
        planIds={planIdSet}
        rankOf={(id) => placeOf.get(id)}
        onAdd={(t: SearchTarget) => addToPlan(t.id)}
      />

      <section aria-labelledby="list-heading" className={panel}>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <h2 id="list-heading" className="text-xl font-light text-white tracking-[0.15em]">BEST TARGETS FOR {nightWord.toUpperCase()}</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="f-type" className="block text-white/90 font-normal text-sm mb-1">Type</label>
              <WrapSelect id="f-type" className="w-full" value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
                {(Object.keys(TYPE_LABELS) as TypeFilter[]).map((k) => (
                  <option key={k} value={k}>{TYPE_LABELS[k]}</option>
                ))}
              </WrapSelect>
            </div>
            <label className="flex items-center gap-2 text-white/90 font-normal text-sm pb-1">
              <input type="checkbox" checked={showNoFit} onChange={(e) => setShowNoFit(e.target.checked)} className="accent-sky-400" />
              Show targets that do not fit
            </label>
            <button type="button" className={btn} onClick={exportCsv} disabled={ranked === null || filtered.length === 0}>
              Export CSV
            </button>
            <button type="button" className={btn} onClick={() => window.print()} disabled={ranked === null || filtered.length === 0}>
              Print or save as PDF
            </button>
          </div>
        </div>

        {stableNight && !hasNight ? (
          <p className="text-white/90 font-normal">No astronomical night, so there is nothing to rank.</p>
        ) : tonight.status === 'error' ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-orange-300/40 bg-orange-400/15 px-3 py-2 text-orange-100 font-normal text-sm">
            <span className="min-w-0 break-words">The list for {nightWord} could not be ranked: {tonight.message}</span>
            <button type="button" className={`${btn} min-h-11`} onClick={retryTonight}>Retry</button>
          </div>
        ) : tonight.status !== 'ready' ? (
          planError ? null : (
            <p aria-live="polite" aria-busy="true" className="text-white/90 font-normal">
              Ranking the whole catalog for {nightWord}…
            </p>
          )
        ) : (
          <>
            <HiddenNote counts={ranked!.counts} hidden={ranked!.hidden} showNoFit={showNoFit} onShow={() => setShowNoFit(true)} />
            {filtered.length === 0 ? (
          <p className="text-white/90 font-normal">No targets match these filters.</p>
        ) : (
          <>
            <ul className="lg:hidden space-y-3" data-testid="target-cards" aria-label={`Targets ranked for ${nightWord}`}>
              {filtered.map((e, i) => {
                const t = targetText(e, formatTime);
                const isSel = selected?.id === e.id;
                return (
                  <li key={e.id} className={`rounded border border-white/15 p-3 text-sm font-normal text-white/90 ${isSel ? 'bg-sky-400/10' : ''}`}>
                    <div>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2">
                          <span className="text-white/70">{i + 1}.</span>
                          <button
                            type="button"
                            id={`card-name-${e.id}`}
                            onClick={() => setSelectedId(e.id)}
                            aria-pressed={isSel}
                            className="min-h-11 py-2 underline decoration-dotted text-left text-white break-words focus:outline-none focus:ring-2 focus:ring-sky-400 rounded"
                          >
                            {e.name}
                          </button>
                          {e.isPlanet && <span className="rounded bg-yellow-300/20 text-yellow-100 text-xs px-1.5 py-0.5">planet</span>}
                        </p>
                        <label className="flex min-h-11 w-fit items-center gap-2 pr-3">
                          <input
                            type="checkbox"
                            aria-label={`Captured: ${e.name}`}
                            checked={captured.has(e.id)}
                            onChange={() => toggleCaptured(e.id)}
                            className="h-5 w-5 shrink-0 accent-sky-400"
                          />
                          <span aria-hidden="true">Captured</span>
                        </label>
                        {planButton(e, 'card')}
                        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                          <dt className="text-white/70">Season</dt><dd>{t.season}</dd>
                          <dt className="text-white/70">Setup</dt><dd>{t.setup}</dd>
                          <dt className="text-white/70">Peak</dt><dd>{t.peak}</dd>
                          <dt className="text-white/70">Usable window</dt><dd><Windows ranges={t.windows} /></dd>
                          <dt className="text-white/70">Moon</dt><dd>{t.moon}</dd>
                          <dt className="text-white/70">Score</dt><dd>{e.score.total}</dd>
                        </dl>
                        <div className="mt-1">
                          <WhyToggle e={e} t={t} open={whyOpen.has(e.id)} onToggle={() => toggleWhy(e.id)} idPrefix="why-card" />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden lg:block">
            <table className="w-full text-left text-sm font-normal text-white/90" data-testid="target-table">
              <caption className="sr-only">Targets ranked for {nightWord}</caption>
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
                {filtered.map((e, i) => {
                  const t = targetText(e, formatTime);
                  return (
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
                        id={`row-name-${e.id}`}
                        onClick={() => setSelectedId(e.id)}
                        aria-pressed={selected?.id === e.id}
                        className="underline decoration-dotted text-left text-white focus:outline-none focus:ring-2 focus:ring-sky-400 rounded"
                      >
                        {e.name}
                      </button>
                      {e.isPlanet && <span className="ml-2 rounded bg-yellow-300/20 text-yellow-100 text-xs px-1.5 py-0.5">planet</span>}
                      <div>{planButton(e, 'row')}</div>
                    </th>
                    <td className="py-2 pr-3">{t.season}</td>
                    <td className="py-2 pr-3">{t.setup}</td>
                    <td className="py-2 pr-3">{t.peak}</td>
                    <td className="py-2 pr-3"><Windows ranges={t.windows} /></td>
                    <td className="py-2 pr-3">{t.moon}</td>
                    <td className="py-2">{e.score.total}</td>
                  </tr>
                  <tr className={`border-b border-white/10 ${selected?.id === e.id ? 'bg-sky-400/10' : ''}`}>
                    <td colSpan={9} className="pb-3 pl-8 pr-3 text-white/80">
                      <WhyToggle e={e} t={t} open={whyOpen.has(e.id)} onToggle={() => toggleWhy(e.id)} idPrefix="why-row" />
                    </td>
                  </tr>
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
          </>
        )}
        <p className="text-white/60 font-normal text-xs mt-3">
          Score: usable hours up to 50, peak altitude up to 30, in season 10 (curated targets only; the catalog has no seasons), Moon up to -20, does not fit -25, plus brightness and framing. Double stars are not ranked (search finds them). Open Why recommended on a target to see its score parts and fit detail.
        </p>
      </section>

      <MyPlan rows={planRows} nightWord={nightWord} onMove={movePlan} onRemove={removeFromPlan} />

      {selected && track && stableNight && (
        <section aria-labelledby="chart-heading" className={panel}>
          <h2 id="chart-heading" className="text-xl font-light text-white tracking-[0.15em] mb-4">
            ALTITUDE: {selected.name.toUpperCase()}
          </h2>
          <AltitudeChart
            entry={selected}
            night={stableNight}
            track={track}
            horizonSet={horizon !== null}
            minAltitude={minAltitude}
            formatTime={formatTime}
            nightWord={nightWord}
          />
        </section>
      )}

      {selected && (
        <ExposurePanel
          entry={selected}
          target={selectedTarget ? exposureTargetFrom(selectedTarget) : { id: selected.id, name: selected.name }}
          optics={trainInfo.optics}
          camera={trainInfo.camera}
          filter={trainInfo.filter}
          site={site}
          bortle={bortle}
          bortleSet={site.bortle !== undefined}
          formatTime={formatTime}
          nightWord={nightWord}
        />
      )}

      {stableNight && astroSite && catalog.status !== 'loading' && (
        <ItinerarySection
          profile={profile}
          train={train}
          planOptions={planOptions}
          catalog={catalog.status === 'ready' ? catalog.index : null}
          scorer={scorer}
          site={astroSite}
          night={stableNight}
          horizon={horizon}
          minAltitude={minAltitude}
          bortle={bortle}
          bortleSet={site.bortle !== undefined}
          formatTime={formatTime}
          nightWord={nightWord}
          timeZone={siteZone || zone || undefined}
          report={itineraryReport}
        />
      )}

      {stableNight && astroSite && (
        <PlanetsSection
          profile={profile}
          train={train}
          site={astroSite}
          night={stableNight}
          horizon={horizon}
          minAltitude={minAltitude}
          formatTime={formatTime}
          nightWord={nightWord}
        />
      )}

      <HorizonEditor
        siteName={site.name}
        fields={fields}
        errors={errors}
        previews={arcs}
        sliderValues={sliderValues}
        dirty={dirty}
        saved={justSaved}
        onField={editField}
        onSave={saveArc}
        onDiscard={() => loadForm(site.blockedArcs, false)}
        onUseSample={() => loadForm(sampleProfile().sites[0]?.blockedArcs ?? [], true)}
        onClear={() => {
          setFields([]);
          setBases([]);
          setJustSaved(false);
        }}
        onAdd={() => {
          setFields((f) => [...f, newZoneFields(f)]);
          setBases((b) => [...b, null]);
          setJustSaved(false);
        }}
        onRemove={(i) => {
          setFields((f) => f.filter((_, j) => j !== i));
          setBases((b) => b.filter((_, j) => j !== i));
          setJustSaved(false);
        }}
      />

      <ProfileEditor profile={profile} onChange={applyProfile} />

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
    {printing && (
    <PrintSheet
      date={date}
      siteLine={`Site: ${site.name} (${site.latitude.toFixed(4)}°, ${site.longitude.toFixed(4)}°${site.elevationM !== undefined ? `, ${site.elevationM} m` : ''}). ${zoneText}`}
      trainLine={`Train: ${train.name}${train.kind === 'optical' && train.filterId ? `, filter ${profile.equipment.filters.find((f) => f.id === train.filterId)?.name ?? train.filterId}` : ''}. Minimum altitude ${minAltitude}°.`}
      nightLine={nightText}
      horizonLine={horizonText}
      entries={filtered}
      captured={captured}
      formatTime={formatTime}
      itinerary={itineraryReport.current}
    />
    )}
    </>
  );
}
