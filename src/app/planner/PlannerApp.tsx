'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { moonIllumination } from '@/planner/astro';
import type { AstronomicalNight } from '@/planner/astro';
import { rigOf } from '@/planner/ai/body';
import type { PlanTarget } from '@/planner/ai/body';
import { MAX_TARGETS } from '@/planner/ai/facts';
import { loadCatalog } from '@/planner/catalog/loader';
import type { CatalogIndex } from '@/planner/catalog/search';
import { makeCsvTime, planToCsv } from '@/planner/export';
import { arcsConflict, arcToHorizonPoints, ProfileError, resolveTrain } from '@/planner/profile';
import type { BlockedArc, Profile } from '@/planner/profile';
import { DEFAULT_BORTLE, exposureTargetFrom } from '@/planner/exposure';
import { altitudeTrack, compass, fieldOf, planTrainFor, tonightsNight } from '@/planner/plan';
import type { PlanEntry, PlanTrain } from '@/planner/plan';
import type { RankResult } from '@/planner/plan/rank';
import { planetIdOf, SLOT_BODIES } from '@/planner/itinerary/resolve';
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
import AiPlanPanel from './AiPlanPanel';
import CampaignPanel from './CampaignPanel';
import AltitudeChart from './AltitudeChart';
import { loadAuthState } from './authState';
import type { AuthState } from './authState';
import ExposurePanel from './ExposurePanel';
import HorizonEditor from './HorizonEditor';
import ItinerarySection from './ItinerarySection';
import NumberSlider from './NumberSlider';
import OverflowMenu from './OverflowMenu';
import PlanetsSection from './PlanetsSection';
import PrintSheet from './PrintSheet';
import { download } from './download';
import type { IncomingItinerary, ItineraryReport } from './ItinerarySection';
import type { CampaignPanelProps } from './CampaignPanel';
import type { ItineraryItem } from '@/planner/itinerary';
import WrapSelect from './WrapSelect';
import ProfileEditor from './ProfileEditor';
import MyPlan from './MyPlan';
import type { MyPlanRow } from './MyPlan';
import TargetList, { Group } from './TargetList';
import type { RowDescription } from './TargetList';
import TargetSearch from './TargetSearch';
import { createNightScorer } from './nightScorer';
import { addDays, designationOf, fitReason, nameList, nightDateText, nightStatus, peakText, scorePartsText, sizeText, typeLabel } from './catalogText';
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

type RankedEntry = PlanEntry;

/** Above this share of the Moon lit at mid-night, the list says so in words. */
const BRIGHT_MOON = 0.8;

/** Tonight's list holds at most this many targets. */
const LIST_LIMIT = 100;

/** Moon, windows and the full reason of one target: what the compact row leaves out. */
function detailText(e: RankedEntry, formatTime: (d: Date) => string) {
  return {
    moon: `${(e.moonIllumination * 100).toFixed(0)}% lit, ${e.moonSeparation.toFixed(0)}° away${e.moonUp ? '' : ' (down)'}`,
    windows: e.windows.map((w) => `${formatTime(w.start)} to ${formatTime(w.end)}`).join(', '),
    parts: `Score parts: ${scorePartsText(e.score)}.${e.fitDetail ? ` ${e.fitDetail}.` : ''}`,
  };
}

/**
 * What the size screen left out of the list, said with names instead of a silent disappearance. The one control for them is
 * the "Show targets that do not fit" box: off, this says what is left out; on, it says where they went.
 */
function NoFitNote({ counts, hidden, showNoFit, listed, nightWord }: { counts: RankResult['counts']; hidden: RankResult['hidden']; showNoFit: boolean; listed: number; nightWord: string }) {
  const total = counts.tooLarge + counts.tooSmall;
  if (total === 0) return null;
  const sample = (list: RankResult['hidden']['tooLarge'], n: number) => nameList(list.map((h) => h.name), n > list.length ? n - list.length : 0);
  return (
    <div className="mb-3 space-y-1 text-white/80 font-normal text-sm" data-testid="hidden-note">
      {showNoFit ? (
        <p>
          Showing {listed} targets that do not fit this frame in the group below the list
          {listed < total ? ` (${listed} of ${total}: only targets that are up ${nightWord} are listed)` : ''}.
        </p>
      ) : (
        <>
          {counts.tooLarge > 0 && (
            <p>
              {sample(hidden.tooLarge, counts.tooLarge)} {counts.tooLarge === 1 ? 'does' : 'do'} not fit this frame: larger than it ({counts.tooLarge}).
            </p>
          )}
          {counts.tooSmall > 0 && (
            <p>
              {sample(hidden.tooSmall, counts.tooSmall)} {counts.tooSmall === 1 ? 'does' : 'do'} not fit this frame: too small for it ({counts.tooSmall}).
            </p>
          )}
          <p>Tick “Show targets that do not fit” to list them.</p>
        </>
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
  /** The AI night plan's request; defaults to the browser's fetch. A test stands in a fake. */
  aiFetch?: typeof fetch;
  /** The several-night plan's worker; defaults to the bundled one. A test stands in a fake. */
  campaignWorker?: CampaignPanelProps['createWorker'];
  /** Who is signed in (the owner sees the AI plan's review switch); defaults to the session endpoint the sign-in control reads. */
  loadAuth?: () => Promise<AuthState>;
}

/** How long a toast stays up. */
const TOAST_MS = 6000;
/** How long "Added, #3 in My plan" stays next to the button. */
const ADDED_MS = 4000;
/** A pause this long with no keystroke ends a run of typing in Minimum altitude. */
const MIN_ALT_PAUSE_MS = 600;

/** A site with no blocked zones; one array so memo keys stay stable. */
const NO_ZONES: readonly BlockedArc[] = [];

const fieldsOf = (arcs: readonly BlockedArc[]): HorizonFields[] => arcs.map(fieldsFromArc);

export default function PlannerApp({ initialDate, initialProfile, rank = rankTonightAsync, loadCatalogIndex = loadCatalog, aiFetch, campaignWorker, loadAuth = loadAuthState }: PlannerAppProps) {
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
  const [type, setType] = useState<TypeFilter>('all');
  const [showNoFit, setShowNoFit] = useState(false);
  // The row that is open (its detail shows in place); '' for none. The Exposure panel follows it.
  const [openId, setOpenId] = useState<string>('');
  // The two groups under the list: the user's own open or close, else the default for the situation.
  const [planetsOpen, setPlanetsOpen] = useState<boolean | null>(null);
  const [noFitOpen, setNoFitOpen] = useState(false);
  // The target just added, for a few seconds: said next to its button, and to a screen reader in the status line.
  const [added, setAdded] = useState<{ id: string; text: string; say: string } | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);
  // My plan: catalog ids in the user's priority order; remembered in this browser like the site and train choice.
  const [planIds, setPlanIds] = useState<readonly string[]>([]);
  const [zone, setZone] = useState<string>('');
  // The sticky strip: closed it is one line (date, site, train); open it holds the controls. The page's fixed header and the strip
  // are measured so the column titles and anchors stop below them.
  const [controlsOpen, setControlsOpen] = useState(false);
  const stripRef = useRef<HTMLElement>(null);
  const [stickyTop, setStickyTop] = useState({ nav: 0, strip: 0 });
  // "Change or find a site": a count that the site editor answers by opening its Site list with the Find box focused.
  const [findSiteTick, setFindSiteTick] = useState(0);
  // The print sheet is built only while the browser is printing (Print button or Ctrl+P), so it costs the page nothing otherwise.
  const [printing, setPrinting] = useState(false);
  // The itinerary section leaves its current plan here; the print sheet reads it when printing starts (no re-render on every change).
  const itineraryReport = useRef<ItineraryReport | null>(null);
  // The AI plan offered to the itinerary, and who is waiting for its answer. The owner sees the AI review switch; a failed read leaves the page as a guest's.
  const [incoming, setIncoming] = useState<IncomingItinerary | null>(null);
  const incomingAnswer = useRef<((applied: boolean) => void) | null>(null);
  const offers = useRef(0);
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    let live = true;
    loadAuth().then(
      (a) => live && setOwner(a.kind === 'signedIn' && a.owner),
      (e) => console.error(e),
    );
    return () => {
      live = false;
    };
  }, [loadAuth]);

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
  const hasControls = site !== undefined && train !== undefined;
  useEffect(() => {
    if (!hasControls) return undefined;
    const nav = document.querySelector('nav.fixed');
    const measure = () => {
      const next = { nav: Math.round(nav?.getBoundingClientRect().height ?? 0), strip: Math.round(stripRef.current?.getBoundingClientRect().height ?? 0) };
      setStickyTop((prev) => (prev.nav === next.nav && prev.strip === next.strip ? prev : next));
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (nav) observer?.observe(nav);
    if (stripRef.current) observer?.observe(stripRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [hasControls]);
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
    () => (planning.base !== null && hasNight ? { ...planning.base, includeNoFit: showNoFit, limit: LIST_LIMIT } : null),
    [planning.base, hasNight, showNoFit],
  );
  const scorer = useMemo(() => (planning.base !== null && hasNight ? createNightScorer(planning.base) : null), [planning.base, hasNight]);
  const { state: tonight, retry: retryTonight } = useTonightList(rank, rankQuery);
  const { state: catalog, retry: retryCatalog } = useCatalog(loadCatalogIndex);
  const catalogById = useMemo(() => (catalog.status === 'ready' ? new Map(catalog.index.targets.map((t) => [t.id, t])) : null), [catalog]);

  const ranked = useMemo(() => (tonight.status === 'ready' ? tonight.result : null), [tonight]);
  // The planets that are up sit beside the best 100, so Type = Planets lists them and All shows them as a group of their own.
  const mainList = useMemo((): readonly PlanEntry[] => (ranked === null ? [] : type === 'planets' ? ranked.planets : ranked.entries), [ranked, type]);
  const planetGroup = useMemo((): readonly PlanEntry[] => (ranked !== null && type === 'all' ? ranked.planets : []), [ranked, type]);
  const noFitList = useMemo((): readonly PlanEntry[] => (ranked !== null && showNoFit && type !== 'planets' ? ranked.noFit : []), [ranked, showNoFit, type]);
  // Everything the Type filter lets through, in reading order: what Export and Print carry.
  const filtered = useMemo(() => [...mainList, ...planetGroup], [mainList, planetGroup]);
  const openEntry = useMemo(() => [...mainList, ...planetGroup, ...noFitList].find((e) => e.id === openId), [mainList, planetGroup, noFitList, openId]);
  // Where the page lists a target, said in the search result when it is there.
  const listedAs = (id: string): string | undefined => {
    const place = mainList.findIndex((e) => e.id === id);
    if (place >= 0) return `#${place + 1} in the list below.`;
    if (planetGroup.some((e) => e.id === id)) return 'Listed under Planets below.';
    if (noFitList.some((e) => e.id === id)) return 'Listed under “Does not fit this frame” below.';
    return undefined;
  };

  const isTonight = date === '' || date === tonightDate;
  const nightWord = isTonight ? 'tonight' : nightDateText(date);

  // My plan resolved for the night: a catalog target or a planet, scored by the same single-target path as the search.
  const planItems = useMemo(
    () =>
      planIds.map((id) => {
        const target = catalogById?.get(id);
        const body = SLOT_BODIES.find((b) => planetIdOf(b) === id);
        const entry = body !== undefined ? (scorer?.planet(body) ?? null) : target !== undefined ? (scorer?.target(target) ?? null) : null;
        return { id, target, body, entry };
      }),
    [planIds, catalogById, scorer],
  );

  const planIdSet = useMemo(() => new Set(planIds), [planIds]);

  // The Exposure panel follows the open row, else the best of the list.
  const selected = openEntry ?? filtered[0];
  // The altitude chart is drawn in the open row only.
  const track = useMemo(() => {
    if (!stableNight || stableNight.kind !== 'normal' || !openEntry || !site) return null;
    const pad = 2 * 3600000;
    return altitudeTrack(
      openEntry.source,
      { latitude: site.latitude, longitude: site.longitude, elevationM: site.elevationM },
      horizon,
      minAltitude,
      new Date((stableNight.start as Date).getTime() - pad),
      new Date((stableNight.end as Date).getTime() + pad),
      10,
    );
  }, [stableNight, openEntry, site, horizon, minAltitude]);

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

  /** The one way the Train changes: the select and the planetary note's button both end here. */
  const chooseTrain = (id: string) => {
    if (!site) return;
    setTrainId(id);
    rememberSelection(site.id, id);
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
    const place = planIds.length + 1;
    const body = SLOT_BODIES.find((b) => planetIdOf(b) === id);
    const target = catalogById?.get(id);
    const name = body ?? target?.displayName ?? target?.name ?? [...mainList, ...planetGroup, ...noFitList].find((e) => e.id === id)?.name ?? id;
    setAdded({ id, text: `Added, #${place} in My plan`, say: `${name} added, number ${place} in My plan.` });
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(null), ADDED_MS);
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
        ? (body === 'Moon' ? 'Moon' : 'Planet')
        : target !== undefined
          ? [designationOf(target.id) === name ? '' : designationOf(target.id), typeLabel(target.type), sizeText(target.sizeArcmin)].filter((x) => x !== '').join(' · ')
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

  // The AI plan takes My plan's fixed objects in the user's order; planets move, so they stay out, and so does anything not yet resolved.
  const aiTargets = useMemo(
    (): PlanTarget[] => planItems.flatMap(({ id, target, body }) => (body === undefined && target !== undefined ? [{ id, name: target.displayName ?? target.name, raHours: target.raHours, decDeg: target.decDeg }] : [])),
    [planItems],
  );
  const aiBase = useMemo(() => {
    if (planning.base === null || !train || !site) return null;
    const timeZone = planning.base.timeZone || zone;
    if (!timeZone) return null;
    return { site: planning.base.site, timeZone, horizon: planning.base.horizon, minAltitude, date: planning.base.date, rig: rigOf(profile, train), bortle: site.bortle };
  }, [planning.base, train, site, zone, minAltitude, profile]);
  const planets = planItems.filter((p) => p.body !== undefined).length;
  const unresolved = planItems.length - planets - aiTargets.length;
  const aiBlocked =
    planIds.length === 0
      ? 'Add at least one target to My plan first.'
      : !hasNight
        ? 'There is no astronomical night on this date, so there is nothing to plan.'
        : catalog.status === 'loading'
          ? 'The catalog is still loading.'
          : aiTargets.length === 0
            ? 'My plan has no deep-sky targets the AI planner can use. It plans fixed objects, not planets.'
            : aiBase === null
              ? 'The site or train is not ready.'
              : null;
  const aiLeftOut = [
    planets > 0 ? `${planets} ${planets === 1 ? 'planet is' : 'planets are'} left out: the AI plans fixed objects.` : '',
    unresolved > 0 ? `${unresolved} ${unresolved === 1 ? 'target is' : 'targets are'} left out: not in the bundled catalog.` : '',
    aiTargets.length > MAX_TARGETS ? `Only the first ${MAX_TARGETS} targets of My plan are sent.` : '',
  ].filter((x) => x !== '').join(' ');
  // The several-night plan takes the same fixed objects, with their catalog type (it picks each one's useful range). Planets and anything not yet resolved stay out.
  const campaignTargets = useMemo(
    () => planItems.flatMap(({ target, body }) => (body === undefined && target !== undefined ? [{ id: target.id, name: target.displayName ?? target.name, raHours: target.raHours, decDeg: target.decDeg, type: target.type }] : [])),
    [planItems],
  );
  const campaignBlocked =
    planIds.length === 0
      ? 'Add at least one target to My plan first.'
      : catalog.status === 'loading'
        ? 'The catalog is still loading.'
        : campaignTargets.length === 0
          ? 'My plan has no deep-sky targets to plan. This plans fixed objects, not planets.'
          : aiBase === null
            ? 'The site or train is not ready.'
            : null;
  const campaignLeftOut = [
    planets > 0 ? `${planets} ${planets === 1 ? 'planet is' : 'planets are'} left out: planets move across the sky from night to night, and this plan places fixed objects.` : '',
    unresolved > 0 ? `${unresolved} ${unresolved === 1 ? 'target is' : 'targets are'} left out: not in the bundled catalog.` : '',
  ].filter((x) => x !== '').join(' ');
  /** Gives the plan to the itinerary section and waits for its answer (it asks before replacing a plan that is there). */
  const offerToItinerary = (items: ItineraryItem[], startTime: string | null, label?: string) =>
    new Promise<boolean>((resolve) => {
      incomingAnswer.current?.(false);
      incomingAnswer.current = resolve;
      setIncoming({ key: ++offers.current, items, startTime, label });
    });

  const field =
    'bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';
  const btn =
    'px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';
  const panel = 'bg-black/70 rounded-lg border border-white/10 p-4 sm:p-6';
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
  const midMoon = night?.kind === 'normal' ? moonIllumination(new Date(((night.start as Date).getTime() + (night.end as Date).getTime()) / 2)) : null;
  const nightText =
    night === undefined
      ? 'Loading the date…'
      : night.kind === 'normal'
        ? `Astronomical night ${formatTime(night.start as Date)} to ${formatTime(night.end as Date)} (${(((night.end as Date).getTime() - (night.start as Date).getTime()) / 3600000).toFixed(1)} h), Moon ${((midMoon ?? 0) * 100).toFixed(0)}% lit at mid-night. `
        : night.kind === 'none'
          ? 'The Sun does not get below -18 deg at this site on this date: no astronomical night. '
          : 'The Sun stays below -18 deg for the whole day, or the night ends in polar night: no usable night. ';
  const planetary = train.kind === 'optical' && train.tag === 'planetary';
  // Where "Use ..." goes: the first train that is not set up for planets (an optical one first).
  const deepTrain = planetary ? (profile.trains.find((t) => t.kind === 'optical' && t.tag !== 'planetary') ?? profile.trains.find((t) => t.kind === 'smart')) : undefined;
  const frame = planTrain === null ? null : fieldOf(planTrain);
  const noFitFit = (e: PlanEntry): string => (frame === null ? e.fit : fitReason(e, catalogById?.get(e.id)?.sizeArcmin, frame));
  const describeRow = (e: PlanEntry): RowDescription => {
    if (e.isPlanet) return { aka: '', meta: e.name === 'Moon' ? 'Moon' : 'Planet' };
    const t = catalogById?.get(e.id);
    if (t === undefined) return { aka: '', meta: typeLabel(e.type) };
    const d = designationOf(t.id);
    return { aka: d !== '' && d !== e.name ? d : '', meta: [typeLabel(t.type), sizeText(t.sizeArcmin), t.constellation].filter((x) => x !== undefined && x !== '').join(' · ') };
  };
  const renderDetail = (e: PlanEntry) => {
    const t = detailText(e, formatTime);
    return (
      <div className="space-y-2 font-normal text-white/90">
        <p>{e.why}</p>
        <p className="text-xs text-white/70">{t.parts}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className="text-white/70">Usable window</dt><dd>{t.windows === '' ? 'none' : t.windows}</dd>
          <dt className="text-white/70">Peak</dt><dd>{peakText(e, formatTime)}</dd>
          <dt className="text-white/70">Moon</dt><dd>{t.moon}</dd>
        </dl>
        <label className="flex min-h-11 w-fit items-center gap-2 pr-3">
          <input type="checkbox" aria-label={`Captured: ${e.name}`} checked={captured.has(e.id)} onChange={() => toggleCaptured(e.id)} className="h-5 w-5 shrink-0 accent-sky-400" />
          <span aria-hidden="true">Captured</span>
        </label>
        {track && stableNight && e.id === openId && (
          <AltitudeChart entry={e} night={stableNight} track={track} horizonSet={horizon !== null} minAltitude={minAltitude} formatTime={formatTime} nightWord={nightWord} />
        )}
      </div>
    );
  };
  const quickDates = [
    { label: 'Today', date: tonightDate },
    { label: 'Tomorrow', date: addDays(tonightDate, 1) },
    { label: '+1 week', date: addDays(tonightDate, 7) },
  ];
  const focusSearch = () => {
    const input = document.getElementById('target-search');
    if (!input) return;
    input.scrollIntoView({ block: 'center' });
    input.focus({ preventScroll: true });
  };
  const listProps = {
    formatTime,
    describe: describeRow,
    planIds: planIdSet,
    added,
    onAdd: addToPlan,
    openId,
    onToggle: (id: string) => setOpenId(openId === id ? '' : id),
    renderDetail,
  };
  return (
    <>
    <div
      className="space-y-8 text-white print:hidden [&_h2]:scroll-mt-[calc(var(--planner-top,0px)+1rem)] [&_section[id]]:scroll-mt-[calc(var(--planner-top,0px)+1rem)]"
      style={{ '--planner-nav': `${stickyTop.nav}px`, '--planner-top': `${stickyTop.nav + stickyTop.strip}px` } as React.CSSProperties}
    >
      <header>
        <h1 className="text-3xl md:text-4xl font-light text-white tracking-[0.2em]">IMAGING PLANNER</h1>
        <p className="text-white/90 font-normal text-sm mt-2 max-w-3xl">
          A free guest tool; signing in is optional and only for owner features. It starts from a sample profile; change the site, gear and horizon to plan your night.
          Exposure and other worked-out values are estimates. Your profile and captured list stay in this browser and are never sent anywhere; export your profile to keep a copy.
        </p>
      </header>

      <p aria-live="polite" className="sr-only">{added?.say ?? ''}</p>

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

      <section ref={stripRef} aria-labelledby="controls-heading" className="sticky top-[var(--planner-nav,0px)] z-30 rounded-lg border border-white/10 bg-black/95 backdrop-blur">
        <h2 id="controls-heading" className="sr-only">{nightWord.toUpperCase()}</h2>
        <div className="flex items-center gap-2 px-2 sm:px-4">
          <button
            type="button"
            aria-expanded={controlsOpen}
            aria-controls="controls-panel"
            onClick={() => setControlsOpen(!controlsOpen)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded text-left text-xs font-normal leading-4 text-white focus:outline-none focus:ring-2 focus:ring-sky-400 sm:text-sm"
          >
            <span aria-hidden="true" className="w-4 shrink-0 text-white/70">{controlsOpen ? '▾' : '▸'}</span>
            <span className="min-w-0 line-clamp-2">{[date === '' ? '' : nightDateText(date), site.name, train.name].filter((x) => x !== '').join(' · ')}</span>
            <span className="shrink-0 text-sky-300 underline underline-offset-2">{controlsOpen ? 'close' : 'edit'}</span>
          </button>
          <button type="button" aria-label="Find a target" onClick={focusSearch} className="min-h-11 shrink-0 rounded px-2 text-sm font-normal text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400">
            Search
          </button>
        </div>
        <div id="controls-panel" hidden={!controlsOpen} className="max-h-[60vh] overflow-y-auto border-t border-white/10 p-4">
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1.2fr_1.2fr_1.6fr]">
          <div>
            <label htmlFor="plan-date" className="block text-white/90 font-normal text-sm mb-1">Evening of</label>
            <input id="plan-date" type="date" className={`${field} w-full`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Quick dates">
              {quickDates.map((q) => (
                <button key={q.label} type="button" aria-pressed={date === q.date} onClick={() => setDate(q.date)} className={`${btn} min-h-11 ${date === q.date ? 'bg-white/15' : ''}`}>
                  {q.label}
                </button>
              ))}
            </div>
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
            <button
              type="button"
              onClick={() => {
                setControlsOpen(false);
                setFindSiteTick((n) => n + 1);
              }}
              className="mt-1 inline-flex min-h-11 items-center rounded px-1 text-sm font-normal text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              Change or find a site
            </button>
          </div>
          <div>
            <label htmlFor="plan-train" className="block text-white/90 font-normal text-sm mb-1">Train</label>
            <WrapSelect id="plan-train" className="w-full" value={train.id} onChange={(e) => chooseTrain(e.target.value)}>
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
        </div>
      </section>
      <div className="-mt-4 space-y-1 px-1">
        <p className="text-white/80 font-normal text-sm" data-testid="night-summary">
          {nightText}
          {zoneText}
        </p>
        <p className="text-white/80 font-normal text-sm" data-testid="horizon-summary">
          {horizonText}{' '}
          <a href="#horizon" className="inline-flex min-h-11 items-center rounded px-1 text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400">
            Edit horizon
          </a>
        </p>
        <p className="text-white/80 font-normal text-sm">
          <a href="#campaign-heading" className="inline-flex min-h-11 items-center rounded px-1 text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400">
            Plan several nights from this evening
          </a>
        </p>
      </div>

      <MyPlan rows={planRows} nightWord={nightWord} onMove={movePlan} onRemove={removeFromPlan} />

      <AiPlanPanel
        base={aiBase}
        targets={aiTargets}
        blocked={aiBlocked}
        leftOutNote={aiLeftOut}
        profile={profile}
        train={train}
        siteName={site.name}
        nightWord={nightWord}
        night={hasNight ? (stableNight as AstronomicalNight) : null}
        catalogTargets={catalog.status === 'ready' ? catalog.index.targets : []}
        formatTime={formatTime}
        owner={owner}
        fetchPlan={aiFetch}
        onApply={offerToItinerary}
      />

      <CampaignPanel
        base={aiBase}
        targets={campaignTargets}
        blocked={campaignBlocked}
        leftOutNote={campaignLeftOut}
        profile={profile}
        train={train}
        siteName={site.name}
        catalogTargets={catalog.status === 'ready' ? catalog.index.targets : []}
        formatTime={formatTime}
        createWorker={campaignWorker}
        onApply={offerToItinerary}
      />

      <TargetSearch
        catalog={catalog}
        onRetryCatalog={retryCatalog}
        scorer={scorer}
        nightWord={nightWord}
        formatTime={formatTime}
        planIds={planIdSet}
        listedAs={listedAs}
        added={added}
        onAdd={addToPlan}
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
            <label className="flex min-h-11 items-center gap-2 text-white/90 font-normal text-sm">
              <input type="checkbox" checked={showNoFit} onChange={(e) => setShowNoFit(e.target.checked)} className="h-5 w-5 accent-sky-400" />
              Show targets that do not fit
            </label>
            <OverflowMenu
              label="More"
              items={[
                { label: 'Export CSV', onSelect: exportCsv, disabled: ranked === null || filtered.length === 0 },
                { label: 'Print or save as PDF', onSelect: () => window.print(), disabled: ranked === null || filtered.length === 0 },
              ]}
            />
          </div>
        </div>

        <p className="mb-3 text-white/70 font-normal text-sm" data-testid="score-note">
          Score is out of 100 for {nightWord} at this site, with this train and minimum altitude: 100 is the best a target can do. It compares targets on one night, not across nights. The list mixes types, so it is not strictly in score order. Double stars are not ranked; search finds them.
        </p>
        {hasNight && midMoon !== null && midMoon > BRIGHT_MOON && (
          <p className="mb-3 text-white/90 font-normal text-sm" data-testid="bright-moon-note">
            Bright Moon ({(midMoon * 100).toFixed(0)}% lit at mid-night): faint nebulae and galaxies will wash out; clusters and bright objects hold up best. This is an estimate from the Moon&apos;s phase, not a sky reading.
          </p>
        )}
        {planetary && (
          <p className="mb-3 flex flex-wrap items-center gap-x-3 text-white/90 font-normal text-sm" data-testid="planetary-note">
            <span>This train is set up for planets, so most deep-sky targets are too large or too small for its frame.</span>
            {deepTrain && (
              <button type="button" className={`${btn} min-h-11`} onClick={() => chooseTrain(deepTrain.id)}>
                Use {deepTrain.name}
              </button>
            )}
          </p>
        )}

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
            {type !== 'planets' && <NoFitNote counts={ranked!.counts} hidden={ranked!.hidden} showNoFit={showNoFit} listed={noFitList.length} nightWord={nightWord} />}
            {planetGroup.length > 0 && (
              <Group id="planets-group" title={`Planets up ${nightWord} (${planetGroup.length})`} open={planetsOpen ?? planetary} onToggle={() => setPlanetsOpen(!(planetsOpen ?? planetary))}>
                <TargetList {...listProps} entries={planetGroup} label={`Planets up ${nightWord}`} idPrefix="planet" />
              </Group>
            )}
            {mainList.length === 0 ? (
              <p className="text-white/90 font-normal">{type === 'planets' ? `No planet is up ${nightWord} above your horizon and minimum altitude.` : 'No targets match these filters.'}</p>
            ) : (
              <>
                {planetGroup.length > 0 && <h3 className="mt-4 text-base font-medium text-white">Best deep-sky targets</h3>}
                <TargetList {...listProps} entries={mainList} label={`Targets ranked for ${nightWord}`} idPrefix="target" />
              </>
            )}
            {noFitList.length > 0 && (
              <Group id="nofit-group" title={`Does not fit this frame (${noFitList.length})`} open={noFitOpen} onToggle={() => setNoFitOpen(!noFitOpen)}>
                <TargetList {...listProps} entries={noFitList} label="Targets that do not fit this frame" idPrefix="nofit" fitText={noFitFit} />
              </Group>
            )}
          </>
        )}
      </section>

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
          incoming={incoming}
          onIncoming={(applied) => {
            setIncoming(null);
            incomingAnswer.current?.(applied);
            incomingAnswer.current = null;
          }}
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

      <ProfileEditor profile={profile} onChange={applyProfile} findSite={{ siteId: site.id, tick: findSiteTick }} />

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
