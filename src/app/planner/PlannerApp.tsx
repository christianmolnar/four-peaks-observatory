'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { moonIllumination } from '@/planner/astro';
import { apparentDiameterArcsec } from '@/planner/planets';
import type { CardBody } from '@/planner/planets';
import type { AstronomicalNight } from '@/planner/astro';
import { rigOf } from '@/planner/ai/body';
import type { PlanTarget } from '@/planner/ai/body';
import { MAX_TARGETS } from '@/planner/ai/facts';
import { loadCatalog } from '@/planner/catalog/loader';
import type { CatalogIndex } from '@/planner/catalog/search';
import { MAX_PLANS_FILE_CHARS, NOT_IN_CATALOG, NOT_SCHEDULED, PlansFileError, asiairCsv, asiairPanes, docToCsv, docToMarkdown, docToText, filterNameOf, gearFileText, gearInEverything, gearSheet, makeCsvTime, planToCsv, plansFileText, raText, decText, readPlansFile, siteText, storedSheet, trainText } from '@/planner/export';
import type { ProjectSheet } from '@/planner/projects';
import type { AsiairTarget, PlanExposureRow, PlanSheet, SheetRow, ShareDoc, TargetFacts } from '@/planner/export';
import { opticalTrain } from '@/planner/optics';
import { BROADBAND_ID, projectSheet } from '@/planner/projects';
import { arcToHorizonPoints, gearProblems, parseProfile, ProfileError, resolveTrain } from '@/planner/profile';
import type { BlockedArc, Profile } from '@/planner/profile';
import { DEFAULT_BORTLE, MAX_SUBS, MAX_SUB_S, MIN_CUSTOM_SUB_S, MODE_ORDER, PRESETS } from '@/planner/exposure';
import { altitudeTrack, compass, fieldOf, planTrainFor, tonightsNight } from '@/planner/plan';
import type { PlanEntry, PlanTrain } from '@/planner/plan';
import type { RankResult } from '@/planner/plan/rank';
import { SOLAR_SYSTEM, TYPE_GROUPS, groupCount, groupNotFit, typeGroupOf } from '@/planner/plan/type-groups';
import { planetIdOf, SLOT_BODIES, slotInputFor } from '@/planner/itinerary/resolve';
import type { SlotTarget } from '@/planner/itinerary/resolve';
import { rankTonightAsync } from '@/planner/tonight';
import type { TonightQuery } from '@/planner/tonight';
import {
  CAPTURED_KEY,
  DEFAULT_MIN_ALTITUDE,
  MIN_ALTITUDE_RANGE,
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
  loadProfile,
  loadSelection,
  sampleProfile,
  saveCaptured,
  sameFields,
  saveProfile,
  saveSelection,
  withSiteArcs,
} from '@/planner/state';
import { assertImportSize, profileFromText } from '@/planner/state/edit';
import { profileProblemText } from '@/planner/state/words';
import { FAVORITES_KEY, favoriteOf, favoriteProblem, listFavoritesBackups, withFavorite, withoutFavorite } from '@/planner/state/favorites';
import type { Favorite } from '@/planner/state/favorites';
import {
  MAX_PLANS,
  MAX_PLAN_TARGETS,
  PLANS_KEY,
  EXPOSURE_NOTICE_KEY,
  DAMAGED_NOTICE,
  NEWER_NOTICE,
  clearOldPlanKeys,
  cutMessage,
  deletePlan,
  duplicatePlan,
  compareIncoming,
  importPlans,
  inspectStored,
  keepCopy,
  listBackups,
  loadPlans,
  migrateOldPlan,
  newPlan,
  openPlan as withOpenPlan,
  renamePlan,
  savePlans,
  startPlans,
  updatePlan,
  withMigratedPlan,
} from '@/planner/state/plans';
import type { ImportResult, Plan, PlanDefaults, PlanTargetRef, PlansState } from '@/planner/state/plans';
import type { HorizonErrors, HorizonField, HorizonFields } from '@/planner/state';
import AiPlanFlyout from './AiPlanFlyout';
import AltitudeChart from './AltitudeChart';
import AuthControl from './AuthControl';
import ThemeToggle from './ThemeToggle';
import { loadAuthState } from './authState';
import type { AuthState } from './authState';
import Collapsible from './Collapsible';
import HorizonEditor, { describeOverlaps } from './HorizonEditor';
import PlanTimeline from './PlanTimeline';
import NumberSlider from './NumberSlider';
import OverflowMenu from './OverflowMenu';
import SolarSystemDetail from './SolarSystemDetail';
import PrintSheet from './PrintSheet';
import ShareSheet from './ShareSheet';
import type { ImportPanel, ShareFormat, ShareWhat } from './ShareSheet';
import { FORMATS } from './ShareSheet';
import { download } from './download';
import type { PlanTimelineReport } from './PlanTimeline';
import { ITINERARY_KEY, MAX_SLOTS, buildItinerary, clockToInstant, lightMinutes, makeWindowLookup } from '@/planner/itinerary';
import type { ItineraryItem, ItineraryPlan } from '@/planner/itinerary';
import WrapSelect from './WrapSelect';
import ProfileEditor, { HeldGearError } from './ProfileEditor';
import { missingOf } from '@/planner/state/gear';
import type { PlanRef } from '@/planner/state/gear';
import { problemText, reducedFocalNote, siteProblems, usableSites } from '@/planner/profile';
import ResetAll from './ResetAll';
import OpenPlan from './OpenPlan';
import PlanRail, { RAIL_MIN_WIDTH, useMinWidth } from './PlanRail';
import type { PlanRow } from './OpenPlan';
import PlansBar from './PlansBar';
import ProjectsTab from './ProjectsTab';
import { sheetNames } from './projectNames';
import { useProjects } from './useProjects';
import PlanRowExposure, { Fold } from './PlanRowExposure';
import PlanRowMix from './PlanRowMix';
import type { AiSlotView } from './AiSlotMix';
import NarrowbandPanel from './NarrowbandPanel';
import RowHow from './RowHow';
import type { PlanLine } from './projectDraft';
import { nbRowView } from './nbRow';
import type { NbGear, NbRowTarget, NbView } from './nbRow';
import type { MixFilter } from '@/planner/filtermix';
import { mixSummary } from '@/planner/filtermix';
import { rowMix } from '@/planner/filtermix/row';
import type { RowMix, RowMixInput } from '@/planner/filtermix/row';
import { baseOf, minutesText, notUsedNoPresetText, presetLabel, rowExposure, splitWarnings, storedProblem, withNumber, withPreset } from './rowExposure';
import type { RowExposure } from './rowExposure';
import { useFavorites } from './useFavorites';
import TargetList, { Group } from './TargetList';
import type { RowDescription } from './TargetList';
import TargetSearch from './TargetSearch';
import { createNightScorer } from './nightScorer';
import { addDays, designationOf, fitReason, nameList, nightDateText, peakText, scorePartsText, sizeText, typeLabel, upRange } from './catalogText';
import { useCatalog } from './useCatalog';
import { useTonightList } from './useTonightList';

/** 24 h clock time in `timeZone` (IANA name), or in the browser's zone when none is given. */
const clockIn = (timeZone?: string): ((d: Date) => string) => {
  const f = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
  return (d) => f.format(d);
};

type RankedEntry = PlanEntry;

/** Stored plans the page holds back: the text (never written over) and why, which the box says. */
interface Held {
  text: string;
  why: 'newer' | 'nocopy' | 'othertab' | 'edited';
  /** Why the copy could not be made (`nocopy` only). */
  detail?: string;
}

const HELD_TITLE: Record<Held['why'], string> = {
  newer: 'Your saved plans were made by a newer version of the planner.',
  nocopy: 'Your saved plans could not be read whole, and a copy of them could not be kept first.',
  othertab: 'Another tab saved plans this page cannot use as they are.',
  edited: 'Another tab saved plans after this page held the saved ones back, and what you changed here is not saved.',
};

/** Where the copies are, in words: the name of the one just kept and how many are in this browser. */
function backupWhere(key: string): string {
  const n = listBackups(window.localStorage).length;
  return `under the backup name "${key}"; ${n} ${n === 1 ? 'backup is' : 'backups are'} kept in this browser`;
}

/** The plans text in storage, or null when there is none or storage cannot be read (a read that fails is said where plans are loaded). */
function readPlansText(): string | null {
  try {
    return window.localStorage.getItem(PLANS_KEY);
  } catch {
    return null;
  }
}

/** An edit refused because another tab saved gear first. The page has already said so; the message is for a form that shows it too. */
class StaleGearError extends Error {}

/** Why a gear edit is refused while the saved gear could not be loaded. */
const HELD_REFUSAL = 'Not saved. Your saved gear is kept as it is (the notice at the top of the page says why and what to do).';

/** What the page says when another tab has reset the saved data. */
const RESET_ELSEWHERE = 'The plans were reset in another tab, so this page starts fresh too.';

/** Above this share of the Moon lit at mid-night, the list says so in words. */
const BRIGHT_MOON = 0.8;

const TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'gear', label: 'Gear and site' },
  { id: 'projects', label: 'Projects' },
] as const;
type TabId = (typeof TABS)[number]['id'];

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
function NoFitNote({ counts, showNoFit, listed, nightWord }: { counts: RankResult['counts']; showNoFit: boolean; listed: number; nightWord: string }) {
  const total = counts.tooLarge + counts.tooSmall;
  if (total === 0) return null;
  return (
    <div className="mb-3 space-y-1 text-p-t1/80 font-normal text-sm" data-testid="hidden-note">
      {showNoFit ? (
        <p>
          Showing {listed} targets that do not fit this camera view in the group below the list
          {listed < total ? ` (${listed} of ${total}: only targets that are up ${nightWord} are listed)` : ''}.
        </p>
      ) : (
        <>
          {counts.tooLarge > 0 && <p>{counts.tooLarge} {counts.tooLarge === 1 ? 'target is' : 'targets are'} too big for your camera view.</p>}
          {counts.tooSmall > 0 && <p>{counts.tooSmall} {counts.tooSmall === 1 ? 'target is' : 'targets are'} too small for your camera view.</p>}
          <p>Tick “Show targets that do not fit”.</p>
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
  /** Who is signed in (the owner sees the AI plan's review switch); defaults to the session endpoint the sign-in control reads. */
  loadAuth?: () => Promise<AuthState>;
}

/** How long a toast stays up. */
const TOAST_MS = 6000;
/** How long "Added, #3 in the plan" stays next to the button. */
const ADDED_MS = 4000;
/** "Add top 3" adds this many. */
const TOP_N = 3;
/** The `added` id of a bulk add: no row's button, so only the bulk row shows its words. */
const TOP_ADDED_ID = '__top__';
/** A pause this long with no keystroke ends a run of typing in Minimum altitude. */
const MIN_ALT_PAUSE_MS = 600;

/** A site with no blocked zones; one array so memo keys stay stable. */
const NO_ZONES: readonly BlockedArc[] = [];

const fieldsOf = (arcs: readonly BlockedArc[]): HorizonFields[] => arcs.map(fieldsFromArc);

export default function PlannerApp({ initialDate, initialProfile, rank = rankTonightAsync, loadCatalogIndex = loadCatalog, aiFetch, loadAuth = loadAuthState }: PlannerAppProps) {
  const [profile, setProfile] = useState<Profile>(initialProfile ?? sampleProfile());
  const [notice, setNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  /** Saved gear this page could not load (the sample is shown instead): its text and what is wrong with it. Never written over by an edit; only Reset all or an import replaces it. */
  const [profileHeld, setProfileHeld] = useState<{ text: string; why: string } | null>(null);
  /** The saved plans' sites and trains, read while the page has no site it can use (the plans are not opened then), so Gear still knows what they use. */
  const [savedRefs, setSavedRefs] = useState<PlanRef[]>([]);
  /** Bumped when a horizon Save refuses and says so itself: the Gear section drops an older refusal, so the sentence shows once. */
  const [gearQuiet, setGearQuiet] = useState(0);
  // The saved plans and which one is open. The open plan owns the night's date, site and train (and its targets); null until the saved ones are read.
  const [plans, setPlans] = useState<PlansState | null>(null);
  const plansRef = useRef<PlansState | null>(null);
  // The plans text this tab last read or wrote: a different text in storage is another tab's save, taken up before this tab writes.
  const savedText = useRef<string | null>(null);
  // Stored plans this page must not write over until the user chooses (Replace the saved plans): made by a newer version, or text that could
  // not be read whole and could not be copied first. `held` is what the box says; the ref holds the text, for the write check.
  const [heldPlans, setHeldPlans] = useState<Held | null>(null);
  const heldRef = useRef<string | null>(null);
  // True once something was changed on this page while it held plans back: those changes are on screen only.
  const heldEdited = useRef(false);
  // What the page has to say about the saved plans (repaired, left out, not saved, reset elsewhere): shown above the tabs until dismissed, not as a toast.
  const [planMessages, setPlanMessages] = useState<string[]>([]);
  const sayPlans = useCallback((messages: readonly string[]) => setPlanMessages((prev) => [...prev, ...messages.filter((m) => !prev.includes(m))]), []);
  const favs = useFavorites();
  // The planner setting "Always restore favorites": kept with the site and train choice.
  const [alwaysRestore, setAlwaysRestore] = useState(false);
  // Find a target: the user's open or close; null follows the plan (open while it has no targets, one line once it has some).
  const [findOpen, setFindOpen] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabId>('plan');
  // The Projects tab is built the first time it is opened and kept (a half-made project survives a visit to the other tabs); the saved projects are read by the page at once, for Share.
  const [projectsSeen, setProjectsSeen] = useState(false);
  const projectsApi = useProjects();
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
  // The list's one Type selector: an id of `TYPE_GROUPS`; "Best [type] tonight" ranks that type over the whole catalog.
  const [type, setType] = useState<string>('all');
  const [showNoFit, setShowNoFit] = useState(false);
  // The row that is open (its detail shows in place); '' for none.
  const [openId, setOpenId] = useState<string>('');
  // The two groups under the list: the user's own open or close, else the default for the situation.
  const [planetsOpen, setPlanetsOpen] = useState<boolean | null>(null);
  const [notUpOpen, setNotUpOpen] = useState<boolean | null>(null);
  // The solar-system checklist ticks, "Body:item"; not saved.
  const [solarChecked, setSolarChecked] = useState<ReadonlySet<string>>(new Set());
  const toggleSolar = useCallback(
    (key: string) =>
      setSolarChecked((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  const [noFitOpen, setNoFitOpen] = useState(false);
  // The target just added, for a few seconds: said next to its button, and to a screen reader in the status line.
  const [added, setAdded] = useState<{ id: string; text: string; say: string } | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);
  // The empty plan's "Add top 3" button unmounts once rows appear: the keyboard goes to the first added row's Remove (else the plan heading), never the page body.
  const focusAfterTopThree = useRef<string | null>(null);
  useEffect(() => {
    if (focusAfterTopThree.current === null) return;
    const el = document.getElementById(`plan-remove-${focusAfterTopThree.current}`) ?? document.getElementById('open-plan-heading');
    if (el === null) return;
    focusAfterTopThree.current = null;
    el.focus();
  });
  const [zone, setZone] = useState<string>('');
  // The sticky strip: closed it is one line (date, site, train); open it holds the controls. The page's fixed header and the strip
  // are measured so the column titles and anchors stop below them.
  const [controlsOpen, setControlsOpen] = useState(false);
  const stripRef = useRef<HTMLElement>(null);
  const [stickyTop, setStickyTop] = useState({ nav: 0, strip: 0 });
  // The plan rail (from 1024 px): the timeline's own plan, handed up each time it is built, so the rail's Light and time windows are the timeline's numbers, not a second calculation.
  const railWide = useMinWidth(RAIL_MIN_WIDTH);
  const [timelinePlan, setTimelinePlan] = useState<ItineraryPlan | null>(null);
  const [timelineTick, setTimelineTick] = useState(0);
  // The site header's slot for the Night mode toggle and Sign in (the slim header on this page); undefined until looked for, null when the page has none (the header row below keeps them).
  const [navSlot, setNavSlot] = useState<HTMLElement | null | undefined>(undefined);
  useLayoutEffect(() => setNavSlot(document.getElementById('planner-nav-actions')), []);
  // "Change or find a site": a count that the site editor answers by opening its Site list with the Find box focused.
  const [findSiteTick, setFindSiteTick] = useState(0);
  const [openTrainTick, setOpenTrainTick] = useState(0);
  // The print sheet is built only while the browser is printing (Print button or Ctrl+P), so it costs the page nothing otherwise.
  const [printing, setPrinting] = useState(false);
  // The Share sheet: open or closed, what it shares (also what Print prints while the sheet is open; closed, Print and Ctrl+P print the open plan), when it was opened (the time written in a JSON file), and the import flow.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareWhat, setShareWhat] = useState<ShareWhat>('plan');
  const [sharedAt, setSharedAt] = useState('');
  const [importPanel, setImportPanel] = useState<ImportPanel>({ kind: 'none' });
  const pendingImport = useRef<{ plans: Plan[]; notices: string[] } | null>(null);
  // The night timeline leaves its current plan here; the print sheet reads it when printing starts (no re-render on every change).
  const itineraryReport = useRef<PlanTimelineReport | null>(null);
  // Who is signed in: the sign-in control at the top shows it, and the owner sees the AI plan's review switch; a failed read leaves the page as a guest's.
  const [auth, setAuth] = useState<AuthState>({ kind: 'signedOut' });
  const owner = auth.kind === 'signedIn' && auth.owner;
  // Reset all: the count asks for focus on the button once the page has settled.
  const [resetFocus, setResetFocus] = useState(0);
  // Filters the user added to the filter mix beside the setup's own filter (ids). Not stored: the setup's filter is the default, never "all".
  const [mixPicks, setMixPicks] = useState<ReadonlySet<string>>(new Set());
  // The narrowband panel's own entries, by target id: the broadband hours typed (absent: the row's planned light) and the ticks the user set (absent: the engine's recommendation). Not stored.
  const [nbHours, setNbHours] = useState<ReadonlyMap<string, string>>(new Map());
  const [nbTicks, setNbTicks] = useState<ReadonlyMap<string, ReadonlyMap<string, boolean>>>(new Map());
  const setNbHoursFor = useCallback((id: string, text: string) => setNbHours((prev) => new Map(prev).set(id, text)), []);
  const setNbTickFor = useCallback((id: string, filterId: string, on: boolean) => setNbTicks((prev) => new Map(prev).set(id, new Map(prev.get(id)).set(filterId, on))), []);
  useEffect(() => {
    if (resetFocus > 0) document.getElementById('reset-all')?.focus();
  }, [resetFocus]);
  useEffect(() => {
    let live = true;
    loadAuth().then(
      (a) => live && setAuth(a),
      (e) => console.error(e),
    );
    return () => {
      live = false;
    };
  }, [loadAuth]);

  // The tabs follow the address: #plan and #gear, and a link to anything inside a tab (#horizon, #gear-heading) opens that tab first.
  const land = useCallback(() => {
    const id = window.location.hash.slice(1);
    if (id === 'plan' || id === 'gear' || id === 'projects') {
      setTab(id);
      return;
    }
    const el = id === '' ? null : document.getElementById(id);
    const panel = el?.closest<HTMLElement>('[role="tabpanel"]');
    if (el && panel) {
      setTab(panel.id === 'panel-gear' ? 'gear' : panel.id === 'panel-projects' ? 'projects' : 'plan');
      requestAnimationFrame(() => el.scrollIntoView());
    }
  }, []);
  useEffect(() => {
    if (tab === 'projects') setProjectsSeen(true);
  }, [tab]);
  useEffect(() => {
    land();
    window.addEventListener('hashchange', land);
    window.addEventListener('popstate', land);
    return () => {
      window.removeEventListener('hashchange', land);
      window.removeEventListener('popstate', land);
    };
  }, [land]);
  /** The one way a tab is chosen by the user: the address follows, so Back and a shared link return to it. */
  const selectTab = (next: TabId) => {
    setTab(next);
    if (window.location.hash !== `#${next}`) window.history.pushState(null, '', `#${next}`);
  };

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

  // Targets the 50-target limit left out of a carried-over plan are said by name: the catalog is read for the names (their ids when it cannot be).
  const catalogLoader = useRef(loadCatalogIndex);
  catalogLoader.current = loadCatalogIndex;
  const cutNames = useCallback(
    (ids: string[]) => {
      const planet = (id: string) => SLOT_BODIES.find((b) => planetIdOf(b) === id) ?? id;
      catalogLoader.current().then(
        (index) => {
          const names = new Map(index.targets.map((t) => [t.id, t.name]));
          sayPlans([cutMessage(ids, (id) => names.get(id) ?? planet(id))]);
        },
        (e) => {
          console.error(e);
          sayPlans([cutMessage(ids, planet)]);
        },
      );
    },
    [sayPlans],
  );
  // Browser-only state: saved profile, captured list, plans, the clock. Read again, whole, when another tab resets the page's data. `lead` is said first.
  const loadAll = useCallback((lead: string | null = null) => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    try {
      setCaptured(loadCaptured(window.localStorage));
    } catch (e) {
      setNotice((e as Error).message);
    }
    let loaded = initialProfile;
    if (!loaded) {
      const r = loadProfile({ getItem: (k) => window.localStorage.getItem(k) }); // the getter itself throws when storage is blocked
      loaded = r.profile;
      setProfile(r.profile);
      // The text in storage is what this page last read; a saved profile it could not load (r.held) is held back, never written over by an edit.
      try {
        profileText.current = r.stored ? window.localStorage.getItem(PROFILE_KEY) : r.held;
      } catch {
        profileText.current = null;
      }
      setProfileHeld(r.held !== null && r.error !== null ? { text: r.held, why: r.error } : null);
      if (r.error && r.held === null) setImportError(r.error);
      const flagged = gearProblems(r.profile).length;
      const sites = siteProblems(r.profile);
      const said = [
        flagged > 0 ? `${flagged === 1 ? 'One saved gear value is' : `${flagged} saved gear values are`} not usable (outside the allowed range or not a number), so the planner does not use ${flagged === 1 ? 'it' : 'them'}. Open Gear to change ${flagged === 1 ? 'it' : 'them'}.` : '',
        ...sites.map((x) => `Site "${x.siteName}": ${problemText(x, 'this site')} Open Gear, Sites to change it.`),
      ].filter((x) => x !== '');
      if (said.length > 0) setNotice(said.join(' '));
    }
    // The site and train last chosen; one that is gone from the profile falls back to the first, as before.
    let remembered = null;
    try {
      remembered = loadSelection(window.localStorage);
    } catch (e) {
      setNotice((e as Error).message);
    }
    const loadedUsable = usableSites(loaded);
    const home = loadedUsable.find((s) => s.id === remembered?.siteId) ?? loadedUsable[0];
    const homeTrain = loaded.trains.find((t) => t.id === remembered?.trainId) ?? loaded.trains[0];
    setType(typeGroupOf(remembered?.typeId).id); // a type that no longer exists is All
    setAlwaysRestore(remembered?.alwaysRestore === true);
    loadForm(home?.blockedArcs ?? [], true);
    const startDate = initialDate ?? defaultDateForProfile(new Date(), home ? { ...loaded, sites: [home] } : loaded);
    if (home && homeTrain) {
      // The saved plans. None saved: the My plan list and night itinerary of before there were plans become the first plan (once; the old copies
      // are removed when the plans are saved), or one empty plan starts, which is not saved until it is changed.
      const defaults: PlanDefaults = { date: startDate, siteId: home.id, trainId: homeTrain.id, now: new Date().toISOString() };
      let state: PlansState | null = null;
      const said: string[] = lead === null ? [] : [lead];
      let held: Held | null = null;
      let copySaid: string | null = null;
      try {
        const r = loadPlans(window.localStorage, startDate, nightDateText);
        state = r.state;
        if (r.unusable?.kind === 'newer') held = { text: r.unusable.text, why: 'newer' };
        else if (r.unusable !== null) {
          // Damaged or repaired: the text stays in storage until the next save, so a copy goes to a backup key of its own first. When that copy
          // cannot be made (the write fails), the text is held like a newer version's: not written over until the user chooses.
          try {
            const key = keepCopy(window.localStorage, r.unusable.text);
            copySaid = `A copy of the saved plans as they were is kept ${backupWhere(key)}.`;
          } catch (e) {
            held = { text: r.unusable.text, why: 'nocopy', detail: (e as Error).message };
          }
        }
        // The held box says what held plans are; the line does not say it again.
        said.push(...r.notices.filter((n) => held === null || (n !== NEWER_NOTICE && n !== DAMAGED_NOTICE)));
        if (copySaid !== null) said.push(copySaid);
      } catch (e) {
        said.push((e as Error).message);
      }
      if (state === null) {
        // The My plan list and night itinerary of before there were plans become the first plan (once), or one empty plan starts, which is not
        // saved until it is changed. Nothing is carried over while newer-version plans are held: the old keys wait.
        let migrated = null;
        let clear: string[] = [];
        if (held === null) {
          try {
            const m = migrateOldPlan(window.localStorage, defaults);
            migrated = m.plan;
            clear = m.clear;
            said.push(...m.problems);
            if (m.cut.length > 0) cutNames(m.cut);
          } catch (e) {
            said.push((e as Error).message);
          }
        }
        state = startPlans(defaults, migrated);
        if (migrated !== null || clear.length > 0) {
          // What was readable is saved as the first plan; only then are the old copies that were carried over or damaged removed (one that could not be read stays).
          let saved = false;
          try {
            if (migrated !== null) savePlans(window.localStorage, state);
            saved = true;
          } catch (e) {
            said.push(`Your plan was carried over but could not be saved: ${(e as Error).message}. Your old plan stays in this browser and is carried over again the next time the page opens.`);
          }
          if (saved) {
            try {
              clearOldPlanKeys(window.localStorage, clear);
            } catch (e) {
              said.push(`Your plan was saved, but ${(e as Error).message}. The saved plan is used from now on, so nothing you see changes.`);
            }
          }
        }
      }
      setPlanMessages(said);
      setHeldPlans(held);
      heldRef.current = held?.text ?? null;
      heldEdited.current = false;
      savedText.current = readPlansText();
      plansRef.current = state;
      setPlans(state);
      const open = state.plans.find((p) => p.id === state.openId)!;
      const openSite = loadedUsable.find((x) => x.id === open.siteId) ?? loadedUsable[0];
      if (openSite && openSite.id !== home.id) loadForm(openSite.blockedArcs, true);
      setSavedRefs([]);
    } else {
      // No site to plan for: the plans are not opened, but what they use is read so a site card never says "Not used." for a site a plan uses.
      try {
        const r = loadPlans(window.localStorage, startDate, nightDateText);
        setSavedRefs(r.state?.plans.map((p) => ({ id: p.id, name: p.name, siteId: p.siteId, trainId: p.trainId })) ?? []);
      } catch (e) {
        setSavedRefs([]);
        setNotice((e as Error).message);
      }
    }
  }, [initialDate, initialProfile, cutNames]);
  useEffect(() => loadAll(), [loadAll]);

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
    // A long message about saved plans needs time to read: about 60 ms a character, never under the usual time.
    const t = setTimeout(() => setNotice(null), Math.max(TOAST_MS, notice.length * 60));
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!importError || profile.sites.length === 0 || profile.trains.length === 0) return;
    const t = setTimeout(() => setImportError(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [importError, profile]);

  /** The profile text this page last read from or wrote to storage; a different text in storage was saved by another tab. */
  const profileText = useRef<string | null>(null);
  const readProfileText = (): string | null => {
    try {
      return window.localStorage.getItem(PROFILE_KEY);
    } catch {
      return null; // the save that follows says storage is unavailable
    }
  };
  /** Writes the profile and remembers the text written, so this page's own save is not mistaken for another tab's. */
  const storeProfile = (next: Profile) => {
    saveProfile(window.localStorage, next);
    profileText.current = readProfileText();
  };
  /** Another tab saved gear: this page shows it (nothing here is written over it). Text this version cannot read is not adopted, and this page says so. */
  const adoptProfile = (text: string): boolean => {
    try {
      const next = parseProfile(text, { lenient: true });
      profileText.current = text;
      setProfileHeld(null); // another tab saved gear this page can read: the held copy is no longer what is stored
      setProfile(next);
      const nextUsable = usableSites(next);
      const here = nextUsable.find((x) => x.id === (open?.siteId ?? site?.id)) ?? nextUsable[0];
      if (here && !dirty) loadForm(here.blockedArcs, false);
      return true;
    } catch (e) {
      if (!(e instanceof ProfileError)) throw e;
      setNotice('Another tab saved gear this page cannot read. This page keeps what it has and will not save over it. Reload the page to see the saved gear.');
      return false;
    }
  };
  /** Throws, in words, when another tab saved gear since this page last looked: this page then shows that gear and the edit is not made. */
  const refuseIfStale = () => {
    if (profileHeld !== null) throw new HeldGearError(HELD_REFUSAL);
    const stored = readProfileText();
    if (stored !== null && stored !== profileText.current) {
      if (adoptProfile(stored)) {
        throw new StaleGearError('Another tab changed your gear since this page last looked, so your last edit was not made. This page now shows the other tab\u2019s gear. Make the edit again.');
      }
      throw new StaleGearError('Not saved: another tab saved gear this page cannot read. Reload the page.');
    }
  };
  /** Stores an edited profile. The edit has been validated. It throws, in words, when it is not saved: another tab saved gear since this page last looked, or storage failed. */
  const applyProfile = (next: Profile) => {
    refuseIfStale();
    const wasUsable = usableSites(profile).length > 0;
    try {
      storeProfile(next);
    } catch (e) {
      setProfile(next); // the edit stays on screen for this visit, said as not saved; the editor clears its "Saved" line and shows this
      throw new Error(`Not saved, so this change is lost on reload: ${(e as Error).message}`);
    }
    setProfile(next);
    // The page had no site it could use and this edit gave it one: read the page's state again from what is now stored, as a reload would.
    if (!wasUsable && usableSites(next).length > 0) loadAll();
  };

  const open = plans?.plans.find((p) => p.id === plans.openId) ?? null;
  // The open plan's night, site and train; a site or train that is gone from the profile is the first, as before.
  const date = open?.date ?? initialDate ?? '';
  const usable = usableSites(profile);
  const site = usable.find((s) => s.id === open?.siteId) ?? usable[0];
  const train = profile.trains.find((t) => t.id === open?.trainId) ?? profile.trains[0];
  /** Stored plans this page must not write over (found after it loaded): kept, said, and not saved over until the user chooses. */
  const holdText = (text: string, why: Held['why']) => {
    heldRef.current = text;
    setHeldPlans({ text, why });
  };
  /** Makes the next state of the plans (a change that may be refused, say at the limit: said, nothing changes), keeps it and stores it. The horizon form follows the open plan's site. */
  const commitPlans = (change: (s: PlansState) => PlansState): boolean => {
    let prev = plansRef.current;
    if (prev === null) return false;
    // Another tab may have saved since this one last looked: start from its plans, or this write would erase them. Plans of a newer version, text
    // this version cannot read whole, or no plans at all (reset in another tab) are never written over: the first two are held, the last reloads the page.
    if (heldRef.current === null) {
      const text = readPlansText();
      if (text === null && savedText.current !== null) {
        loadAll(RESET_ELSEWHERE);
        sayPlans(['Your last change was not made: the plans on this page were gone from this browser.']);
        return false;
      }
      if (text !== null && text !== savedText.current) {
        const found = inspectStored(prev, text);
        if (found.kind === 'plans') prev = found.state;
        else {
          heldEdited.current = false;
          holdText(text, found.kind === 'newer' ? 'newer' : 'othertab');
        }
      }
    }
    let next: PlansState;
    try {
      next = change(prev);
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    }
    plansRef.current = next;
    setPlans(next);
    const siteOf = (st: PlansState) => usable.find((x) => x.id === st.plans.find((p) => p.id === st.openId)?.siteId) ?? usable[0];
    const to = siteOf(next);
    if (to && siteOf(prev)?.id !== to.id) loadForm(to.blockedArcs, false);
    if (heldRef.current !== null) {
      heldEdited.current = true;
      setNotice('Not saved: the saved plans are left untouched. Use "Replace the saved plans" to save from here.');
      return true;
    }
    try {
      savePlans(window.localStorage, next);
      savedText.current = readPlansText();
    } catch (e) {
      sayPlans([`Plans not saved, so they are lost on reload: ${(e as Error).message}`]);
    }
    return true;
  };
  /**
   * The plans text in storage is not what this page has (it was saved by another tab). Readable plans are shown here, the open plan staying open;
   * a page that was holding plans back leaves that state when it has no changes of its own on screen, and says so. Text this version cannot use
   * is held, and a held page keeps following: the held text is always the latest stored.
   */
  const takeStored = (text: string) => {
    const prev = plansRef.current;
    if (prev === null) return;
    const found = inspectStored(prev, text);
    const wasHeld = heldRef.current !== null;
    if (found.kind !== 'plans') {
      if (!wasHeld) heldEdited.current = false;
      holdText(text, found.kind === 'newer' ? 'newer' : 'othertab');
      return;
    }
    if (wasHeld && heldEdited.current) {
      holdText(text, 'edited');
      return;
    }
    const next = found.state;
    savedText.current = text;
    plansRef.current = next;
    setPlans(next);
    const siteOf = (st: PlansState) => usable.find((x) => x.id === st.plans.find((p) => p.id === st.openId)?.siteId) ?? usable[0];
    const to = siteOf(next);
    if (to && siteOf(prev)?.id !== to.id) loadForm(to.blockedArcs, false);
    if (wasHeld) {
      heldRef.current = null;
      setHeldPlans(null);
      sayPlans(['Another tab saved plans while this page held the saved ones back. This page now shows them and saves again.']);
    }
  };
  // Another tab saved plans: this tab shows them (its own open plan stays open). Kept in a ref so the one listener reads this render's profile.
  const onStorage = useRef<(e: StorageEvent) => void>(() => undefined);
  onStorage.current = (e: StorageEvent) => {
    // Reset all or a clear in another tab: nothing is saved any more, so this page starts fresh too (its own copy would otherwise be written back).
    if ((e.key === null || e.key === PLANS_KEY) && e.newValue === null) {
      if (readPlansText() === null && (savedText.current !== null || heldRef.current !== null)) loadAll(RESET_ELSEWHERE);
      return;
    }
    if (e.key === PROFILE_KEY && e.newValue !== null && e.newValue !== profileText.current) {
      if (adoptProfile(e.newValue)) setNotice('Another tab changed your gear. This page now shows it.');
      return;
    }
    if (e.key !== PLANS_KEY || e.newValue === null) return;
    if (heldRef.current === null || e.newValue !== heldRef.current) takeStored(e.newValue);
  };
  // A held page that was not looking (another window had focus, the tab was hidden or frozen) checks again when it is: no event may have reached it.
  const onWake = useRef<() => void>(() => undefined);
  onWake.current = () => {
    if (heldRef.current === null || document.visibilityState === 'hidden') return;
    const text = readPlansText();
    if (text === null) loadAll(RESET_ELSEWHERE);
    else if (text !== heldRef.current) takeStored(text);
  };
  useEffect(() => {
    const on = (e: StorageEvent) => onStorage.current(e);
    const wake = () => onWake.current();
    window.addEventListener('storage', on);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.removeEventListener('storage', on);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, []);
  /**
   * "Replace the saved plans": the user chose to save the plans on screen over the stored text. What is in storage now (not what was read at load)
   * is copied to the backup key first; any old My plan list or night timeline held back is carried over into the plans saved, so nothing stays unseen.
   */
  const replaceHeldPlans = () => {
    const st = plansRef.current;
    if (heldRef.current === null || st === null) return;
    let target = st;
    let clear: string[] = [];
    let copied = '';
    const said: string[] = [];
    try {
      const current = window.localStorage.getItem(PLANS_KEY);
      if (current === null) copied = 'Nothing was stored, so no copy was needed.';
      else copied = `A copy of what was stored is kept ${backupWhere(keepCopy(window.localStorage, current))}.`;
      const home = usable.find((x) => x.id === open?.siteId) ?? usable[0];
      const homeTrain = profile.trains.find((x) => x.id === open?.trainId) ?? profile.trains[0];
      const m = migrateOldPlan(window.localStorage, { date: open?.date ?? date, siteId: home?.id ?? '', trainId: homeTrain?.id ?? '', now: new Date().toISOString() });
      said.push(...m.problems);
      if (m.cut.length > 0) cutNames(m.cut);
      if (m.plan !== null) {
        target = withMigratedPlan(st, m.plan);
        said.push('Your old plan and night timeline from before plans were carried over as one more plan.');
      }
      clear = m.clear;
      savePlans(window.localStorage, target);
    } catch (e) {
      sayPlans([`Not replaced, the saved plans are untouched: ${(e as Error).message}`]);
      return;
    }
    if (clear.length > 0) {
      try {
        clearOldPlanKeys(window.localStorage, clear);
      } catch (e) {
        said.push(`Your plans were saved, but ${(e as Error).message}.`);
      }
    }
    savedText.current = readPlansText();
    plansRef.current = target;
    setPlans(target);
    heldRef.current = null;
    heldEdited.current = false;
    setHeldPlans(null);
    sayPlans(['The saved plans were replaced.', copied, ...said]);
  };
  /** A change to the open plan: its date, site, train, start time or targets. */
  const editOpen = (patch: Parameters<typeof updatePlan>[2]) => commitPlans((st) => updatePlan(st, st.openId, patch, new Date().toISOString()));
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
  // Keyboard focus (Shift+Tab, Tab) scrolls its target below the bars, not under them: `html` is the scroll container, so it carries the bars' height.
  const barsHeight = stickyTop.nav + stickyTop.strip;
  useEffect(() => {
    const root = document.documentElement;
    root.style.scrollPaddingTop = `${barsHeight}px`;
    // Chrome's own focus scroll can stop 12 px short when the target is mostly in view (a field found 6 to 28 px under the strip stays there), so once the scroll has settled the page checks and finishes the job.
    let frame = 0;
    const onFocusIn = (ev: FocusEvent) => {
      const el = ev.target;
      if (!(el instanceof HTMLElement) || el.closest('nav.fixed, section[aria-labelledby="controls-heading"]')) return;
      cancelAnimationFrame(frame);
      let last = Number.NaN;
      let still = 0;
      const settle = () => {
        still = window.scrollY === last ? still + 1 : 0;
        last = window.scrollY;
        if (still < 4) {
          frame = requestAnimationFrame(settle);
          return;
        }
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.top < barsHeight - 1 && r.bottom > 0) window.scrollBy({ top: r.top - barsHeight });
      };
      frame = requestAnimationFrame(settle);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', onFocusIn);
      root.style.removeProperty('scroll-padding-top');
    };
  }, [barsHeight]);
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
      withSiteArcs(profile, site.id, [next]); // this zone alone; zones may overlap
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
    const arcs = fields.map((f, i) => effectiveArc(f, errs[i], bases[i] ?? null, checkArc));
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

  // The night is cheap and needed at once (the planets, the timeline, the labels); the ranking over the catalog is not, so it runs off the main thread.
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
  // The type goes to the ranker, which cuts the best 100 within it over the whole catalog (never the mixed top 100 filtered afterwards).
  // All and Solar system share one query, so moving between them does not rank again.
  const group = typeGroupOf(type);
  const isSolar = group.id === SOLAR_SYSTEM;
  const rankTypes = group.types;
  const rankQuery = useMemo<TonightQuery | null>(
    () => (planning.base !== null && hasNight ? { ...planning.base, includeNoFit: showNoFit, limit: LIST_LIMIT, types: rankTypes } : null),
    [planning.base, hasNight, showNoFit, rankTypes],
  );
  const scorer = useMemo(() => (planning.base !== null && hasNight ? createNightScorer(planning.base) : null), [planning.base, hasNight]);
  const { state: tonight, retry: retryTonight } = useTonightList(rank, rankQuery);
  const { state: catalog, retry: retryCatalog } = useCatalog(loadCatalogIndex);
  const catalogById = useMemo(() => (catalog.status === 'ready' ? new Map(catalog.index.targets.map((t) => [t.id, t])) : null), [catalog]);

  const ranked = useMemo(() => (tonight.status === 'ready' ? tonight.result : null), [tonight]);
  // The Moon and planets that are up sit beside the best 100 as the "Solar system" group: Type = Solar system shows only that group, All shows it above the targets.
  const mainList = useMemo((): readonly PlanEntry[] => (ranked === null || isSolar ? [] : ranked.entries), [ranked, isSolar]);
  // The ranker lists the planets; the Moon is scored by the same single-target path as the search and joins them when it is up.
  const moonEntry = useMemo(() => scorer?.planet('Moon') ?? null, [scorer]);
  const bodiesUp = useMemo((): readonly PlanEntry[] => {
    if (ranked === null) return [];
    const bodies = moonEntry !== null && moonEntry.usableMinutes > 0 ? [...ranked.planets, moonEntry] : ranked.planets;
    return [...bodies].sort((x, y) => y.score.total - x.score.total);
  }, [ranked, moonEntry]);
  // The Solar system group shows in All and in Solar system; a deep-sky type shows its own list alone.
  const showsBodies = group.types === undefined;
  const planetGroup = useMemo((): readonly PlanEntry[] => (showsBodies ? bodiesUp : []), [showsBodies, bodiesUp]);
  // The bodies that are not up that night keep their rows (and their detail), under "Not up", never ranked and never counted as up.
  const notUpGroup = useMemo((): readonly PlanEntry[] => {
    if (scorer === null || !showsBodies) return [];
    const up = new Set(planetGroup.map((e) => e.id));
    return SLOT_BODIES.map((b) => scorer.planet(b)).filter((e) => !up.has(e.id));
  }, [scorer, showsBodies, planetGroup]);
  const noFitList = useMemo((): readonly PlanEntry[] => (ranked !== null && showNoFit && !isSolar ? ranked.noFit : []), [ranked, showNoFit, isSolar]);
  // The per-type counts belong to the night, site, horizon and train, not to the type chosen: the last answer's counts stay on the
  // options while the list for another type is on its way, and go the moment the night or the train changes.
  const countsMemo = useRef<{ base: unknown; counts: Readonly<Record<string, number>>; notFit: RankResult['typeNotFit']; solarUp: number } | null>(null);
  if (ranked !== null) countsMemo.current = { base: planning.base, counts: ranked.typeCounts, notFit: ranked.typeNotFit, solarUp: bodiesUp.length };
  const typeCounts = countsMemo.current !== null && countsMemo.current.base === planning.base ? countsMemo.current : null;
  // Everything the Type filter lets through, in reading order: what Export and Print carry.
  const filtered = useMemo(() => [...mainList, ...planetGroup], [mainList, planetGroup]);
  const openEntry = useMemo(() => [...mainList, ...planetGroup, ...notUpGroup, ...noFitList].find((e) => e.id === openId), [mainList, planetGroup, notUpGroup, noFitList, openId]);
  // Where the page lists a target, said in the search result when it is there.
  const listedAs = (id: string): string | undefined => {
    const place = mainList.findIndex((e) => e.id === id);
    if (place >= 0) return `#${place + 1} in the list below.`;
    if (planetGroup.some((e) => e.id === id)) return 'Listed under Solar system below.';
    if (notUpGroup.some((e) => e.id === id)) return 'Listed under Solar system, Not up, below.';
    if (noFitList.some((e) => e.id === id)) return 'Listed under “Does not fit this camera view” below.';
    return undefined;
  };

  const isTonight = date === '' || date === tonightDate;
  const nightWord = isTonight ? 'tonight' : nightDateText(date);

  // The open plan's targets resolved for the night: a catalog target or a planet, scored by the same single-target path as the search.
  const planTargets = useMemo((): readonly PlanTargetRef[] => open?.targets ?? [], [open]);
  const planIds = useMemo(() => planTargets.map((t) => t.id), [planTargets]);
  const planItems = useMemo(
    () =>
      planTargets.map((ref) => {
        const id = ref.id;
        const target = catalogById?.get(id);
        const body = SLOT_BODIES.find((b) => planetIdOf(b) === id);
        const entry = body !== undefined ? (scorer?.planet(body) ?? null) : target !== undefined ? (scorer?.target(target) ?? null) : null;
        return { id, ref, target, body, entry };
      }),
    [planTargets, catalogById, scorer],
  );

  const planIdSet = useMemo(() => new Set(planIds), [planIds]);
  // Find a target is open while the open plan has no targets and one line once it has some, unless the user opened or closed it.
  const findIsOpen = findOpen ?? planTargets.length === 0;
  // A plan that was opened afresh starts from the plan's own rule again.
  const openPlanId = plans?.openId ?? '';
  useEffect(() => setFindOpen(null), [openPlanId]);
  // The narrowband panel's typed hours and ticks belong to the plan they were made on.
  useEffect(() => {
    setNbHours(new Map());
    setNbTicks(new Map());
  }, [openPlanId]);

  // What the engine computes for each deep-sky row on the plan's night, site, train and Moon: the same inputs the timeline resolves a slot with.
  const catalogTargets = catalog.status === 'ready' ? (catalog.index.targets as readonly SlotTarget[]) : null;
  const bortleOfSite = site?.bortle ?? DEFAULT_BORTLE;
  const viewOf = useCallback(
    (ref: PlanTargetRef, entry: PlanEntry | null): RowExposure => {
      if (!train || !astroSite) return { kind: 'none', reason: 'Numbers appear once the night has loaded.' };
      const slot = slotInputFor(
        { id: ref.id, targetId: ref.id, trainId: train.id, filterId: train.kind === 'optical' ? (train.filterId ?? null) : null, mode: baseOf(ref), note: '' },
        profile,
        catalogTargets ?? [],
      );
      return rowExposure(ref, slot, entry, astroSite, bortleOfSite);
    },
    [train, astroSite, profile, catalogTargets, bortleOfSite],
  );
  const rowViews = useMemo(() => new Map(planItems.filter((p) => p.body === undefined).map((p) => [p.id, viewOf(p.ref, p.entry)] as const)), [planItems, viewOf]);

  // The filter mix: the filters of the setup (its own filter, then any the user added beside it), each with the passbands the gear holds.
  const mixFilters = useMemo((): MixFilter[] => {
    if (!train || train.kind !== 'optical') return [];
    const ids = [...(train.filterId === undefined ? [] : [train.filterId]), ...[...mixPicks].filter((id) => id !== train.filterId)];
    return ids.flatMap((id) => {
      const f = profile.equipment.filters.find((x) => x.id === id);
      return f === undefined ? [] : [{ id: f.id, name: f.name, bands: f.passbands }];
    });
  }, [train, mixPicks, profile]);
  const noMixFilters = !train ? 'No setup chosen.' : train.kind !== 'optical' ? 'Smart scope: filter built in, so no filter mix.' : 'No filter in this setup. Pick one under Setup.';
  // The timeline's plan, once it is worked out for this night and site (the rail reads it the same way); null before then, and the row's own light stands in.
  const mixTimeline = stableNight && astroSite && catalog.status !== 'loading' ? timelinePlan : null;
  /** The light one plan target gets on a timeline: the timeline's slot for it (the same light the sheet and the timeline show); a target the timeline leaves out has none. */
  const lightFor = useCallback(
    (id: string, timeline: ItineraryPlan | null): RowMixInput['light'] => {
      const view = rowViews.get(id);
      const slot = timeline?.slots.find((s) => s.id === id);
      const scheduled = slot !== undefined && slot.altitudes !== null && slot.end.getTime() > slot.start.getTime();
      return view?.kind !== 'ok'
        ? { kind: 'none', reason: view?.reason ?? '' }
        : timeline === null
          ? { kind: 'ok', minutes: view.chosen.integrationMin, usableMinutes: view.usableMinutes }
          : { kind: 'ok', minutes: scheduled ? (slot as { integrationMin: number }).integrationMin : 0, usableMinutes: scheduled ? view.usableMinutes : 0 };
    },
    [rowViews],
  );
  // The narrowband panel's gear: the open plan's train and camera, or why there is none.
  const nbGear = useMemo((): NbGear | { problem: string } => {
    if (!train) return { problem: 'No setup chosen.' };
    if (train.kind !== 'optical') return { problem: 'Smart scope: no narrowband to add.' };
    if (planTrain === null || planTrain.kind !== 'optical' || planTrain.optics === null) return { problem: trainError ?? 'Setup numbers incomplete. Add them in Gear.' };
    const camera = resolveTrain(profile, train).cameraSpec;
    return { fRatio: planTrain.optics.focalRatio, focalLengthMm: planTrain.optics.focalLengthMm, pixelUm: camera?.pixelSizeUm, colour: camera?.colour, readNoiseClass: camera?.readNoiseClass };
  }, [train, planTrain, trainError, profile]);
  /** What the narrowband panel shows for one plan target on a timeline: the row's, the text export's and the AI result's all come from here. */
  const nbOf = useCallback(
    ({ id, body, target, ref }: NbRowTarget, timeline: ItineraryPlan | null): NbView =>
      nbRowView({
        body: body !== undefined,
        target: target === undefined ? null : { id: target.id, type: target.type, surfaceBrightness: target.surfaceBrightness },
        light: lightFor(id, timeline),
        gear: nbGear,
        bortle: bortleOfSite,
        bortleAssumed: site?.bortle === undefined,
        knee: baseOf(ref),
        filters: profile.equipment.filters,
        hoursText: nbHours.get(id),
        ticks: nbTicks.get(id),
      }),
    [lightFor, nbGear, bortleOfSite, site, profile, nbHours, nbTicks],
  );
  /** One plan target's filter mix on a timeline: the plan row's, the text export's and the AI result's all come from here. */
  const mixOf = useCallback(
    (p: NbRowTarget, timeline: ItineraryPlan | null): RowMix => {
      const { id, body, target } = p;
      if (body === undefined && target === undefined && catalog.status === 'loading') return { kind: 'message', text: 'Catalog still loading.' };
      const nb = nbOf(p, timeline);
      return rowMix({
        body: body !== undefined,
        target: target === undefined ? null : { id: target.id, type: target.type },
        light: lightFor(id, timeline),
        filters: mixFilters,
        noFilters: noMixFilters,
        narrowband: nb.kind === 'panel' ? { result: nb.result, ticked: nb.ticked, broadbandMin: Math.round(nb.hours * 60) } : undefined,
      });
    },
    [lightFor, nbOf, mixFilters, noMixFilters, catalog.status],
  );
  const mixViews = useMemo(() => new Map(planItems.map((p): [string, RowMix] => [p.id, mixOf(p, mixTimeline)])), [planItems, mixOf, mixTimeline]);
  const nbViews = useMemo(() => new Map(planItems.map((p): [string, NbView] => [p.id, nbOf(p, mixTimeline)])), [planItems, nbOf, mixTimeline]);

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

  /** Remembers the site and train chosen at the top, so a reload opens on them. */
  const rememberSelection = (nextSiteId: string, nextTrainId: string, nextType: string = type, nextAlways: boolean = alwaysRestore) => {
    try {
      saveSelection(window.localStorage, { siteId: nextSiteId, trainId: nextTrainId, typeId: nextType, alwaysRestore: nextAlways });
    } catch (e) {
      setNotice(`Site, train, type and settings choice not saved, so it is lost on reload: ${(e as Error).message}`);
    }
  };

  /** The one way the list's Type changes. */
  const chooseType = (id: string) => {
    const next = typeGroupOf(id).id;
    setType(next);
    if (site && train) rememberSelection(site.id, train.id, next);
  };

  /** The one way the Train changes: the select and the planetary note's button both end here. */
  const chooseTrain = (id: string) => {
    if (!site) return;
    editOpen({ trainId: id });
    rememberSelection(site.id, id);
  };

  /** What each saved plan points at, for the Gear section's "used by" check. */
  const planRefs = useMemo(() => plans?.plans.map((p) => ({ id: p.id, name: p.name, siteId: p.siteId, trainId: p.trainId })) ?? savedRefs, [plans, savedRefs]);
  /** The open plan's site or train that is no longer in the gear: said in the plan, with what is shown instead; nothing is changed until the user keeps or picks one. */
  const staleNotes = useMemo(() => {
    const m = missingOf(profile, open);
    const notes: { key: string; text: string; keepLabel: string; onKeep: () => void }[] = [];
    if (m.train && train) {
      notes.push({
        key: 'train',
        text: `This plan was made with a train that is no longer in your gear. It shows "${train.name}" for now.`,
        keepLabel: `Keep ${train.name}`,
        onKeep: () => chooseTrain(train.id),
      });
    }
    if (m.site && site) {
      notes.push({
        key: 'site',
        text: m.siteKept
          ? `This plan was made for a site whose saved numbers cannot be used (Gear, Sites says which). It shows "${site.name}" for now.`
          : `This plan was made for a site that is no longer in your gear. It shows "${site.name}" for now.`,
        keepLabel: `Keep ${site.name}`,
        onKeep: () => void editOpen({ siteId: site.id }),
      });
    }
    return notes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, open, train, site]);

  const editField = (zone: number, field: HorizonField, text: string) => {
    setFields((f) => f.map((z, i) => (i === zone ? { ...z, [field]: text } : z)));
    setJustSaved(false);
  };

  const saveArc = () => {
    if (!site) return;
    try {
      const arcs = fields.map((z) => ({ startAz: Number(z.start) % 360, endAz: Number(z.end) % 360, heightDeg: Number(z.height) }));
      const next = withSiteArcs(profile, site.id, arcs);
      refuseIfStale(); // the same check as a gear edit: this save must not write this page's older gear over another tab's
      storeProfile(next);
      setProfile(next);
      setBases(arcs);
      setJustSaved(true);
    } catch (e) {
      if (e instanceof StaleGearError || e instanceof HeldGearError) {
        setNotice(e.message); // the gear editor shows it on its own refusals; this save is in the horizon editor, so an older copy there goes
        setGearQuiet((n) => n + 1);
        return;
      }
      setNotice(`Not saved: ${e instanceof ProfileError ? profileProblemText(e, profile) : (e as Error).message}`);
    }
  };

  /** Reset all: back to what a first visit shows. The stored copies go, then every piece of state that was read from them is set again. */
  const resetAll = () => {
    // The plans key goes last: another tab that sees it gone reloads, and must find nothing left to carry over or to read again.
    const stored: [string, string][] = [
      [PROFILE_KEY, 'profile'],
      [SELECTION_KEY, 'site and train choice'],
      [EXPOSURE_NOTICE_KEY, 'old exposure notice'],
      [MY_PLAN_KEY, 'old plan'],
      [ITINERARY_KEY, 'old night timeline'],
      [CAPTURED_KEY, 'captured list'],
    ];
    const failed: string[] = [];
    try {
      for (const b of listBackups(window.localStorage)) stored.push([b.key, 'plans backup']);
    } catch (e) {
      failed.push(`the plans backups (${(e as Error).message})`);
    }
    try {
      for (const b of listFavoritesBackups(window.localStorage)) stored.push([b.key, 'favorites backup']);
    } catch (e) {
      failed.push(`the favorites backups (${(e as Error).message})`);
    }
    stored.push([FAVORITES_KEY, 'favorites']);
    stored.push([PLANS_KEY, 'plans']);
    for (const [key, what] of stored) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        failed.push(`the ${what} (${(e as Error).message})`);
      }
    }
    setCaptured(new Set());
    profileText.current = null;
    setProfileHeld(null); // the stored copies are gone: nothing is held back any more
    const sample = sampleProfile();
    setProfile(sample);
    loadForm(sample.sites[0]?.blockedArcs ?? [], true);
    // One empty plan on tonight at the sample's first site and train, as on a first visit (not saved until it is changed).
    const first = sample.sites[0];
    const firstTrain = sample.trains[0];
    const fresh = startPlans({ date: first ? defaultDateForProfile(new Date(), sample) : '', siteId: first?.id ?? '', trainId: firstTrain?.id ?? '', now: new Date().toISOString() });
    plansRef.current = fresh;
    savedText.current = null;
    heldRef.current = null;
    heldEdited.current = false;
    setHeldPlans(null);
    setPlanMessages(failed.length > 0 ? [`Reset did not finish: could not clear ${failed.join(', ')}. What could not be cleared is still stored in this browser.`] : []);
    setPlans(fresh);
    setType('all');
    setAlwaysRestore(false);
    setFindOpen(null);
    favs.reset();
    setImportError(null);
    if (failed.length === 0) setNotice('Reset: the planner is back to its starting point.');
    setResetFocus((n) => n + 1);
  };

  /** Opens the strip's controls and puts focus on the plan's own Evening of or Train control (a warning's "Change the ..." and "Change train"); the filter is the train's own, set on its card in Gear. */
  const goToControl = (control: 'date' | 'train' | 'filter') => {
    if (control === 'filter') {
      changeTrain();
      return;
    }
    flushSync(() => setControlsOpen(true));
    document.getElementById(`plan-${control}`)?.focus();
  };
  /** The one place a filter is chosen is the train's own card in Gear: the strip's "Change" and a warning's "Change the filter" both open it. */
  const changeTrain = () => {
    flushSync(() => {
      setControlsOpen(false);
      setTab('gear');
    });
    if (window.location.hash !== '#gear') window.history.pushState(null, '', '#gear');
    setOpenTrainTick((n) => n + 1);
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

  /** What a target is added as: Balanced, with its favorite when it has one (restored at once when "Always restore favorites" is on, else asked about). */
  const newRef = (id: string): PlanTargetRef => {
    const ref: PlanTargetRef = { id, preset: 'balanced' };
    const fav = favoriteOf(favs.state, id);
    // A favorite outside today's limits is not offered or restored; the row shows it as not usable.
    if (fav === null || favoriteProblem(fav) !== null || SLOT_BODIES.some((b) => planetIdOf(b) === id)) return ref;
    if (!alwaysRestore) return { ...ref, favorite: 'ask' };
    const entry = catalogById?.get(id) !== undefined ? (scorer?.target(catalogById.get(id)!) ?? null) : null;
    return { ...restoredRef(ref, fav, viewOf(ref, entry)), favorite: 'restored' };
  };
  const addToPlan = (id: string) => {
    if (planIds.includes(id)) return;
    if (planIds.length >= MAX_PLAN_TARGETS) {
      setNotice(`The plan holds at most ${MAX_PLAN_TARGETS} targets. Remove one to add another.`);
      return;
    }
    if (!editOpen({ targets: [...planTargets, newRef(id)] })) return;
    if (findIsOpen) setFindOpen(true); // adding keeps Find a target as it was
    const place = planIds.length + 1;
    const body = SLOT_BODIES.find((b) => planetIdOf(b) === id);
    const target = catalogById?.get(id);
    const name = body ?? target?.displayName ?? target?.name ?? [...mainList, ...planetGroup, ...notUpGroup, ...noFitList].find((e) => e.id === id)?.name ?? id;
    setAdded({ id, text: `Added, #${place} in the plan`, say: `${name} added, number ${place} in the plan.` });
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(null), ADDED_MS);
  };
  /** "Add top 3": the first three of the list that are not in the plan yet, in the list's order, as many as the plan has room for. */
  const addTopThree = (list: readonly PlanEntry[]) => {
    const fresh = list.filter((e) => !planIdSet.has(e.id)).slice(0, TOP_N);
    const picks = fresh.slice(0, Math.max(0, MAX_PLAN_TARGETS - planIds.length));
    if (picks.length === 0) return;
    if (!editOpen({ targets: [...planTargets, ...picks.map((e): PlanTargetRef => newRef(e.id))] })) return;
    if (findIsOpen) setFindOpen(true);
    if (planIds.length === 0) focusAfterTopThree.current = picks[0].id;
    const first = planIds.length + 1;
    const last = planIds.length + picks.length;
    const places = picks.length === 1 ? `#${first}` : `#${first} to #${last}`;
    const short = picks.length < fresh.length ? ` The plan is full: ${fresh.length - picks.length} not added.` : '';
    setAdded({ id: TOP_ADDED_ID, text: `Added ${picks.length}, ${places} in the plan.${short}`, say: `Added ${picks.length} to the plan, ${places}: ${nameList(picks.map((e) => e.name))}.${short}` });
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(null), ADDED_MS);
  };
  const removeFromPlan = (id: string) => editOpen({ targets: planTargets.filter((t) => t.id !== id) });
  // ---- Exposure on each target, and its favorite.
  const editTarget = (id: string, edit: (t: PlanTargetRef) => PlanTargetRef) => editOpen({ targets: planTargets.map((t) => (t.id === id ? edit(t) : t)) });
  /** A saved exposure applied to a target: the preset it equals for this night, else Custom with its own sub length and count. */
  const restoredRef = (ref: PlanTargetRef, fav: Favorite, view: RowExposure): PlanTargetRef => {
    const plain: PlanTargetRef = { ...ref };
    delete plain.favorite;
    const same = view.kind === 'ok' ? MODE_ORDER.find((m) => view.presets[m].subSeconds === fav.subSeconds && view.presets[m].subCount === fav.subCount) : undefined;
    if (same !== undefined) return withPreset(plain, same);
    const custom = withPreset(plain, 'custom');
    custom.base = fav.base ?? (fav.preset === 'custom' ? 'balanced' : fav.preset);
    custom.custom = { subSeconds: fav.subSeconds, subCount: fav.subCount };
    return custom;
  };
  const saveFavorite = (id: string) => {
    const ref = planTargets.find((t) => t.id === id);
    const view = rowViews.get(id);
    if (ref === undefined || view?.kind !== 'ok' || view.customUnusable !== null || view.chosen.subCount < 1) return;
    // The favorites store accepts the engine's limits (MIN_CUSTOM_SUB_S to MAX_SUB_S, 1 to MAX_SUBS whole subs); a row outside that is refused here, so the store's own check is never reached.
    const { subSeconds, subCount } = view.chosen;
    if (!(subSeconds >= MIN_CUSTOM_SUB_S && subSeconds <= MAX_SUB_S) || !Number.isInteger(subCount) || subCount < 1 || subCount > MAX_SUBS) {
      setNotice(`The favorite was not saved: these numbers are outside what a favorite can hold (a sub of ${MIN_CUSTOM_SUB_S} to ${MAX_SUB_S} s, 1 to ${MAX_SUBS} subs).`);
      return;
    }
    const filterName = train?.kind === 'optical' && train.filterId ? (profile.equipment.filters.find((f) => f.id === train.filterId)?.name ?? '') : '';
    const fav: Favorite = {
      id,
      preset: ref.preset,
      ...(ref.preset === 'custom' ? { base: baseOf(ref) } : {}),
      subSeconds: view.chosen.subSeconds,
      subCount: view.chosen.subCount,
      filterName: filterName === '' ? 'No filter' : filterName,
      trainName: train?.name ?? '',
      savedAt: new Date().toISOString(),
    };
    const r = favs.change((st) => withFavorite(st, fav));
    if (!r.ok) setNotice(r.message);
  };
  const removeFavorite = (id: string) => {
    const r = favs.change((st) => withoutFavorite(st, id));
    if (!r.ok) {
      setNotice(r.message);
      return;
    }
    // A target waiting on "Restore favorite?" must not ask again if a favorite is saved later.
    if (planTargets.some((t) => t.id === id && t.favorite === 'ask')) notNow(id);
  };
  const restoreFavorite = (id: string) => {
    const fav = favoriteOf(favs.state, id);
    const view = rowViews.get(id);
    if (fav !== null && favoriteProblem(fav) === null && view !== undefined) editTarget(id, (t) => restoredRef(t, fav, view));
  };
  const notNow = (id: string) =>
    editTarget(id, (t) => {
      const next = { ...t };
      delete next.favorite;
      return next;
    });
  const chooseAlwaysRestore = (on: boolean) => {
    setAlwaysRestore(on);
    if (site && train) rememberSelection(site.id, train.id, type, on);
  };

  // ---- My plans: the bar's actions. New starts empty on today at the open plan's site and train.
  const newPlanDefaults = (): PlanDefaults => ({ date: tonightDate || date, siteId: site?.id ?? '', trainId: train?.id ?? '', now: new Date().toISOString() });
  const openPlanById = (id: string) => commitPlans((st) => withOpenPlan(st, id));
  const createPlan = () => commitPlans((st) => newPlan(st, newPlanDefaults()));
  const renameOpenPlan = (name: string) => commitPlans((st) => renamePlan(st, st.openId, name));
  const duplicateOpenPlan = () => commitPlans((st) => duplicatePlan(st, st.openId, new Date().toISOString()));
  const deleteOpenPlan = () => commitPlans((st) => deletePlan(st, st.openId, newPlanDefaults()));
  const moveToTonight = () => editOpen({ date: tonightDate });

  // ---- The timeline and the AI plan write back into the open plan.
  /** The Custom targets whose stored numbers do not work on this night (the preset's numbers are used instead). */
  const presetUsed = useMemo(() => {
    const used = new Map<string, string>();
    for (const t of planTargets) {
      const v = rowViews.get(t.id);
      // A stored value outside the limits is judged here whatever the row's kind (a profile without a pixel size gives no numbers, but the timeline still must not get the value).
      const stored = t.preset === 'custom' ? storedProblem(t.custom) : null;
      if (v?.kind === 'ok' && v.customUnusable !== null) used.set(t.id, v.customUnusable);
      else if (stored !== null) used.set(t.id, notUsedNoPresetText(stored));
    }
    return used;
  }, [planTargets, rowViews]);
  /** The timeline's slots, from the plan's targets: the plan's own train and its filter for all; a Custom target is scheduled with its own numbers over the preset it differs from. */
  const slotOf = useCallback(
    (t: PlanTargetRef): ItineraryItem => ({
      id: t.id,
      targetId: t.id,
      trainId: train?.id ?? '',
      filterId: train?.kind === 'optical' ? (train.filterId ?? null) : null,
      mode: baseOf(t),
      // A Custom value that does not work on this night is not scheduled: the slot uses the preset's own numbers (the row says so); the value stays stored.
      ...(t.preset === 'custom' && t.custom && !presetUsed.has(t.id) ? { overrides: t.custom } : {}),
      note: t.note ?? '',
    }),
    [train, presetUsed],
  );
  const timelineItems = useMemo((): ItineraryItem[] => planTargets.slice(0, MAX_SLOTS).map(slotOf), [planTargets, slotOf]);
  /** A slot's changed note goes onto its target, and the start time onto the plan; the slots' order is the plan's order; targets past the timeline's slots stay after them. */
  const applyTimeline = (items: ItineraryItem[], startTime: string | null) => {
    const byId = new Map(planTargets.map((t) => [t.id, t]));
    const kept = items.flatMap((i): PlanTargetRef[] => {
      const old = byId.get(i.id);
      if (old === undefined) return [];
      const next: PlanTargetRef = { ...old };
      if (i.note !== (old.note ?? '')) {
        if (i.note === '') delete next.note;
        else next.note = i.note;
      }
      return [next];
    });
    editOpen({ targets: [...kept, ...planTargets.slice(MAX_SLOTS)], startTime });
  };
  /** "Use this plan": the AI's order and first start time go into the open plan, and every target keeps its own exposure (preset or Custom numbers); targets it left out follow, in their order. */
  const aiOrder = useCallback(
    (ids: readonly string[]): PlanTargetRef[] => {
      const byId = new Map(planTargets.map((t) => [t.id, t]));
      const used = new Set<string>();
      const ordered = ids.flatMap((id): PlanTargetRef[] => {
        const old = byId.get(id);
        if (old === undefined || used.has(id)) return [];
        used.add(id);
        return [{ ...old }];
      });
      return [...ordered, ...planTargets.filter((t) => !used.has(t.id))];
    },
    [planTargets],
  );
  const applyAiPlan = (items: ItineraryItem[], startTime: string | null): Promise<boolean> => Promise.resolve(editOpen({ targets: aiOrder(items.map((i) => i.targetId)), startTime }));
  /**
   * What each target of the AI plan's filter mix will be once the plan is used: the plan as `applyAiPlan` writes it (the AI's order, the first start, each target's own
   * exposure), timed by the same timeline code, then the same mix as the row. So the row after Use this plan shows what the flyout showed. Null when there is no night yet.
   */
  const aiMixFor = useCallback(
    (ids: readonly string[], startTime: string | null): ReadonlyMap<string, AiSlotView> | null => {
      if (!stableNight || stableNight.kind !== 'normal' || !astroSite || catalog.status === 'loading') return null;
      const items = aiOrder(ids).slice(0, MAX_SLOTS).map(slotOf);
      const startAt = startTime && stableNight.start ? clockToInstant(startTime, stableNight.start, siteZone || zone || undefined) : null;
      const plan = buildItinerary({
        site: astroSite,
        night: stableNight,
        horizon,
        minAltitude,
        bortle: bortleOfSite,
        slots: items.map((i) => slotInputFor(i, profile, catalog.status === 'ready' ? catalog.index.targets : [])),
        startAt,
        formatTime,
        windows: makeWindowLookup({ site: astroSite, night: stableNight, horizon, minAltitude }),
      });
      return new Map(planItems.filter((p) => ids.includes(p.id)).map((p): [string, AiSlotView] => [p.id, { mix: mixOf(p, plan), nb: nbOf(p, plan) }]));
    },
    [stableNight, astroSite, catalog, aiOrder, slotOf, siteZone, zone, horizon, minAltitude, bortleOfSite, profile, formatTime, planItems, mixOf, nbOf],
  );

  // The AI flyout: open or closed. Closing puts the keyboard back on the button that opened it.
  const [aiOpen, setAiOpen] = useState(false);
  const closeAi = () => {
    setAiOpen(false);
    window.setTimeout(() => document.getElementById('ai-plan-open')?.focus(), 0);
  };
  /** Each plan target's preset as its row shows it; a Custom target whose numbers are not used on this night says so. */
  const aiPresetLabels = useMemo(
    () => new Map(planTargets.map((t) => [t.id, t.preset === 'custom' ? (presetUsed.has(t.id) ? `${presetLabel(baseOf(t))}, custom not used` : 'Custom') : presetLabel(t.preset)] as const)),
    [planTargets, presetUsed],
  );
  /** What each target's own row plans for the whole night: the timeline's slot says why when its own sub differs. */
  const rowNumbers = useMemo(() => {
    const out = new Map<string, { subSeconds: number; subCount: number; lengthenedForCap: boolean }>();
    for (const [id, v] of rowViews) if (v.kind === 'ok' && v.chosen.subCount >= 1) out.set(id, { subSeconds: v.chosen.subSeconds, subCount: v.chosen.subCount, lengthenedForCap: v.chosen.limitedBy.sub === 'count-cap' || v.chosen.limitedBy.total === 'count-cap' });
    return out;
  }, [rowViews]);

  const importProfile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    let next: Profile;
    try {
      assertImportSize(file.size);
      const text = await file.text();
      next = profileFromText(gearInEverything(text) ?? text); // an "everything" file from Share and export carries the gear
    } catch (e) {
      setImportError(`Import rejected, nothing was changed. ${(e as Error).message}`);
      return;
    }
    setProfile(next);
    setProfileHeld(null); // the user chose to replace the held copy with this file
    // The plans stay (their targets are catalog ids); the open one moves to the new profile's first site and train, on its first evening,
    // because the old ids belong to the old profile. The others fall back to the first the same way.
    const [first] = next.sites;
    const [firstTrain] = next.trains;
    let moved = '';
    if (first && firstTrain) {
      const evening = defaultDateForProfile(new Date(), next);
      if (editOpen({ date: evening, siteId: first.id, trainId: firstTrain.id })) {
        moved = ` The open plan${open ? ` "${open.name}"` : ''} moved to ${first.name}, ${firstTrain.name}, ${nightDateText(evening)}.${(plans?.plans.length ?? 1) > 1 ? ' Other plans whose site or train is not in this profile use its first.' : ''}`;
      }
    }
    loadForm(next.sites[0]?.blockedArcs ?? [], true);
    setType('all');
    try {
      window.localStorage.removeItem(SELECTION_KEY); // the old ids belong to the old profile
      storeProfile(next);
      setNotice(`Imported ${file.name}.${moved}`);
    } catch (e) {
      setNotice(`Imported ${file.name}.${moved} Not saved, so it is lost on reload: ${(e as Error).message}`);
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


  const planRows: PlanRow[] = planItems.map(({ id, ref, target, body, entry }) => {
    const name = body ?? target?.displayName ?? target?.name ?? id;
    const detail =
      body !== undefined
        ? 'Solar system'
        : target !== undefined
          ? [designationOf(target.id) === name ? '' : designationOf(target.id), typeLabel(target.type), sizeText(target.sizeArcmin)].filter((x) => x !== '').join(' · ')
          : catalog.status === 'loading'
            ? 'Loading the catalog…'
            : 'Not in the bundled catalog.';
    const up =
      entry !== null
        ? entry.usableMinutes > 0
          ? `Up ${upRange(entry, formatTime)}`
          : `Not up ${nightWord}`
        : scorer === null && stableNight
          ? 'No astronomical night on this date.'
          : '';
    const view = rowViews.get(id);
    const fav = favoriteOf(favs.state, id);
    return {
      id,
      name,
      detail,
      up,
      score: entry !== null && entry.usableMinutes > 0 ? Math.round(entry.score.total) : null,
      preset: ref.preset === 'custom' ? 'Custom' : PRESETS[ref.preset].label,
      extra:
        view === undefined ? undefined : (
          <PlanRowExposure
            id={id}
            name={name}
            preset={ref.preset}
            view={view}
            favorite={fav}
            how={<RowHow id={id} mix={mixViews.get(id) as RowMix} nb={nbViews.get(id) as NbView} />}
            favoritesBlocked={favs.blocked}
            prompt={ref.favorite ?? null}
            onPreset={(p) => editTarget(id, (t) => withPreset(t, p))}
            onNumber={(field, value) => editTarget(id, (t) => withNumber(t, field, value))}
            onBack={() => editTarget(id, (t) => withPreset(t, baseOf(t)))}
            onSaveFavorite={() => saveFavorite(id)}
            onRemoveFavorite={() => removeFavorite(id)}
            onRestore={() => restoreFavorite(id)}
            onNotNow={() => notNow(id)}
            onGoTo={goToControl}
          />
        ),
      mix: (
        <>
          <PlanRowMix
            id={id}
            mix={mixViews.get(id) as RowMix}
            extra={view?.kind === 'ok' ? (filterId, minutes) => view.forFilter(filterId === null ? null : (profile.equipment.filters.find((f) => f.id === filterId) ?? null), minutes) : undefined}
          />
          <NarrowbandPanel idBase={id} view={nbViews.get(id) as NbView} onHours={(t) => setNbHoursFor(id, t)} onTick={(f, on) => setNbTickFor(id, f, on)} />
        </>
      ),
    };
  });
  /** The plan's rows with their numbers, for the plan CSV and the print sheet. */
  const exposureRows: PlanExposureRow[] = planItems.map(({ id, ref, target, body }) => {
    const view = rowViews.get(id);
    const ok = view?.kind === 'ok' ? view.chosen : null;
    return {
      name: body ?? target?.displayName ?? target?.name ?? id,
      type: body !== undefined ? 'Solar system' : target !== undefined ? typeLabel(target.type) : '',
      preset: body !== undefined ? '' : ref.preset === 'custom' ? (view?.kind === 'ok' && view.customUnusable !== null ? `${presetLabel(baseOf(ref))} (custom not used)` : 'Custom') : presetLabel(ref.preset),
      subSeconds: ok?.subSeconds ?? null,
      subCount: ok?.subCount ?? null,
      lightMin: ok?.integrationMin ?? null,
      note: ref.note ?? '',
      ...(view?.kind === 'missing' ? { exposureNote: view.reason } : {}),
    };
  });

  // ---- Share and export: what the sheet, the files and the print all read.
  /** The year with the night's date: a file stands alone. */
  const dateWithYear = (iso: string): string => `${nightDateText(iso)} ${iso.slice(0, 4)}`;
  const factsOf = (id: string): TargetFacts | null => {
    const body = SLOT_BODIES.find((b) => planetIdOf(b) === id);
    if (body !== undefined) return { name: body, type: 'Solar system', raHours: null, decDeg: null };
    const t = catalogById?.get(id);
    return t === undefined ? null : { name: t.displayName ?? t.name, type: typeLabel(t.type), raHours: t.raHours, decDeg: t.decDeg };
  };
  const favoriteText = (id: string): string => {
    const fav = favoriteOf(favs.state, id);
    return fav === null ? '' : `Favorite saved: ${fav.subCount} x ${fav.subSeconds} s (${fav.trainName === '' ? 'no train named' : fav.trainName}, ${fav.filterName})`;
  };
  /**
   * The open plan's sheet. Times, sub length, sub count and light of a row are the timeline's own slot (so a sheet, a file and the night timeline agree);
   * a row the timeline leaves out tonight says so, carries no numbers and adds no light; the total is the timeline's "Light".
   */
  const openSheet = (withMix = false): PlanSheet => {
    const report = itineraryReport.current;
    const slots = new Map(report?.plan.slots.map((s) => [s.id, s] as const) ?? []);
    const filter = train ? filterNameOf(profile, train.id) || 'No filter' : '';
    const rows = planItems.map(({ id, target, body }, i): SheetRow => {
      const e = exposureRows[i];
      const slot = slots.get(id);
      const view = rowViews.get(id);
      const scheduled = slot !== undefined && slot.altitudes !== null && slot.end.getTime() > slot.start.getTime();
      const state = report === null ? 'stored' : scheduled ? 'scheduled' : 'unscheduled';
      // The row's own warnings (an unusable custom, no filter on a camera without a UV/IR cut) go with the numbers they are about: not for a row the timeline leaves out.
      const rowWarnings = view?.kind !== 'ok' ? [] : [view.customUnusable ?? '', ...(scheduled ? splitWarnings(view.chosen.warnings).act.map((w) => w.text) : [])];
      return {
        order: i + 1,
        state,
        name: body === undefined && target === undefined && catalogById !== null ? NOT_IN_CATALOG : e.name,
        type: e.type,
        ra: target !== undefined ? raText(target.raHours) : '',
        dec: target !== undefined ? decText(target.decDeg) : '',
        start: scheduled ? formatTime(slot.start) : '',
        end: scheduled ? formatTime(slot.end) : '',
        preset: e.preset,
        subSeconds: scheduled ? slot.subSeconds : null,
        subCount: scheduled ? slot.subCount : null,
        lightMin: scheduled ? Math.round(slot.integrationMin * 10) / 10 : null,
        filter,
        favorite: favoriteText(id),
        note: e.note,
        warning: [...new Set([...rowWarnings, e.exposureNote ?? '', ...(slot?.warnings.map((w) => w.text) ?? [])].filter((x) => x !== ''))].join(' '),
      };
    });
    return {
      name: open?.name ?? '',
      date: dateWithYear(date),
      site: site ? siteText(profile, site.id) : '',
      train: train ? trainText(profile, train.id) : '',
      night: nightText.trim(),
      startsAt: report && report.plan.slots.length > 0 ? formatTime(report.plan.startsAt) : (open?.startTime ?? ''),
      notes: open?.notes ?? '',
      warnings: staleNotes.map((n) => n.text),
      caveat: planTargets.length > 0 && report === null ? 'The times were not worked out (the night or the catalog has not loaded).' : '',
      rows,
      totalLightMin: report !== null && rows.some((r) => r.state === 'scheduled') ? lightMinutes(report.plan) : null,
      // The plain-text file carries each scheduled target's filter mix: the row's own numbers (the same mix the row shows).
      ...(withMix
        ? {
            mix: planItems.flatMap(({ id }, i) => {
              const m = mixViews.get(id);
              if (rows[i].state === 'unscheduled') return [`${rows[i].name}: ${NOT_SCHEDULED}, no filter mix.`];
              return m?.kind === 'mix' ? [mixSummary(rows[i].name, m, minutesText)] : [];
            }),
          }
        : {}),
    };
  };
  /** Another plan's sheet: what it stores, said so. */
  const otherSheet = (p: Plan): PlanSheet => {
    const m = missingOf(profile, p);
    const sheet = storedSheet(p, profile, factsOf, dateWithYear, favoriteText);
    return { ...sheet, warnings: [...(m.train ? ['This plan was made with a train that is no longer in your gear.'] : []), ...(m.site ? ['This plan was made for a site that is no longer in your gear or whose saved numbers cannot be used.'] : [])] };
  };
  const sheetsFor = (what: ShareWhat, withMix = false): PlanSheet[] => (what === 'plan' ? [openSheet(withMix)] : what === 'all' || what === 'everything' ? (plans?.plans ?? []).map((p) => (p.id === plans?.openId ? openSheet(withMix) : otherSheet(p))) : []);
  /** Why a choice is off: saved gear that could not be loaded is never shared as if it were the sample on screen. */
  const shareBlocked: Partial<Record<ShareWhat, string>> =
    {
      ...(profileHeld !== null ? { gear: 'Your saved gear could not be loaded, so it cannot be shared from here. Export profile (JSON) under Gear and site keeps the saved text as it is.', everything: 'Needs the gear, which could not be loaded (see Gear).' } : {}),
      ...(projectsApi.state.projects.length === 0 ? { projects: 'You have no projects yet. Make one under Projects.' } : {}),
    };
  const shareNow: ShareWhat = shareBlocked[shareWhat] !== undefined ? 'plan' : shareWhat;
  const heldNote = heldPlans !== null ? 'Your saved plans are held back (see the notice at the top of the page), so this is the plans on this page.' : null;
  /** The page's one way to name a target id (a project's targets, in its tab and in every file). */
  const targetName = useCallback(
    (id: string): string => {
      const body = SLOT_BODIES.find((b) => planetIdOf(b) === id);
      if (body !== undefined) return body;
      const t = catalogById?.get(id);
      return t === undefined ? id : (t.displayName ?? t.name);
    },
    [catalogById],
  );
  const projectSheets = (): ProjectSheet[] => projectsApi.state.projects.map((p) => projectSheet(p, sheetNames(profile, p.setup, targetName)));
  const docFor = (what: ShareWhat, withMix = false): ShareDoc => ({
    plans: sheetsFor(what, withMix),
    gear: what === 'gear' || what === 'everything' ? gearSheet(profile) : null,
    notes: heldNote === null ? [] : [heldNote],
    ...(what === 'projects' ? { projects: projectSheets() } : {}),
  });
  const slug = (s: string): string => s.normalize('NFD').replace(/[^\x20-\x7e]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'plan';
  const makeShare = (what: ShareWhat, format: ShareFormat): { text: string; file: string } => {
    const ext = FORMATS.find((f) => f.id === format)!.ext;
    const stem = what === 'plan' ? `fpo-plan-${slug(open?.name ?? '')}-${date}` : what === 'all' ? `fpo-plans-${date}` : what === 'gear' ? 'fpo-gear' : what === 'projects' ? `fpo-projects-${date}` : `fpo-everything-${date}`;
    const file = `${stem}.${ext}`;
    if (format === 'json') {
      if (what === 'gear') return { text: gearFileText(profile), file };
      if (what === 'projects') return { text: plansFileText({ exportedAt: sharedAt, plans: [], sheets: [], profile: null, projects: projectsApi.state.projects, projectSheets: projectSheets() }), file };
      const stored = what === 'plan' ? (open ? [open] : []) : (plans?.plans ?? []);
      return { text: plansFileText({ exportedAt: sharedAt, plans: stored, sheets: sheetsFor(what), profile: what === 'everything' ? profile : null }), file };
    }
    const doc = docFor(what, format === 'text');
    return { text: format === 'text' ? docToText(doc) : format === 'markdown' ? docToMarkdown(doc) : docToCsv(doc), file };
  };
  /** The ASIAir file: the open plan's fixed objects with a position, in the plan's order. */
  const asiairTargets = planItems.flatMap(({ id, target }): AsiairTarget[] => (target === undefined ? [] : [{ name: (target.aliases.find((x) => /^m\d+$/i.test(x))?.toUpperCase() ?? designationOf(id)) || (target.displayName ?? target.name), raHours: target.raHours, decDeg: target.decDeg }]));
  const asiairFov = (() => {
    if (!train) return null;
    try {
      const r = resolveTrain(profile, train);
      const o = opticalTrain(r.scope, r.camera, r.accessory);
      return o.fovWidthArcmin !== undefined && o.fovHeightArcmin !== undefined ? { widthArcmin: o.fovWidthArcmin, heightArcmin: o.fovHeightArcmin } : null;
    } catch {
      return null;
    }
  })();
  const solarInPlan = planItems.filter((p) => p.body !== undefined).length;
  const asiairLeft = [
    solarInPlan > 0 ? `${solarInPlan} solar-system ${solarInPlan === 1 ? 'body is' : 'bodies are'} left out: they move, so they have no fixed position.` : '',
    planItems.length - solarInPlan - asiairTargets.length > 0 ? `${planItems.length - solarInPlan - asiairTargets.length} not in the bundled catalog, so left out.` : '',
  ].filter((x) => x !== '').join(' ');
  const asiairMake = (letter: boolean) => ({ text: asiairCsv(asiairTargets, asiairFov, letter), file: `fpo-asiair-positions-${slug(open?.name ?? '')}-${date}.csv` });

  /** Reads a plans file the user chose and, if it is one, asks what to do about plans that are already here. Nothing is stored yet. */
  const pickPlansFile = async (file: File | undefined) => {
    if (!file) return;
    pendingImport.current = null;
    const refuse = (text: string) => setImportPanel({ kind: 'error', text });
    if (heldPlans !== null) return refuse('Your saved plans are held back (see the notice at the top of the page), so nothing can be added to them until you decide there.');
    const have = plansRef.current;
    if (have === null) return refuse('The plans have not loaded yet.');
    try {
      if (file.size > MAX_PLANS_FILE_CHARS) throw new PlansFileError('This file is not a planner plans file. The file is too large.');
      const read = readPlansFile(await file.text(), tonightDate || date, nightDateText);
      pendingImport.current = { plans: read.plans, notices: read.notices };
      const names = read.plans.slice(0, 5).map((p) => `"${p.name}"`);
      if (read.plans.length > 5) names.push(`and ${read.plans.length - 5} more`);
      setImportPanel({ kind: 'ask', file: file.name.length > 40 ? `${file.name.slice(0, 40)}…` : file.name, names, total: read.plans.length, ...compareIncoming(have, read.plans), notices: read.notices, hasGear: read.hasGear });
    } catch (e) {
      refuse(e instanceof PlansFileError ? e.message : `The file could not be read: ${(e as Error).message}`);
    }
  };
  /** The user's choice about the plans read: adds them after the saved ones (a copy of the saved plans is kept first), never replacing one. */
  const finishImport = (choice: 'copy' | 'skip' | 'cancel') => {
    const pending = pendingImport.current;
    pendingImport.current = null;
    if (choice === 'cancel' || pending === null) {
      setImportPanel({ kind: 'none' });
      return;
    }
    try {
      const stored = readPlansText();
      if (stored !== null) keepCopy(window.localStorage, stored);
    } catch (e) {
      setImportPanel({ kind: 'error', text: `A copy of your saved plans could not be kept first (${(e as Error).message}), so they were left as they are.` });
      return;
    }
    let result: ImportResult | null = null;
    let before = 0;
    const ok = commitPlans((st) => {
      before = st.plans.length;
      result = importPlans(st, pending.plans, choice);
      return result.state;
    });
    const r = result as ImportResult | null;
    if (!ok || r === null) {
      setImportPanel({ kind: 'error', text: 'The plans could not be added (the notice at the top of the page says why).' });
      return;
    }
    const noGear = r.state.plans.slice(before).filter((p) => missingOf(profile, p).train || missingOf(profile, p).site).length;
    const parts = [
      r.added > 0 ? `Imported ${r.added} ${r.added === 1 ? 'plan' : 'plans'}${r.copies > 0 ? `, ${r.copies} as ${r.copies === 1 ? 'a copy' : 'copies'} (the name ends "(imported)")` : ''}.` : 'No plan was added.',
      r.skipped > 0 ? `${r.skipped} ${r.skipped === 1 ? 'was' : 'were'} already here and ${r.skipped === 1 ? 'was' : 'were'} skipped.` : '',
      r.clashSkipped > 0 ? `${r.clashSkipped} ${r.clashSkipped === 1 ? 'has' : 'have'} the same id as a different plan here and ${r.clashSkipped === 1 ? 'was' : 'were'} skipped.` : '',
      r.leftOut > 0 ? `Plans hold at most ${MAX_PLANS} plans, so ${r.leftOut} ${r.leftOut === 1 ? 'was' : 'were'} left out. Delete a plan to make room.` : '',
      noGear > 0 ? `${noGear} ${noGear === 1 ? 'uses' : 'use'} a site or train that is not in your gear; ${noGear === 1 ? 'it shows' : 'they show'} the first one until you keep or change it.` : '',
      ...pending.notices,
    ];
    setImportPanel({ kind: 'done', text: parts.filter((x) => x !== '').join(' ') });
  };

  // The AI plan takes the open plan's fixed objects in the plan's order; planets move, so they stay out, and so does anything not yet resolved.
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
    staleNotes.length > 0
      ? 'This plan was made with a setup or site that is no longer in your gear. Keep the one shown or change it first.'
      : planIds.length === 0
      ? 'Add at least one target to the plan first.'
      : !hasNight
        ? 'There is no astronomical night on this date, so there is nothing to plan.'
        : catalog.status === 'loading'
          ? 'The catalog is still loading.'
          : aiTargets.length === 0
            ? 'The plan has no deep-sky targets the AI planner can use. It plans fixed objects, not the Moon and planets.'
            : aiBase === null
              ? 'The site or train is not ready.'
              : null;
  const aiLeftOut = [
    planets > 0 ? `${planets} solar-system ${planets === 1 ? 'body is' : 'bodies are'} left out: the AI plans fixed objects.` : '',
    unresolved > 0 ? `${unresolved} ${unresolved === 1 ? 'target is' : 'targets are'} left out: not in the bundled catalog.` : '',
    aiTargets.length > MAX_TARGETS ? `Only the first ${MAX_TARGETS} targets of the plan are sent.` : '',
  ].filter((x) => x !== '').join(' ');
  const field =
    'min-h-11 bg-p-bg/60 border border-p-line/30 rounded px-2 py-1 text-p-t1 font-normal text-sm';
  const btn =
    'min-h-11 px-3 py-1.5 rounded border border-p-line/30 text-p-t1 font-normal text-sm hover:bg-p-raised/10 disabled:opacity-40';
  const panel = 'bg-p-bg/70 rounded-lg border border-p-line/10 p-4 sm:p-6';
  const importControl = (
    <div>
      <label htmlFor="profile-import" className="block text-p-t1/90 font-normal text-sm mb-1">Import profile (JSON)</label>
      <input
        id="profile-import"
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          void importProfile(e.target.files?.[0]);
          e.target.value = '';
        }}
        className="block min-h-11 w-full max-w-full min-w-0 py-2 text-p-t1/90 font-normal text-sm"
      />
    </div>
  );

  if (!site || !train) {
    return (
      <div className={panel}>
        <h1 className="text-2xl font-light text-p-t1 tracking-[0.2em]">IMAGING PLANNER</h1>
        {profile.sites.length > 0 && usable.length === 0 ? (
          <div className="mt-4 space-y-2" data-testid="no-usable-site">
            <p className="text-p-t1/90 font-normal break-words">
              {profile.sites.length === 1 ? 'Your saved site cannot be used' : 'None of your saved sites can be used'}, so the planner has no night to show yet. Correct it in Gear below: the site&apos;s own form says what is wrong. Your gear is untouched.
            </p>
            {siteProblems(profile).map((x) => (
              <p key={`${x.id}-${x.key}`} className="text-p-warn-text font-normal text-sm break-words">
                <span aria-hidden="true">! </span>Site &quot;{x.siteName}&quot;: {problemText(x, 'this site')}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-p-t1/90 font-normal mt-4">
            The profile needs at least one site and one train. Import a profile below, or reset all to start from the sample.
          </p>
        )}
        {importError && (
          <p role="alert" className="bg-p-warn-fill/15 border border-p-warn/40 rounded px-3 py-2 text-p-warn-text font-normal text-sm mt-4">
            {importError}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-4 mt-4">
          {importControl}
          <ResetAll onConfirm={resetAll} />
        </div>
        {profile.sites.length > 0 && usable.length === 0 && profile.trains.length > 0 && (
          <div className="mt-6">
            <ProfileEditor
              profile={profile}
              onChange={applyProfile}
              plans={planRefs}
              openTrainId={profile.trains[0].id}
              onUseTrain={chooseTrain}
              onOpenPlan={() => undefined}
              startOn="sites"
            />
          </div>
        )}
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
      : `Horizon: ${savedArcs.map((a) => `blocked ${a.startAz}° (${compass(a.startAz)}) to ${a.endAz}° (${compass(a.endAz)}), ${a.heightDeg}° high`).join('; ')}.${describeOverlaps(savedArcs) && ` ${describeOverlaps(savedArcs)}`}`;
  const midMoon = night?.kind === 'normal' ? moonIllumination(new Date(((night.start as Date).getTime() + (night.end as Date).getTime()) / 2)) : null;
  const nightHours = night?.kind === 'normal' ? (((night.end as Date).getTime() - (night.start as Date).getTime()) / 3600000).toFixed(1) : null;
  const nightText =
    night === undefined
      ? 'Loading the date…'
      : night.kind === 'normal'
        ? `Astronomical night ${formatTime(night.start as Date)} to ${formatTime(night.end as Date)} (${nightHours} h), Moon ${((midMoon ?? 0) * 100).toFixed(0)}% lit at mid-night. `
        : night.kind === 'none'
          ? 'The Sun does not get below -18 deg at this site on this date: no astronomical night. '
          : 'The Sun stays below -18 deg for the whole day, or the night ends in polar night: no usable night. ';
  const planetary = train.kind === 'optical' && train.tag === 'planetary';
  // The Solar system group: open on a planetary train, and for the Solar system view only; closed otherwise. A hand-made open or close wins.
  const groupOpen = planetsOpen ?? (planetary || isSolar);
  // "Not up" inside it: closed, unless nothing is up (then it is the only content).
  const notUpShown = notUpOpen ?? planetGroup.length === 0;
  // The plan mixes kinds when the train is for one and the open plan holds the other (adding is never blocked, the train never switches by itself).
  const trainNote =
    planetary && planItems.some((p) => p.body === undefined)
      ? 'Setup suits solar system, plan has deep sky.'
      : !planetary && planets > 0
        ? 'Setup suits deep sky, plan has solar system.'
        : reducedFocalNote(profile, train);
  // Where "Use ..." goes: the first train that is not set up for planets (an optical one first).
  const deepTrain = planetary ? (profile.trains.find((t) => t.kind === 'optical' && t.tag !== 'planetary') ?? profile.trains.find((t) => t.kind === 'smart')) : undefined;
  const frame = planTrain === null ? null : fieldOf(planTrain);
  const noFitFit = (e: PlanEntry): string => (frame === null ? e.fit : fitReason(e, catalogById?.get(e.id)?.sizeArcmin, frame));
  const describeRow = (e: PlanEntry): RowDescription => {
    if (e.isPlanet) return { aka: '', meta: 'Solar system' };
    const t = catalogById?.get(e.id);
    if (t === undefined) return { aka: '', meta: typeLabel(e.type) };
    const d = designationOf(t.id);
    return { aka: d !== '' && d !== e.name ? d : '', meta: [typeLabel(t.type), sizeText(t.sizeArcmin), t.constellation].filter((x) => x !== undefined && x !== '').join(' · ') };
  };
  const solarBody = (id: string) => SLOT_BODIES.find((b) => planetIdOf(b) === id);
  // The fit column of a body row says its apparent size at the middle of the night (the rest of the detail is in the row).
  const bodyFit = (e: PlanEntry): string => {
    const body = solarBody(e.id);
    if (body === undefined || !stableNight || stableNight.kind !== 'normal' || !stableNight.start || !stableNight.end || !astroSite) return '';
    const mid = new Date((stableNight.start.getTime() + stableNight.end.getTime()) / 2);
    return `${apparentDiameterArcsec(body, mid, astroSite).toFixed(1)}″ across`;
  };
  const solarDetail = (body: CardBody) =>
    stableNight && astroSite ? (
      <SolarSystemDetail
        body={body}
        profile={profile}
        train={train}
        site={astroSite}
        night={stableNight}
        horizon={horizon}
        minAltitude={minAltitude}
        formatTime={formatTime}
        nightWord={nightWord}
        checked={solarChecked}
        onToggle={toggleSolar}
      />
    ) : null;
  const renderDetail = (e: PlanEntry) => {
    const t = detailText(e, formatTime);
    return (
      <div className="space-y-2 font-normal text-p-t1/90">
        <p>{e.why}</p>
        <p className="text-sm text-p-t1/70">{t.parts}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className="text-p-t1/70">Usable window</dt><dd>{t.windows === '' ? 'none' : t.windows}</dd>
          <dt className="text-p-t1/70">Peak</dt><dd>{peakText(e, formatTime)}</dd>
          <dt className="text-p-t1/70">Moon</dt><dd>{t.moon}</dd>
        </dl>
        <label className="flex min-h-11 w-fit items-center gap-2 pr-3">
          <input type="checkbox" aria-label={`Captured: ${e.name}`} checked={captured.has(e.id)} onChange={() => toggleCaptured(e.id)} className="h-5 w-5 shrink-0 accent-p-focus" />
          <span aria-hidden="true">Captured</span>
        </label>
        {track && stableNight && e.id === openId && (
          <AltitudeChart entry={e} night={stableNight} track={track} horizonSet={horizon !== null} minAltitude={minAltitude} formatTime={formatTime} nightWord={nightWord} />
        )}
        {e.isPlanet && solarBody(e.id) !== undefined && solarDetail(solarBody(e.id)!)}
      </div>
    );
  };
  const quickDates = [
    { label: 'Today', date: tonightDate },
    { label: 'Tomorrow', date: addDays(tonightDate, 1) },
    { label: '+1 week', date: addDays(tonightDate, 7) },
  ];
  /** Opens Gear with the Site list's Find box focused: the strip's "Change site" and the open strip's "Change or find a site". */
  const changeSite = () => {
    flushSync(() => {
      setControlsOpen(false);
      setTab('gear');
    });
    if (window.location.hash !== '#gear') window.history.pushState(null, '', '#gear');
    setFindSiteTick((n) => n + 1);
  };
  /** Why a type has no list: nothing up long enough, or everything that is up is the wrong size for camera view. */
  const emptyText = (notFit: RankResult['typeNotFit']): string => {
    const what = group.id === 'all' ? 'targets' : group.noun;
    // Only what is up is said: a type's catalog-wide too-large count would claim objects that never rise.
    const up = groupNotFit(group, notFit);
    const wrongSize = up.tooLarge + up.tooSmall;
    if (wrongSize > 0) return `No ${what} fit this camera view ${nightWord}.`;
    return `No ${what} are up ${nightWord} above your horizon.`;
  };
  /** The Add top 3 row above a ranked list: the button, and in words what it did or why it cannot. */
  const topThree = (list: readonly PlanEntry[]) => {
    const full = planIds.length >= MAX_PLAN_TARGETS;
    const nothingNew = list.every((e) => planIdSet.has(e.id));
    const why = full ? `The plan is full (${MAX_PLAN_TARGETS} targets). Remove one to add more.` : nothingNew ? 'Everything in this list is already in the plan.' : '';
    return (
      <div className="mb-2 mt-2 flex flex-wrap items-center gap-x-3" data-testid="top-three">
        <button
          type="button"
          disabled={full || nothingNew}
          aria-describedby="top-three-note"
          onClick={() => addTopThree(list)}
          className={`${btn} min-h-11 disabled:cursor-default disabled:opacity-60`}
        >
          Add top {TOP_N} to the plan
        </button>
        <span id="top-three-note" className="min-w-0 text-sm font-normal text-p-t1/80">
          {added?.id === TOP_ADDED_ID ? <span aria-hidden="true" className="text-p-ok">{added.text}</span> : why}
        </span>
      </div>
    );
  };
  /** The empty plan's own "Add top 3": the first three of the list below (the Solar system list when that is the type chosen). */
  const emptyTopList = isSolar ? planetGroup : mainList;
  const emptyAction = (
    <button type="button" className={`${btn} min-h-11`} disabled={emptyTopList.length === 0 || planIds.length >= MAX_PLAN_TARGETS} onClick={() => addTopThree(emptyTopList)}>
      Add top {TOP_N}
    </button>
  );
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
  const headerActions = (
    <>
      <ThemeToggle />
      <AuthControl state={auth} />
    </>
  );
  // The plan rail's numbers: the timeline's plan while the timeline can be built, else none.
  const railPlan = stableNight && astroSite && catalog.status !== 'loading' ? timelinePlan : null;
  const railSlots = new Map(railPlan?.slots.map((x) => [x.id, x] as const) ?? []);
  const railRows = planRows.map((r) => {
    const slot = railSlots.get(r.id);
    return { id: r.id, name: r.name, mode: r.preset, window: slot !== undefined && slot.end.getTime() > slot.start.getTime() ? `${formatTime(slot.start)} to ${formatTime(slot.end)}` : null };
  });
  const railWarnings = railPlan?.slots.reduce((n, x) => n + x.warnings.filter((w) => w.severity === 'warning').length, 0) ?? 0;
  const goToRow = (id: string) => {
    const el = document.getElementById(`plan-row-${id}`);
    if (el === null) return;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  };
  const goToWarnings = () => {
    flushSync(() => setTimelineTick((t) => t + 1));
    const part = document.getElementById('night-timeline');
    part?.scrollIntoView({ block: 'start' });
    part?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  };
  const openAi = () => setAiOpen(true);
  const openShare = (what: ShareWhat = 'plan') => {
    setShareWhat(what);
    setSharedAt(new Date().toISOString());
    setImportPanel({ kind: 'none' });
    setShareOpen(true);
  };
  const showRail = railWide && tab === 'plan';
  // The Projects tab starts a new project from the open plan's setup: its scope and camera, its filter (Broadband when it has none) and the filters picked for the filter mix, and a sub length when every row of the plan shares one (else 60 s).
  // The minutes the plan holds for each target when narrowband filters are ticked (the broadband time and each ticked filter), and the filters they use.
  const nbPlanned = new Map<string, PlanLine[]>(
    planItems.flatMap((p): [string, PlanLine[]][] => {
      const m = mixViews.get(p.id);
      return m?.kind === 'mix' && m.narrowbandAdded === true ? [[p.id, m.lines.filter((l) => l.minutes > 0).map((l) => ({ filterId: l.filterId ?? BROADBAND_ID, minutes: l.minutes }))]] : [];
    }),
  );
  const nbFilterIds = [...nbPlanned.values()].flatMap((lines) => lines.map((l) => l.filterId));
  const projectFilters = [...(train?.kind === 'optical' ? [train.filterId ?? BROADBAND_ID, ...mixPicks] : [BROADBAND_ID]), ...nbFilterIds];
  const projectFilterOrder = [BROADBAND_ID, ...profile.equipment.filters.map((f) => f.id)];
  const projectContext = {
    scopeId: train?.kind === 'optical' ? train.scopeId : null,
    cameraId: train?.kind === 'optical' ? train.cameraId : null,
    filterIds: projectFilterOrder.filter((id) => projectFilters.includes(id)),
    subSeconds: (() => {
      const subs = [...new Set(exposureRows.map((r) => r.subSeconds).filter((x): x is number => x !== null))];
      return subs.length === 1 ? subs[0] : 60;
    })(),
  };
  const localToday = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();
  return (
    <>
    <div
      className="planner-root space-y-8 text-p-t1 print:hidden [&_h2]:scroll-mt-4 [&_section[id]]:scroll-mt-4"
      style={{ '--planner-nav': `${stickyTop.nav}px`, '--planner-top': `${stickyTop.nav + stickyTop.strip}px` } as React.CSSProperties}
    >
      <header className="flex items-center justify-between gap-x-4">
        <h1 className="shrink-0 text-xl font-light tracking-[0.15em] text-p-t1 sm:text-3xl sm:tracking-[0.2em] md:text-4xl">IMAGING PLANNER</h1>
        {navSlot === null && <div className="flex min-w-0 items-center justify-end gap-2 print:hidden">{headerActions}</div>}
      </header>
      {navSlot && createPortal(headerActions, navSlot)}

      <p aria-live="polite" className="sr-only">{added?.say ?? ''}</p>

      {/* Messages float at the bottom of the window, so showing one never pushes the page down. */}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-col gap-2">
        {notice && (
          <p role="status" className="pointer-events-none bg-p-surface border border-p-accent/60 rounded px-3 py-2 break-words text-p-info-text font-normal text-sm">
            {notice}
          </p>
        )}
        {importError && (
          <p role="alert" className="pointer-events-none bg-p-surface border border-p-warn/60 rounded px-3 py-2 break-words text-p-warn-text font-normal text-sm">
            {importError}
          </p>
        )}
        {planError && (
          <p role="alert" className="pointer-events-none bg-p-surface border border-p-warn/60 rounded px-3 py-2 break-words text-p-warn-text font-normal text-sm">
            Could not plan: {planError}
          </p>
        )}
      </div>

      {profileHeld !== null && (
        <p role="alert" data-testid="profile-held" className="break-words bg-p-warn-fill/15 border border-p-warn/40 rounded px-3 py-2 text-p-warn-text font-normal text-sm">
          {profileHeld.why}
        </p>
      )}

      {(heldPlans !== null || planMessages.length > 0 || favs.notes.length > 0) && (
        <div className="space-y-3" data-testid="plans-notices">
          {heldPlans !== null && (
            <div role="group" aria-labelledby="held-plans-title" data-testid="plans-held" className="rounded-lg border border-p-warn/50 bg-p-bg/80 p-4">
              <p id="held-plans-title" className="text-sm font-normal text-p-t1">{HELD_TITLE[heldPlans.why]}</p>
              <p className="mt-1 text-sm font-normal text-p-t1/90">
                {heldPlans.detail ? `The copy failed: ${heldPlans.detail}. ` : ''}
                Nothing is saved until you replace them. A backup is kept first.
              </p>
              <button type="button" className={`${btn} mt-3 min-h-11`} onClick={replaceHeldPlans}>Replace the saved plans</button>
            </div>
          )}
          {(planMessages.length > 0 || favs.notes.length > 0) && (
            <div role="group" aria-label="About your saved plans" data-testid="plans-messages" className="flex items-start gap-3 rounded-lg border border-p-accent/50 bg-p-bg/80 p-3">
              <p className="min-w-0 flex-1 text-sm font-normal text-p-t1/90">{[...planMessages, ...favs.notes].join(' ')}</p>
              <button type="button" className={`${btn} shrink-0`} onClick={() => { setPlanMessages([]); favs.clearNotes(); }}>Dismiss</button>
            </div>
          )}
        </div>
      )}

      <div role="tablist" aria-label="Planner" className="flex gap-2 border-b border-p-line/15">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => selectTab(t.id)}
            onKeyDown={(e) => {
              const to = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
              if (to < 0) return;
              e.preventDefault();
              selectTab(TABS[to].id);
              document.getElementById(`tab-${TABS[to].id}`)?.focus();
            }}
            className={`min-h-11 rounded-t px-4 text-sm font-normal ${tab === t.id ? 'border-b-2 border-p-accent text-p-t1' : 'text-p-t1/70 hover:text-p-t1'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section ref={stripRef} hidden={tab === 'projects'} aria-labelledby="controls-heading" className="sticky top-[var(--planner-nav,0px)] z-30 rounded-lg border border-p-line/10 bg-p-bg/95 backdrop-blur">
        <h2 id="controls-heading" className="sr-only">{nightWord.toUpperCase()}</h2>
        <div className="flex items-center gap-2 px-2 sm:px-4">
          <button
            type="button"
            aria-expanded={controlsOpen}
            aria-controls="controls-panel"
            onClick={() => setControlsOpen(!controlsOpen)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded text-left text-sm font-normal text-p-t1"
          >
            <span aria-hidden="true" className="w-4 shrink-0 text-p-t1/70">{controlsOpen ? '▾' : '▸'}</span>
            <span className="min-w-0 line-clamp-2">{[date === '' ? '' : nightDateText(date), site.name, train.name].filter((x) => x !== '').join(' · ')}</span>
            <span className="shrink-0 text-p-accent underline underline-offset-2">{controlsOpen ? 'close' : 'edit'}</span>
          </button>
          <button type="button" onClick={changeSite} className="min-h-11 shrink-0 rounded px-2 text-sm font-normal text-p-accent underline underline-offset-2">
            Change site
          </button>
        </div>
        <div id="controls-panel" hidden={!controlsOpen} className="max-h-[60vh] overflow-y-auto border-t border-p-line/10 p-4">
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1.6fr_1.6fr] [&>*]:min-w-0">
          <div>
            <label htmlFor="plan-date" className="block text-p-t1/90 font-normal text-sm mb-1">Evening of</label>
            <input id="plan-date" type="date" className={`${field} w-full`} value={date} onChange={(e) => e.target.value && editOpen({ date: e.target.value })} />
            <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Quick dates">
              {quickDates.map((q) => (
                <button key={q.label} type="button" aria-pressed={date === q.date} onClick={() => editOpen({ date: q.date })} className={`${btn} min-h-11 ${date === q.date ? 'bg-p-raised/15' : ''}`}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="plan-site" className="block text-p-t1/90 font-normal text-sm mb-1">Site</label>
            <WrapSelect
              id="plan-site"
              className="w-full"
              value={site.id}
              onChange={(e) => {
                editOpen({ siteId: e.target.value });
                rememberSelection(e.target.value, train.id);
                loadForm(usable.find((x) => x.id === e.target.value)?.blockedArcs ?? [], true);
              }}
            >
              {usable.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </WrapSelect>
            <button
              type="button"
              onClick={changeSite}
              className="mt-1 inline-flex min-h-11 items-center rounded px-1 text-sm font-normal text-p-accent underline underline-offset-2"
            >
              Change or find a site
            </button>
          </div>
          <div>
            <label htmlFor="plan-train" className="block text-p-t1/90 font-normal text-sm mb-1">Setup</label>
            <WrapSelect id="plan-train" className="w-full" value={train.id} onChange={(e) => chooseTrain(e.target.value)}>
              {profile.trains.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.kind === 'smart' ? ' (smart scope)' : ''}</option>
              ))}
            </WrapSelect>
            <p className="mt-1 break-words text-sm font-normal text-p-t1/80" data-testid="train-filter">
              Filter: {train.kind !== 'optical' ? 'built in (smart scope)' : train.filterId === undefined ? 'none' : (profile.equipment.filters.find((f) => f.id === train.filterId)?.name ?? 'none')}
            </p>
            {train.kind === 'optical' && profile.equipment.filters.some((f) => f.id !== train.filterId) && (
              <fieldset className="min-w-0" data-testid="mix-filters">
                <legend className="text-sm font-normal text-p-t1/80">Filter mix: more filters to compare</legend>
                {profile.equipment.filters
                  .filter((f) => f.id !== train.filterId)
                  .map((f) => (
                    <label key={f.id} className="flex min-h-11 max-w-full items-center gap-2 break-words pr-2 text-sm font-normal text-p-t1/90">
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-p-focus"
                        checked={mixPicks.has(f.id)}
                        onChange={(e) => setMixPicks((prev) => (e.target.checked ? new Set([...prev, f.id]) : new Set([...prev].filter((x) => x !== f.id))))}
                      />
                      <span className="min-w-0">Use {f.name}</span>
                    </label>
                  ))}
              </fieldset>
            )}
            <button
              type="button"
              onClick={changeTrain}
              className="inline-flex min-h-11 items-center rounded px-1 text-sm font-normal text-p-accent underline underline-offset-2"
            >
              Change this setup
            </button>
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
      <div id="panel-plan" role="tabpanel" aria-labelledby="tab-plan" hidden={tab !== 'plan'} className={showRail ? 'grid grid-cols-[minmax(0,1fr)_280px] gap-x-6' : 'space-y-8'}>
      <div className="min-w-0 space-y-8">
      <PlansBar
        plans={plans?.plans.map((p) => ({ id: p.id, name: p.name, targets: p.targets.length })) ?? []}
        openId={plans?.openId ?? ''}
        onOpen={openPlanById}
        onNew={createPlan}
        onRename={renameOpenPlan}
        onDuplicate={duplicateOpenPlan}
        onDelete={deleteOpenPlan}
      />

      <OpenPlan
        name={open?.name ?? ''}
        rows={planRows}
        onRemove={removeFromPlan}
        trainNote={trainNote}
        staleNotes={staleNotes}
        onChangeTrain={() => goToControl('train')}
        pastDate={open !== null && tonightDate !== '' && open.date < tonightDate ? nightDateText(open.date) : null}
        onMoveToTonight={moveToTonight}
        emptyAction={emptyAction}
        find={{
          open: findIsOpen,
          count: ranked === null ? null : mainList.length + planetGroup.length,
          onToggle: () => setFindOpen(!findIsOpen),
          children: (
            <>
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
        renderBodyDetail={solarDetail}
      />

      <section aria-labelledby="list-heading" className="mt-4 border-t border-p-line/10 pt-3">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <h3 id="list-heading" className="text-base font-medium uppercase text-p-t1 tracking-[0.1em]">Best {group.noun} for {nightWord}</h3>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="f-type" className="block text-p-t1/90 font-normal text-sm mb-1">Type</label>
              <WrapSelect id="f-type" className="w-full" value={group.id} onChange={(e) => chooseType(e.target.value)}>
                {TYPE_GROUPS.map((g) => {
                  const n = typeCounts === null ? null : groupCount(g, typeCounts.counts, typeCounts.solarUp);
                  const wrong = typeCounts === null || g.id === SOLAR_SYSTEM ? null : groupNotFit(g, typeCounts.notFit);
                  const noneFit = n === 0 && wrong !== null && wrong.tooLarge + wrong.tooSmall > 0;
                  // Up but nothing fits is said so and stays pickable (the list explains it); a choice with nothing up at all is shown, said so
                  // and not pickable, unless it is the one chosen (the night or train moved under it). Deep-sky types count what fits; All and Solar system what is up.
                  const countText = n === null ? '' : noneFit ? `${wrong!.tooLarge + wrong!.tooSmall} up, none fit this camera view` : n === 0 ? `none up ${nightWord}` : g.types === undefined ? `${n} up ${nightWord}` : `${n} fit ${nightWord}`;
                  const empty = n === 0 && !noneFit;
                  return (
                    <option
                      key={g.id}
                      value={g.id}
                      disabled={empty && g.id !== group.id}
                    >
                      {countText === '' ? g.label : `${g.label} · ${countText}`}
                    </option>
                  );
                })}
              </WrapSelect>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-p-t1/90 font-normal text-sm">
              <input type="checkbox" checked={showNoFit} onChange={(e) => setShowNoFit(e.target.checked)} className="h-5 w-5 accent-p-focus" />
              Show targets that do not fit
            </label>
          </div>
        </div>

        <p className="mb-3 text-p-t1/70 font-normal text-sm" data-testid="score-note">
          Score is out of 100, best first.{group.id === 'all' ? ' Types are mixed, so not strictly in score order.' : ''}
        </p>
        <Fold id="score-fold" title="Not ranked">
          <p className="mb-3 text-p-t1/70 font-normal text-sm">Asterisms and double stars are not ranked; search finds both.</p>
        </Fold>
        {hasNight && midMoon !== null && midMoon > BRIGHT_MOON && (
          <p className="mb-3 text-p-t1/90 font-normal text-sm" data-testid="bright-moon-note">
            Bright Moon ({(midMoon * 100).toFixed(0)}% lit): faint nebulae and galaxies will wash out.
          </p>
        )}
        {planetary && (
          <p className="mb-3 flex flex-wrap items-center gap-x-3 text-p-t1/90 font-normal text-sm" data-testid="planetary-note">
            <span>Solar-system setup: most deep-sky targets will not fit.</span>
            {deepTrain && (
              <button type="button" className={`${btn} min-h-11`} onClick={() => chooseTrain(deepTrain.id)}>
                Use {deepTrain.name}
              </button>
            )}
          </p>
        )}

        {stableNight && !hasNight ? (
          <p className="text-p-t1/90 font-normal">No astronomical night, so there is nothing to rank.</p>
        ) : tonight.status === 'error' ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-p-warn/40 bg-p-warn-fill/15 px-3 py-2 text-p-warn-text font-normal text-sm">
            <span className="min-w-0 break-words">The list for {nightWord} could not be ranked: {tonight.message}</span>
            <button type="button" className={`${btn} min-h-11`} onClick={retryTonight}>Retry</button>
          </div>
        ) : tonight.status !== 'ready' ? (
          planError ? null : (
            <p aria-live="polite" aria-busy="true" className="text-p-t1/90 font-normal">
              Ranking the whole catalog for {nightWord}…
            </p>
          )
        ) : (
          <>
            {!isSolar && <NoFitNote counts={ranked!.counts} showNoFit={showNoFit} listed={noFitList.length} nightWord={nightWord} />}
            {(planetGroup.length > 0 || notUpGroup.length > 0) && (
              <Group id="planets-group" title={`Solar system up ${nightWord} (${planetGroup.length})`} open={groupOpen} onToggle={() => setPlanetsOpen(!groupOpen)}>
                {planetGroup.length > 0 && <TargetList {...listProps} entries={planetGroup} label={`Solar system up ${nightWord}`} idPrefix="planet" fitText={bodyFit} />}
                {notUpGroup.length > 0 && (
                  <Group id="planets-notup-group" title={`Not up ${nightWord} (${notUpGroup.length})`} open={notUpShown} onToggle={() => setNotUpOpen(!notUpShown)}>
                    <TargetList {...listProps} entries={notUpGroup} label={`Solar system not up ${nightWord}`} idPrefix="notup" fitText={bodyFit} notClear={nightWord} />
                  </Group>
                )}
              </Group>
            )}
            {isSolar ? (
              planetGroup.length === 0 ? <p className="text-p-t1/90 font-normal" data-testid="list-empty">{`No Moon or planet is up ${nightWord} above your horizon and minimum altitude.`}</p> : topThree(planetGroup)
            ) : mainList.length === 0 ? (
              <p className="text-p-t1/90 font-normal" data-testid="list-empty">{emptyText(ranked!.typeNotFit)}</p>
            ) : (
              <>
                {planetGroup.length > 0 && <h3 className="mt-4 text-base font-medium text-p-t1">Best deep-sky targets</h3>}
                {topThree(mainList)}
                <TargetList {...listProps} entries={mainList} label={`Targets ranked for ${nightWord}`} idPrefix="target" />
              </>
            )}
            {noFitList.length > 0 && (
              <Group id="nofit-group" title={`Does not fit this camera view (${noFitList.length})`} open={noFitOpen} onToggle={() => setNoFitOpen(!noFitOpen)}>
                <TargetList {...listProps} entries={noFitList} label="Targets that do not fit this camera view" idPrefix="nofit" fitText={noFitFit} />
              </Group>
            )}
          </>
        )}
      </section>
            </>
          ),
        }}
        action={
          <button
            type="button"
            id="ai-plan-open"
            className={`${btn} min-h-11`}
            aria-haspopup="dialog"
            aria-expanded={aiOpen}
            onClick={openAi}
          >
            Plan my night with AI
          </button>
        }
        menu={
          <OverflowMenu
            label="More"
            triggerId="plan-more"
            items={[
              {
                label: 'Share and export…',
                onSelect: openShare,
              },
              { label: 'Export CSV', onSelect: exportCsv, disabled: ranked === null || filtered.length === 0 },
              { label: 'Print or save as PDF', onSelect: () => window.print() },
            ]}
          />
        }
      >
        <Collapsible id="night-and-horizon" title="Night and horizon">
          <div className="space-y-1">
            <p className="text-p-t1/80 font-normal text-sm" data-testid="night-summary">
              {nightText}
              {zoneText}
            </p>
            <p className="text-p-t1/80 font-normal text-sm" data-testid="horizon-summary">
              {horizonText}{' '}
              <a href="#horizon" className="inline-flex min-h-11 items-center rounded px-1 text-p-accent underline underline-offset-2">
                Edit horizon
              </a>
            </p>
          </div>
        </Collapsible>
        <Collapsible id="night-timeline" title="Night timeline" openTick={timelineTick}>
          {stableNight && astroSite && catalog.status !== 'loading' ? (
            <PlanTimeline
              profile={profile}
              items={timelineItems}
              presetUsed={presetUsed}
              rowNumbers={rowNumbers}
              startTime={open?.startTime ?? null}
              unscheduled={Math.max(0, planTargets.length - MAX_SLOTS)}
              onChange={applyTimeline}
              catalog={catalog.status === 'ready' ? catalog.index : null}
              site={astroSite}
              night={stableNight}
              horizon={horizon}
              minAltitude={minAltitude}
              bortle={bortle}
              formatTime={formatTime}
              nightWord={nightWord}
              timeZone={siteZone || zone || undefined}
              report={itineraryReport}
              onPlan={setTimelinePlan}
            />
          ) : (
            <p className="text-p-t1/90 font-normal text-sm">The timeline appears once the date and the catalog have loaded.</p>
          )}
        </Collapsible>
      </OpenPlan>

      {aiOpen && (
        <AiPlanFlyout
          base={aiBase}
          targets={aiTargets}
          blocked={aiBlocked}
          leftOutNote={aiLeftOut}
          staleNotes={staleNotes}
          onChangeStale={() => {
            flushSync(() => setAiOpen(false));
            goToControl('train');
          }}
          profile={profile}
          train={train}
          siteName={site.name}
          nightWord={nightWord}
          night={hasNight ? (stableNight as AstronomicalNight) : null}
          nightText={nightText}
          horizonText={horizonText}
          presetLabels={aiPresetLabels}
          catalogTargets={catalog.status === 'ready' ? catalog.index.targets : []}
          mixFor={aiMixFor}
          onNbHours={setNbHoursFor}
          onNbTick={setNbTickFor}
          formatTime={formatTime}
          owner={owner}
          fetchPlan={aiFetch}
          onApply={applyAiPlan}
          onClose={closeAi}
        />
      )}
      {shareOpen && (
        <ShareSheet
          planName={open?.name ?? ''}
          planCount={plans?.plans.length ?? 1}
          projectCount={projectsApi.state.projects.length}
          what={shareNow}
          onWhat={setShareWhat}
          blocked={shareBlocked}
          note={heldNote}
          make={makeShare}
          asiair={{ count: asiairTargets.length, panes: asiairPanes(asiairTargets), left: asiairLeft, fovNote: asiairFov === null && train ? 'Field size unknown, so each position uses a 60 arcminute pane.' : null, make: asiairMake }}
          onPrint={() => window.print()}
          onPickFile={(f) => void pickPlansFile(f)}
          importPanel={importPanel}
          onImport={finishImport}
          onClose={() => {
            pendingImport.current = null;
            setShareOpen(false);
            setShareWhat('plan');
            window.setTimeout(() => document.getElementById(tab === 'projects' ? 'project-share' : 'plan-more')?.focus(), 0);
          }}
        />
      )}
      </div>
      {showRail && (
        <PlanRail
          name={open?.name ?? ''}
          rows={railRows}
          lightMin={railPlan !== null && railPlan.slots.length > 0 ? lightMinutes(railPlan) : null}
          nightHours={nightHours}
          warnings={railWarnings}
          onGoToRow={goToRow}
          onGoToWarnings={goToWarnings}
          onPlanWithAi={openAi}
          onShare={() => openShare()}
        />
      )}
      </div>

      <div id="panel-gear" role="tabpanel" aria-labelledby="tab-gear" hidden={tab !== 'gear'} className="space-y-8">
      <ProfileEditor
        profile={profile}
        onChange={applyProfile}
        quiet={gearQuiet}
        findSite={{ siteId: site.id, tick: findSiteTick }}
        plans={planRefs}
        openTrainId={train.id}
        onUseTrain={chooseTrain}
        openTrain={{ trainId: train.id, tick: openTrainTick }}
        onOpenPlan={(id) => {
          if (openPlanById(id)) selectTab('plan');
        }}
      />

      <section aria-labelledby="planner-settings-heading" className={panel}>
        <h2 id="planner-settings-heading" className="mb-2 text-base font-medium uppercase tracking-[0.1em] text-p-t1">Planner settings</h2>
        <label className="flex min-h-11 w-fit items-center gap-2 text-sm font-normal text-p-t1/90">
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-p-focus" checked={alwaysRestore} onChange={(e) => chooseAlwaysRestore(e.target.checked)} />
          <span>Always use my favorite exposure</span>
        </label>
        {favs.blocked !== null && <p className="mt-2 text-sm font-normal text-p-warn-text" data-testid="favorites-blocked">{favs.blocked}</p>}
      </section>

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

      

      <section aria-labelledby="profile-heading" className={panel}>
        <h2 id="profile-heading" className="text-xl font-light text-p-t1 tracking-[0.15em] mb-4">PROFILE</h2>
        <div className="flex flex-wrap items-end gap-4">
          <button
            type="button"
            className={btn}
            onClick={() => download('fpo-planner-profile.json', profileHeld !== null ? profileHeld.text : `${JSON.stringify(profile, null, 2)}\n`, 'application/json')}
          >
            Export profile (JSON)
          </button>
          {importControl}
        </div>
        <div className="mt-4">
          <ResetAll onConfirm={resetAll} />
        </div>
        <p className="text-p-t1/60 font-normal text-sm mt-3">
          Your profile and plans stay in this browser.
        </p>
      </section>
      </div>

      <div id="panel-projects" role="tabpanel" aria-labelledby="tab-projects" hidden={tab !== 'projects'} className="space-y-8">
        {projectsSeen && (
          <ProjectsTab
            api={projectsApi}
            profile={profile}
            targetName={targetName}
            context={projectContext}
            planTargets={planItems.map(({ id }) => ({ id, name: targetName(id) }))}
            planned={nbPlanned}
            today={tonightDate !== '' ? tonightDate : localToday}
            search={{ catalog, onRetryCatalog: retryCatalog, scorer, nightWord, formatTime }}
            onShare={() => openShare('projects')}
          />
        )}
      </div>
    </div>
    {printing && (
    <PrintSheet doc={docFor(shareOpen && shareNow !== 'projects' ? shareNow : 'plan')} />
    )}
    </>
  );
}
