'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { moonIllumination } from '@/planner/astro';
import { apparentDiameterArcsec } from '@/planner/planets';
import type { CardBody } from '@/planner/planets';
import type { AstronomicalNight } from '@/planner/astro';
import { rigOf } from '@/planner/ai/body';
import type { PlanTarget } from '@/planner/ai/body';
import { MAX_TARGETS } from '@/planner/ai/facts';
import { loadCatalog } from '@/planner/catalog/loader';
import type { CatalogIndex } from '@/planner/catalog/search';
import { makeCsvTime, planRowsToCsv, planToCsv } from '@/planner/export';
import type { PlanExposureRow } from '@/planner/export';
import { arcToHorizonPoints, ProfileError } from '@/planner/profile';
import type { BlockedArc, Profile } from '@/planner/profile';
import { DEFAULT_BORTLE, MODE_ORDER, PRESETS } from '@/planner/exposure';
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
  withTrainFilter,
} from '@/planner/state';
import { assertImportSize, profileFromText } from '@/planner/state/edit';
import { FAVORITES_KEY, favoriteOf, listFavoritesBackups, withFavorite, withoutFavorite } from '@/planner/state/favorites';
import type { Favorite } from '@/planner/state/favorites';
import {
  MAX_PLAN_TARGETS,
  PLANS_KEY,
  EXPOSURE_NOTICE_KEY,
  MAX_BACKUPS,
  DAMAGED_NOTICE,
  NEWER_NOTICE,
  clearOldPlanKeys,
  cutMessage,
  deletePlan,
  duplicatePlan,
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
import type { PlanDefaults, PlanTargetRef, PlansState } from '@/planner/state/plans';
import type { HorizonErrors, HorizonField, HorizonFields } from '@/planner/state';
import AiPlanPanel from './AiPlanPanel';
import AltitudeChart from './AltitudeChart';
import AuthControl from './AuthControl';
import { loadAuthState } from './authState';
import type { AuthState } from './authState';
import Collapsible from './Collapsible';
import HorizonEditor, { describeOverlaps } from './HorizonEditor';
import ItinerarySection from './ItinerarySection';
import NumberSlider from './NumberSlider';
import OverflowMenu from './OverflowMenu';
import SolarSystemDetail from './SolarSystemDetail';
import PrintSheet from './PrintSheet';
import { download } from './download';
import type { ItineraryReport } from './ItinerarySection';
import { ITINERARY_KEY, MAX_SLOTS } from '@/planner/itinerary';
import type { ItineraryItem } from '@/planner/itinerary';
import WrapSelect from './WrapSelect';
import ProfileEditor from './ProfileEditor';
import ResetAll from './ResetAll';
import OpenPlan from './OpenPlan';
import type { PlanRow } from './OpenPlan';
import PlansBar from './PlansBar';
import PlanRowExposure from './PlanRowExposure';
import { baseOf, presetLabel, rowExposure, withNumber, withPreset } from './rowExposure';
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

/** What the page says when another tab has reset the saved data. */
const RESET_ELSEWHERE = 'The plans were reset in another tab, so this page starts fresh too.';

/** Above this share of the Moon lit at mid-night, the list says so in words. */
const BRIGHT_MOON = 0.8;

const TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'gear', label: 'Gear and site' },
] as const;

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
  const [tab, setTab] = useState<'plan' | 'gear'>('plan');
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
  // The night timeline leaves its current plan here; the print sheet reads it when printing starts (no re-render on every change).
  const itineraryReport = useRef<ItineraryReport | null>(null);
  // Who is signed in: the sign-in control at the top shows it, and the owner sees the AI plan's review switch; a failed read leaves the page as a guest's.
  const [auth, setAuth] = useState<AuthState>({ kind: 'signedOut' });
  const owner = auth.kind === 'signedIn' && auth.owner;
  // Reset all: the count asks for focus on the button once the page has settled.
  const [resetFocus, setResetFocus] = useState(0);
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
    if (id === 'plan' || id === 'gear') {
      setTab(id);
      return;
    }
    const el = id === '' ? null : document.getElementById(id);
    const panel = el?.closest<HTMLElement>('[role="tabpanel"]');
    if (el && panel) {
      setTab(panel.id === 'panel-gear' ? 'gear' : 'plan');
      requestAnimationFrame(() => el.scrollIntoView());
    }
  }, []);
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
  const selectTab = (next: 'plan' | 'gear') => {
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
      const openSite = loaded.sites.find((x) => x.id === open.siteId) ?? loaded.sites[0];
      if (openSite && openSite.id !== home.id) loadForm(openSite.blockedArcs, true);
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

  /** Stores an edited profile. The edit has been validated; a storage failure is said out loud and the edit stays on screen. */
  const applyProfile = useCallback((next: Profile) => {
    setProfile(next);
    try {
      saveProfile(window.localStorage, next);
    } catch (e) {
      setNotice(`Edit not saved, so it is lost on reload: ${(e as Error).message}`);
    }
  }, []);

  const open = plans?.plans.find((p) => p.id === plans.openId) ?? null;
  // The open plan's night, site and train; a site or train that is gone from the profile is the first, as before.
  const date = open?.date ?? initialDate ?? '';
  const site = profile.sites.find((s) => s.id === open?.siteId) ?? profile.sites[0];
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
    const siteOf = (st: PlansState) => profile.sites.find((x) => x.id === st.plans.find((p) => p.id === st.openId)?.siteId) ?? profile.sites[0];
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
    const siteOf = (st: PlansState) => profile.sites.find((x) => x.id === st.plans.find((p) => p.id === st.openId)?.siteId) ?? profile.sites[0];
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
      const home = profile.sites.find((x) => x.id === open?.siteId) ?? profile.sites[0];
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
    if (noFitList.some((e) => e.id === id)) return 'Listed under “Does not fit this frame” below.';
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
      const arcs = fields.map((z) => ({ startAz: Number(z.start) % 360, endAz: Number(z.end) % 360, heightDeg: Number(z.height) }));
      const next = withSiteArcs(profile, site.id, arcs);
      saveProfile(window.localStorage, next);
      setProfile(next);
      setBases(arcs);
      setJustSaved(true);
    } catch (e) {
      setNotice(`Not saved: ${(e as Error).message}`);
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

  /** Opens the strip's controls and puts focus on the plan's own Evening of, Train or Filter control (a warning's "Change the ..." and "Change train"). */
  const goToControl = (control: 'date' | 'train' | 'filter') => {
    flushSync(() => setControlsOpen(true));
    document.getElementById(`plan-${control}`)?.focus();
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
    if (fav === null || SLOT_BODIES.some((b) => planetIdOf(b) === id)) return ref;
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
    if (ref === undefined || view?.kind !== 'ok' || view.customUnusable !== null) return;
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
    if (fav !== null && view !== undefined) editTarget(id, (t) => restoredRef(t, fav, view));
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
  const presetUsedIds = useMemo(() => new Set([...rowViews].filter(([, v]) => v.kind === 'ok' && v.customUnusable !== null).map(([id]) => id)), [rowViews]);
  /** The timeline's slots, from the plan's targets: the plan's own train and its filter for all; a Custom target is scheduled with its own numbers over the preset it differs from. */
  const timelineItems = useMemo(
    (): ItineraryItem[] =>
      planTargets.slice(0, MAX_SLOTS).map((t) => ({
        id: t.id,
        targetId: t.id,
        trainId: train?.id ?? '',
        filterId: train?.kind === 'optical' ? (train.filterId ?? null) : null,
        mode: baseOf(t),
        // A Custom value that does not work on this night is not scheduled: the slot uses the preset's own numbers (the row says so); the value stays stored.
        ...(t.preset === 'custom' && t.custom && !presetUsedIds.has(t.id) ? { overrides: t.custom } : {}),
        note: t.note ?? '',
      })),
    [planTargets, train, presetUsedIds],
  );
  /** A slot's changed preset or note goes onto its target; the slots' order is the plan's order; targets past the timeline's slots stay after them. */
  const applyTimeline = (items: ItineraryItem[], startTime: string | null) => {
    const byId = new Map(planTargets.map((t) => [t.id, t]));
    const kept = items.flatMap((i): PlanTargetRef[] => {
      const old = byId.get(i.id);
      if (old === undefined) return [];
      // A slot whose preset was changed in the timeline takes that preset (its own numbers go); otherwise the target is kept as it is.
      const next: PlanTargetRef = i.mode !== baseOf(old) ? withPreset(old, i.mode) : { ...old };
      if (i.note !== (old.note ?? '')) {
        if (i.note === '') delete next.note;
        else next.note = i.note;
      }
      return [next];
    });
    editOpen({ targets: [...kept, ...planTargets.slice(MAX_SLOTS)], startTime });
  };
  /** "Use this plan": the AI's order and first start time go into the open plan, and every target keeps its own exposure (preset or Custom numbers); targets it left out follow, in their order. */
  const applyAiPlan = (items: ItineraryItem[], startTime: string | null): Promise<boolean> => {
    const byId = new Map(planTargets.map((t) => [t.id, t]));
    const used = new Set<string>();
    const ordered = items.flatMap((i): PlanTargetRef[] => {
      const old = byId.get(i.targetId);
      if (old === undefined || used.has(i.targetId)) return [];
      used.add(i.targetId);
      return [{ ...old }];
    });
    return Promise.resolve(editOpen({ targets: [...ordered, ...planTargets.filter((t) => !used.has(t.id))], startTime }));
  };

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
      saveProfile(window.localStorage, next);
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

  const exportPlanCsv = () => download(`planner-plan-${date}.csv`, planRowsToCsv(exposureRows), 'text/csv;charset=utf-8', true);

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
            formatTime={formatTime}
            favorite={fav}
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
    };
  });
  /** The plan's rows with their numbers, for the plan CSV and the print sheet. */
  const exposureRows: PlanExposureRow[] = planItems.map(({ id, ref, target, body }) => {
    const view = rowViews.get(id);
    const ok = view?.kind === 'ok' ? view.chosen : null;
    return {
      name: body ?? target?.displayName ?? target?.name ?? id,
      type: body !== undefined ? 'Solar system' : target !== undefined ? typeLabel(target.type) : '',
      preset: body !== undefined ? '' : ref.preset === 'custom' ? 'Custom' : presetLabel(ref.preset),
      subSeconds: ok?.subSeconds ?? null,
      subCount: ok?.subCount ?? null,
      lightMin: ok?.integrationMin ?? null,
      note: ref.note ?? '',
    };
  });

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
    planIds.length === 0
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
        className="block w-full max-w-full min-w-0 text-white/90 font-normal text-sm"
      />
    </div>
  );

  if (!site || !train) {
    return (
      <div className={panel}>
        <h1 className="text-2xl font-light text-white tracking-[0.2em]">IMAGING PLANNER</h1>
        <p className="text-white/90 font-normal mt-4">
          The profile needs at least one site and one train. Import a profile below, or reset all to start from the sample.
        </p>
        {importError && (
          <p role="alert" className="bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm mt-4">
            {importError}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-4 mt-4">
          {importControl}
          <ResetAll onConfirm={resetAll} />
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
      : `Horizon: ${savedArcs.map((a) => `blocked ${a.startAz}° (${compass(a.startAz)}) to ${a.endAz}° (${compass(a.endAz)}), ${a.heightDeg}° high`).join('; ')}.${describeOverlaps(savedArcs) && ` ${describeOverlaps(savedArcs)}`}`;
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
  // The Solar system group: open on a planetary train, and for the Solar system view only; closed otherwise. A hand-made open or close wins.
  const groupOpen = planetsOpen ?? (planetary || isSolar);
  // "Not up" inside it: closed, unless nothing is up (then it is the only content).
  const notUpShown = notUpOpen ?? planetGroup.length === 0;
  // The plan mixes kinds when the train is for one and the open plan holds the other (adding is never blocked, the train never switches by itself).
  const trainNote =
    planetary && planItems.some((p) => p.body === undefined)
      ? 'The plan mixes a solar-system train and deep-sky targets.'
      : !planetary && planets > 0
        ? 'The plan mixes a deep-sky train and solar-system bodies.'
        : null;
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
        {e.isPlanet && solarBody(e.id) !== undefined && solarDetail(solarBody(e.id)!)}
      </div>
    );
  };
  const quickDates = [
    { label: 'Today', date: tonightDate },
    { label: 'Tomorrow', date: addDays(tonightDate, 1) },
    { label: '+1 week', date: addDays(tonightDate, 7) },
  ];
  const focusSearch = () => {
    // The search is in the Plan tab; from Gear and site the button goes there first.
    flushSync(() => {
      setTab('plan');
      setFindOpen(true);
    });
    if (window.location.hash === '#gear') window.history.pushState(null, '', '#plan');
    const input = document.getElementById('target-search');
    if (!input) return;
    input.scrollIntoView({ block: 'center' });
    input.focus({ preventScroll: true });
  };
  /** Why a type has no list: nothing up long enough, or everything that is up is the wrong size for this frame. */
  const emptyText = (notFit: RankResult['typeNotFit']): string => {
    const what = group.id === 'all' ? 'targets' : group.noun;
    // Only what is up is said: a type's catalog-wide too-large count would claim objects that never rise.
    const up = groupNotFit(group, notFit);
    const wrongSize = [up.tooLarge > 0 ? `${up.tooLarge} larger than this frame` : '', up.tooSmall > 0 ? `${up.tooSmall} too small for it` : ''].filter((x) => x !== '');
    if (wrongSize.length > 0) return `No ${what} that fit this frame are up ${nightWord}: ${wrongSize.join(' and ')}.${showNoFit ? ' They are listed below.' : ''}`;
    return `No ${what} are up long enough ${nightWord}, above your horizon and minimum altitude.`;
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
        <span id="top-three-note" className="min-w-0 text-sm font-normal text-white/80">
          {added?.id === TOP_ADDED_ID ? <span aria-hidden="true" className="text-emerald-300">{added.text}</span> : why}
        </span>
      </div>
    );
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
      <header className="flex items-center justify-between gap-x-4">
        <h1 className="shrink-0 text-xl font-light tracking-[0.15em] text-white sm:text-3xl sm:tracking-[0.2em] md:text-4xl">IMAGING PLANNER</h1>
        <AuthControl state={auth} />
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

      {(heldPlans !== null || planMessages.length > 0 || favs.notes.length > 0) && (
        <div className="space-y-3" data-testid="plans-notices">
          {heldPlans !== null && (
            <div role="group" aria-labelledby="held-plans-title" data-testid="plans-held" className="rounded-lg border border-orange-300/50 bg-black/80 p-4">
              <p id="held-plans-title" className="text-sm font-normal text-white">{HELD_TITLE[heldPlans.why]}</p>
              <p className="mt-1 text-sm font-normal text-white/90">
                {heldPlans.detail ? `The copy failed: ${heldPlans.detail}. ` : ''}
                They are left untouched, and what you do here is not saved until you replace them. Replacing keeps a copy of what is stored now first, under a dated backup name; no copy is ever overwritten, and the newest {MAX_BACKUPS} are kept.
              </p>
              <button type="button" className={`${btn} mt-3 min-h-11`} onClick={replaceHeldPlans}>Replace the saved plans</button>
            </div>
          )}
          {(planMessages.length > 0 || favs.notes.length > 0) && (
            <div role="group" aria-label="About your saved plans" data-testid="plans-messages" className="flex items-start gap-3 rounded-lg border border-sky-300/50 bg-black/80 p-3">
              <p className="min-w-0 flex-1 text-sm font-normal text-white/90">{[...planMessages, ...favs.notes].join(' ')}</p>
              <button type="button" className={`${btn} shrink-0`} onClick={() => { setPlanMessages([]); favs.clearNotes(); }}>Dismiss</button>
            </div>
          )}
        </div>
      )}

      <div role="tablist" aria-label="Planner" className="flex gap-2 border-b border-white/15">
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
            className={`min-h-11 rounded-t px-4 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-sky-400 ${tab === t.id ? 'border-b-2 border-sky-300 text-white' : 'text-white/70 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
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
            <input id="plan-date" type="date" className={`${field} w-full`} value={date} onChange={(e) => e.target.value && editOpen({ date: e.target.value })} />
            <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Quick dates">
              {quickDates.map((q) => (
                <button key={q.label} type="button" aria-pressed={date === q.date} onClick={() => editOpen({ date: q.date })} className={`${btn} min-h-11 ${date === q.date ? 'bg-white/15' : ''}`}>
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
                editOpen({ siteId: e.target.value });
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
                flushSync(() => {
                  setControlsOpen(false);
                  setTab('gear');
                });
                if (window.location.hash !== '#gear') window.history.pushState(null, '', '#gear');
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
                ? (<>No filters yet. <a href="#gear-heading" className="text-sky-300 underline underline-offset-2">Add one in Gear and site.</a></>)
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
      <div id="panel-plan" role="tabpanel" aria-labelledby="tab-plan" hidden={tab !== 'plan'} className="space-y-8">
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
        onChangeTrain={() => goToControl('train')}
        pastDate={open !== null && tonightDate !== '' && open.date < tonightDate ? nightDateText(open.date) : null}
        onMoveToTonight={moveToTonight}
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

      <section aria-labelledby="list-heading" className="mt-4 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <h3 id="list-heading" className="text-base font-medium uppercase text-white tracking-[0.1em]">Best {group.noun} for {nightWord}</h3>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="f-type" className="block text-white/90 font-normal text-sm mb-1">Type</label>
              <WrapSelect id="f-type" className="w-full" value={group.id} onChange={(e) => chooseType(e.target.value)}>
                {TYPE_GROUPS.map((g) => {
                  const n = typeCounts === null ? null : groupCount(g, typeCounts.counts, typeCounts.solarUp);
                  const wrong = typeCounts === null || g.id === SOLAR_SYSTEM ? null : groupNotFit(g, typeCounts.notFit);
                  const noneFit = n === 0 && wrong !== null && wrong.tooLarge + wrong.tooSmall > 0;
                  // Up but nothing fits is said so and stays pickable (the list explains it); a choice with nothing up at all is shown, said so
                  // and not pickable, unless it is the one chosen (the night or train moved under it). Deep-sky types count what fits; All and Solar system what is up.
                  const countText = n === null ? '' : noneFit ? `${wrong!.tooLarge + wrong!.tooSmall} up, none fit this frame` : n === 0 ? `none up ${nightWord}` : g.types === undefined ? `${n} up ${nightWord}` : `${n} fit ${nightWord}`;
                  const empty = n === 0 && !noneFit;
                  return (
                    <option
                      key={g.id}
                      value={g.id}
                      disabled={empty && g.id !== group.id}
                      title={empty ? `Nothing of this kind is up long enough ${nightWord}, above your horizon and minimum altitude.` : undefined}
                    >
                      {countText === '' ? g.label : `${g.label} · ${countText}`}
                    </option>
                  );
                })}
              </WrapSelect>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-white/90 font-normal text-sm">
              <input type="checkbox" checked={showNoFit} onChange={(e) => setShowNoFit(e.target.checked)} className="h-5 w-5 accent-sky-400" />
              Show targets that do not fit
            </label>
          </div>
        </div>

        <p className="mb-3 text-white/70 font-normal text-sm" data-testid="score-note">
          Score is out of 100 for {nightWord} at this site, with this train and minimum altitude: 100 is the best a target can do. It compares targets on one night, not across nights.{group.id === 'all' ? ' The list mixes types, so it is not strictly in score order.' : isSolar ? '' : ' This type is ranked over the whole catalog, best first.'} Asterisms are in All only, and double stars are not ranked; search finds both.
        </p>
        {group.note !== undefined && <p className="mb-3 text-white/70 font-normal text-sm" data-testid="type-note">{group.note}</p>}
        {hasNight && midMoon !== null && midMoon > BRIGHT_MOON && (
          <p className="mb-3 text-white/90 font-normal text-sm" data-testid="bright-moon-note">
            Bright Moon ({(midMoon * 100).toFixed(0)}% lit at mid-night): faint nebulae and galaxies will wash out; clusters and bright objects hold up best. This is an estimate from the Moon&apos;s phase, not a sky reading.
          </p>
        )}
        {planetary && (
          <p className="mb-3 flex flex-wrap items-center gap-x-3 text-white/90 font-normal text-sm" data-testid="planetary-note">
            <span>This train is set up for the solar system, so most deep-sky targets are too large or too small for its frame.</span>
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
            {!isSolar && <NoFitNote counts={ranked!.counts} hidden={ranked!.hidden} showNoFit={showNoFit} listed={noFitList.length} nightWord={nightWord} />}
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
              planetGroup.length === 0 ? <p className="text-white/90 font-normal" data-testid="list-empty">{`No Moon or planet is up ${nightWord} above your horizon and minimum altitude.`}</p> : topThree(planetGroup)
            ) : mainList.length === 0 ? (
              <p className="text-white/90 font-normal" data-testid="list-empty">{emptyText(ranked!.typeNotFit)}</p>
            ) : (
              <>
                {planetGroup.length > 0 && <h3 className="mt-4 text-base font-medium text-white">Best deep-sky targets</h3>}
                {topThree(mainList)}
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
            </>
          ),
        }}
        menu={
          <OverflowMenu
            label="More"
            items={[
              { label: 'Export CSV', onSelect: exportCsv, disabled: ranked === null || filtered.length === 0 },
              { label: 'Export plan CSV', onSelect: exportPlanCsv, disabled: planRows.length === 0 },
              { label: 'Print or save as PDF', onSelect: () => window.print(), disabled: ranked === null || (filtered.length === 0 && planRows.length === 0) },
            ]}
          />
        }
      >
        <Collapsible id="night-and-horizon" title="Night and horizon">
          <div className="space-y-1">
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
          </div>
        </Collapsible>
        <Collapsible id="night-timeline" title="Night timeline">
          {stableNight && astroSite && catalog.status !== 'loading' ? (
            <ItinerarySection
              profile={profile}
              items={timelineItems}
              presetUsedIds={presetUsedIds}
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
            />
          ) : (
            <p className="text-white/90 font-normal text-sm">The timeline appears once the date and the catalog have loaded.</p>
          )}
        </Collapsible>
      </OpenPlan>

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
        onApply={applyAiPlan}
      />
      </div>

      <div id="panel-gear" role="tabpanel" aria-labelledby="tab-gear" hidden={tab !== 'gear'} className="space-y-8">
      <section aria-labelledby="planner-settings-heading" className={panel}>
        <h2 id="planner-settings-heading" className="mb-2 text-base font-medium uppercase tracking-[0.1em] text-white">Planner settings</h2>
        <label className="flex min-h-11 w-fit items-center gap-2 text-sm font-normal text-white/90">
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-sky-400" checked={alwaysRestore} onChange={(e) => chooseAlwaysRestore(e.target.checked)} />
          <span>Always restore favorites</span>
        </label>
        <p className="mt-1 text-xs font-normal text-white/70">When a target you saved a favorite exposure for is added to a plan, its saved exposure is applied at once instead of asking.</p>
        {favs.blocked !== null && <p className="mt-2 text-sm font-normal text-orange-100" data-testid="favorites-blocked">{favs.blocked}</p>}
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
        </div>
        <div className="mt-4">
          <ResetAll onConfirm={resetAll} />
        </div>
        <p className="text-white/60 font-normal text-xs mt-3">
          Your profile, plans and captured list stay in this browser. Export your profile to keep a copy of the profile; plans are not part of that export. Imports are checked field by field; a rejected file changes nothing and the error names the field.
        </p>
      </section>
      </div>
    </div>
    {printing && (
    <PrintSheet
      date={date}
      siteLine={`Site: ${site.name} (${site.latitude.toFixed(4)}°, ${site.longitude.toFixed(4)}°${site.elevationM !== undefined ? `, ${site.elevationM} m` : ''}). ${zoneText}`}
      trainLine={`Train: ${train.name}${train.kind === 'optical' && train.filterId ? `, filter ${profile.equipment.filters.find((f) => f.id === train.filterId)?.name ?? train.filterId}` : ''}. Minimum altitude ${minAltitude}°.`}
      nightLine={nightText}
      horizonLine={horizonText}
      entries={filtered}
      planRows={exposureRows}
      captured={captured}
      formatTime={formatTime}
      itinerary={itineraryReport.current}
    />
    )}
    </>
  );
}
