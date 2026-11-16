'use client';

import { memo, useEffect, useRef, useState } from 'react';
import type { Profile, TrainEntry } from '@/planner/profile';
import { MAX_NAME_CHARS, gearProblems, outOfRangeKeys, problemText, reducedFocalNote, siteBadKeys, siteProblems } from '@/planner/profile';
import { limitOf } from '@/planner/profile/limits';
import { LIST_SPECS, addItem, addTrain, boxHint, removeItem, removeTrain, replaceItem, replaceTrain, textsOf } from '@/planner/state/edit';
import type { FieldSpec, ListKey } from '@/planner/state/edit';
import { GEAR_CLASSES, UsedError, usedText, usesOf } from '@/planner/state/gear';
import type { Use } from '@/planner/state/gear';
import type { GearClass, PlanRef } from '@/planner/state/gear';
import type { SiteFieldKey } from '@/planner/location/client';
import SiteFinder from './SiteFinder';
import WrapSelect from './WrapSelect';
import WrapText from './WrapText';

const field =
  'min-h-11 w-full bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';
const btn =
  'min-h-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';
const labelClass = 'block text-white/90 font-normal text-sm mb-1';

export interface ProfileEditorProps {
  profile: Profile;
  /** Receives a validated profile; the parent stores it. */
  onChange: (next: Profile) => void;
  /** Each change of `tick` opens the Site list on `siteId` with its Find box focused (the page's "Change or find a site"). */
  findSite?: { siteId: string; tick: number };
  /** The saved plans, so a site or train a plan still uses is not removed. */
  plans: readonly PlanRef[];
  /** The open plan's train: its card says so, and "Use in this plan" is off for it. */
  openTrainId: string;
  /** Makes a train the open plan's train (sticky: it stays until changed). */
  onUseTrain: (id: string) => void;
  /** Each change of `tick` opens the Trains class on that train's form, with its Name focused (the page's "Change" next to the train). */
  openTrain?: { trainId: string; tick: number };
  /** Each change of this number drops the refusal shown on the section: another part of the page has said it (a horizon Save), so it is not said twice. */
  quiet?: number;
  /** Opens a saved plan (a refusal to remove its site or train offers it). */
  onOpenPlan: (id: string) => void;
  /** The class the section opens on; Trains when not given. */
  startOn?: GearClass;
}

/** A refusal the Gear section has already put on screen (commit says it); a form that sees this one does not say it again. */
class ShownError extends Error {}

/** An edit refused because the saved gear could not be loaded. The page's notice says why; the Gear section only says "Not saved" on its status line, so the page has one alert, not two. */
export class HeldGearError extends Error {}

/** Which box a form takes the keyboard to when it appears: its Save (after saving) or its Name (a new item). */
type FocusTo = 'save' | 'name' | null;

/** The Find box of a site's form. */
export const findBoxId = (siteId: string) => `site-find-${siteId}`;

/** A gear class in the words the page uses: a "train" is called a setup (the help line says what it is). */
const classWord = (id: GearClass): string => (id === 'trains' ? 'Setups' : (GEAR_CLASSES.find((c) => c.id === id)?.label ?? ''));

const itemsOf = (profile: Profile, list: ListKey): ({ id: string; name: string } & object)[] => (list === 'sites' ? profile.sites : profile.equipment[list]);

/** The filled boxes of an item as one short line: "Focal length 2800 mm, Aperture 280 mm". */
function summaryOf(list: ListKey, item: object): string {
  const texts = textsOf(list, item);
  return LIST_SPECS[list].fields
    .filter((f) => f.key !== 'name' && texts[f.key] !== '')
    .map((f) => {
      const t = f.kind === 'tristate' ? (texts[f.key] === 'yes' ? 'yes' : 'no') : texts[f.key];
      const unit = f.kind === 'number' && limitOf(f.key)?.unit && Number.isFinite(Number(t)) ? ` ${limitOf(f.key)?.unit}` : ''; // a saved "abc" has no unit
      return `${f.label} ${t}${unit}`;
    })
    .join(', ');
}

function Box({ id, spec, value, onChange }: { id: string; spec: FieldSpec; value: string; onChange: (v: string) => void }) {
  const hint = spec.key === 'name' ? `up to ${MAX_NAME_CHARS} characters` : boxHint(spec);
  const label = hint ? `${spec.label} (${hint})` : spec.label;
  const options: readonly { value: string; text: string }[] | null =
    spec.kind === 'tristate'
      ? [{ value: '', text: 'Unknown' }, { value: 'yes', text: 'Yes' }, { value: 'no', text: 'No' }]
      : spec.kind === 'choice'
        ? [...(spec.required ? [] : [{ value: '', text: spec.emptyText ?? 'Unknown' }]), ...(spec.options ?? []).map((o) => ({ value: o, text: o }))]
        : null;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {options ? (
        <WrapSelect id={id} className="w-full" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.text}</option>
          ))}
        </WrapSelect>
      ) : (
        spec.kind === 'number' ? (
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={field}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <WrapText id={id} autoComplete="off" className={field} value={value} onChange={(e) => onChange(e.target.value)} />
        )
      )}
    </div>
  );
}

/** Save and Close with the error line under them. Escape closes the form (not while a list box is open). `focusTo` is where the keyboard goes when the form appears. */
function FormShell({ legend, error, notice, onSave, onClose, focusTo, nameId, children }: { legend: string; error: string | null; notice?: string; onSave: () => void; onClose: () => void; focusTo: () => FocusTo; nameId: string; children: React.ReactNode }) {
  const saveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const to = focusTo();
    if (to === 'save') saveRef.current?.focus();
    if (to === 'name') {
      const box = document.getElementById(nameId);
      box?.scrollIntoView({ block: 'center' });
      box?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the form appears
  }, []);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.target instanceof HTMLSelectElement) return;
        e.stopPropagation();
        onClose();
      }}
      className="mt-3 min-w-0 rounded border border-white/15 p-3 sm:p-4"
    >
      <fieldset className="min-w-0">
        <legend className="max-w-full break-words px-1 text-white font-normal text-sm">{legend}</legend>
        {notice && <p className="mb-3 break-words text-sm font-normal text-sky-100">{notice}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">{children}</div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button ref={saveRef} type="submit" className={btn}>Save</button>
          <button type="button" className={btn} onClick={onClose}>Close</button>
        </div>
        {error && (
          <p role="alert" className="mt-3 break-words bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
            <span aria-hidden="true">! </span>
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}

function ItemForm({ profile, list, item, onChange, onRefuse, onClose, focusTo }: { profile: Profile; list: ListKey; item: { id: string; name: string } & object; onChange: (p: Profile, what: string) => void; onRefuse: () => void; onClose: () => void; focusTo: () => FocusTo }) {
  const spec = LIST_SPECS[list];
  const [texts, setTexts] = useState(() => textsOf(list, item));
  // The boxes as they are this instant (state lags a render). A lookup that finishes later merges against this, so nothing typed meanwhile is lost.
  const textsRef = useRef(texts);
  const commit = (next: Record<string, string>) => {
    textsRef.current = next;
    setTexts(next);
  };
  const [error, setError] = useState<string | null>(null);
  // Boxes whose value a lookup wrote and the user has not edited since. A lookup may overwrite only these (and empty boxes); every other value is saved or typed by the user.
  const filled = useRef(new Set<string>());
  const run = (fn: () => Profile, what: string) => {
    try {
      const next = fn();
      setError(null);
      onChange(next, what);
    } catch (e) {
      if (e instanceof ShownError) return; // the Gear section has said it already
      onRefuse(); // an earlier "Saved ..." is not the news now
      setError((e as Error).message);
    }
  };
  const apply = (next: Record<string, string>, changed: SiteFieldKey[]) => {
    changed.forEach((k) => filled.current.add(k));
    commit(next);
  };
  return (
    <FormShell
      legend={`${spec.title === 'Site' ? 'Site' : spec.noun[0].toUpperCase() + spec.noun.slice(1)}: ${item.name}`}
      error={error}
      onSave={() => run(() => replaceItem(profile, list, item.id, texts), `Saved ${texts.name || item.name}.`)}
      onClose={onClose}
      focusTo={focusTo}
      nameId={`edit-${list}-${item.id}-name`}
    >
      {list === 'sites' && <SiteFinder inputId={findBoxId(item.id)} texts={texts} getTexts={() => textsRef.current} overwritable={filled.current} onApply={apply} />}
      {spec.fields.map((f) => (
        <Box
          key={f.key}
          id={`edit-${list}-${item.id}-${f.key}`}
          spec={f}
          value={texts[f.key] ?? ''}
          onChange={(v) => {
            filled.current.delete(f.key);
            commit({ ...textsRef.current, [f.key]: v });
          }}
        />
      ))}
    </FormShell>
  );
}

function TrainForm({ profile, train, use, onChange, onRefuse, onClose, focusTo }: { profile: Profile; train: TrainEntry; use: Use; onChange: (p: Profile, what: string) => void; onRefuse: () => void; onClose: () => void; focusTo: () => FocusTo }) {
  const [name, setName] = useState(train.name);
  const [scopeId, setScopeId] = useState(train.kind === 'optical' ? train.scopeId : '');
  const [cameraId, setCameraId] = useState(train.kind === 'optical' ? train.cameraId : '');
  const [filterId, setFilterId] = useState(train.kind === 'optical' ? (train.filterId ?? '') : '');
  const [accessoryIds, setAccessoryIds] = useState<string[]>(train.kind === 'optical' ? train.accessoryIds : []);
  const [smartScopeId, setSmartScopeId] = useState(train.kind === 'smart' ? train.smartScopeId : '');
  const [error, setError] = useState<string | null>(null);
  const eq = profile.equipment;
  const run = (fn: () => Profile, what: string) => {
    try {
      const next = fn();
      setError(null);
      onChange(next, what);
    } catch (e) {
      if (e instanceof ShownError) return; // the Gear section has said it already
      onRefuse(); // an earlier "Saved ..." is not the news now
      setError((e as Error).message);
    }
  };
  const base = `edit-train-${train.id}`;
  const select = (id: string, label: string, value: string, set: (v: string) => void, options: { id: string; name: string }[], none?: string) => (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <WrapSelect id={id} className="w-full" value={value} onChange={(e) => set(e.target.value)}>
        {none !== undefined && <option value="">{none}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </WrapSelect>
    </div>
  );
  return (
    <FormShell
      legend={`${train.kind === 'smart' ? 'Smart-scope setup' : 'Setup'}: ${train.name}`}
      error={error}
      onSave={() =>
        run(
          () => (train.kind === 'smart' ? replaceTrain(profile, train.id, { name, smartScopeId }) : replaceTrain(profile, train.id, { name, scopeId, accessoryIds, cameraId, filterId })),
          `Saved ${name || train.name}.`,
        )
      }
      onClose={onClose}
      focusTo={focusTo}
      nameId={`${base}-name`}
      notice={use.plans.length > 0 ? `${usedText(use)} Their exposure follows this change.` : undefined}
    >
      <div>
        <label htmlFor={`${base}-name`} className={labelClass}>Name (up to {MAX_NAME_CHARS} characters)</label>
        <WrapText id={`${base}-name`} autoComplete="off" className={field} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {train.kind === 'smart' ? (
        select(`${base}-smart`, 'Smart scope', smartScopeId, setSmartScopeId, eq.smartScopes)
      ) : (
        <>
          {select(`${base}-scope`, 'Scope', scopeId, setScopeId, eq.scopes)}
          {select(`${base}-camera`, 'Camera', cameraId, setCameraId, eq.cameras)}
          {select(`${base}-filter`, 'Filter', filterId, setFilterId, eq.filters, 'No filter')}
          <fieldset className="sm:col-span-2 xl:col-span-3">
            <legend className={labelClass}>Accessories</legend>
            {eq.accessories.length === 0 && <p className="text-white/70 text-sm">None in the library.</p>}
            <div className="flex flex-wrap gap-x-6">
              {eq.accessories.map((a) => (
                <label key={a.id} className="flex min-h-11 min-w-0 max-w-full items-center gap-2 break-words text-white/90 font-normal text-sm">
                  <input
                    type="checkbox"
                    className="shrink-0 accent-sky-400"
                    checked={accessoryIds.includes(a.id)}
                    onChange={(e) => setAccessoryIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))}
                  />
                  <span className="min-w-0 break-words">{a.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </FormShell>
  );
}

const chip = 'min-w-0 break-words rounded border px-2 py-1 text-sm font-normal text-white';
const chipLabel = 'block text-sm uppercase tracking-wide text-white/70';

function Chip({ tone, label, name }: { tone: string; label: string; name: string }) {
  return (
    <span className={`${chip} ${tone}`}>
      <span className={chipLabel}>{label}</span>
      {name}
    </span>
  );
}

const Join = () => (
  <span aria-hidden="true" className="text-white/60">
    ›
  </span>
);

/** One train as a chain of coloured parts: scope, reducer or other accessory, camera, filter. A smart scope is one part. */
function TrainChain({ profile, train }: { profile: Profile; train: TrainEntry }) {
  const eq = profile.equipment;
  if (train.kind === 'smart') {
    return (
      <div className="flex flex-wrap items-stretch gap-2">
        <Chip tone="border-violet-300/50 bg-violet-400/15" label="Smart scope" name={eq.smartScopes.find((s) => s.id === train.smartScopeId)?.name ?? train.smartScopeId} />
      </div>
    );
  }
  const nameOf = <T extends { id: string; name: string }>(xs: T[], id: string) => xs.find((x) => x.id === id)?.name ?? id;
  return (
    <div className="flex flex-wrap items-stretch gap-x-2 gap-y-2">
      <Chip tone="border-sky-300/50 bg-sky-400/15" label="Scope" name={nameOf(eq.scopes, train.scopeId)} />
      {train.accessoryIds.map((id) => (
        <span key={id} className="contents">
          <Join />
          <Chip tone="border-amber-300/50 bg-amber-400/15" label="Accessory" name={nameOf(eq.accessories, id)} />
        </span>
      ))}
      <Join />
      <Chip tone="border-emerald-300/50 bg-emerald-400/15" label="Camera" name={nameOf(eq.cameras, train.cameraId)} />
      <Join />
      <Chip tone="border-fuchsia-300/50 bg-fuchsia-400/15" label="Filter" name={train.filterId === undefined ? 'No filter' : nameOf(eq.filters, train.filterId)} />
    </div>
  );
}

/** What a card stands for: an item of a list, or a train. */
type Entry = { kind: 'item'; list: ListKey; item: { id: string; name: string } & object } | { kind: 'train'; train: TrainEntry };

/**
 * The Gear section: pick a class (Trains, Scopes with smart scopes, Cameras, Filters, Accessories, Sites), then list, add, change and remove
 * its items. Every Save goes through the profile validator; a refused edit leaves the profile as it was and shows the reason on the card.
 * Removing something a train or plan still uses is refused, in words, naming what uses it. The horizon has its own editor.
 */
function ProfileEditor({ profile, onChange, findSite, plans, openTrainId, onUseTrain, openTrain, onOpenPlan, quiet = 0, startOn = 'trains' }: ProfileEditorProps) {
  const [status, setStatus] = useState('');
  // The last removal, so the status line can offer one Undo while the profile is still the one that removal made.
  const [undo, setUndo] = useState<{ before: Profile; after: Profile; name: string } | null>(null);
  const focusNext = useRef<FocusTo>(null);
  const takeFocus = () => {
    const to = focusNext.current;
    focusNext.current = null;
    return to;
  };
  const [cls, setCls] = useState<GearClass>(startOn);
  // The one card whose form is open, and the one message (an error from Add, or a refusal) with the card it belongs to ('' for the class).
  const [editing, setEditing] = useState<string>('');
  const [problem, setProblem] = useState<{ card: string; text: string; plan?: { id: string; name: string } } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const seenQuiet = useRef(quiet);
  useEffect(() => {
    if (quiet === seenQuiet.current) return;
    seenQuiet.current = quiet;
    setProblem((p) => (p !== null && p.card === '' ? null : p));
  }, [quiet]);
  const [wantFind, setWantFind] = useState(0);
  const lastTick = useRef(findSite?.tick ?? 0);
  // A new request opens the Sites class on that site's form; once built, its Find box takes focus and the editor scrolls into view.
  useEffect(() => {
    if (findSite === undefined || findSite.tick === lastTick.current) return;
    lastTick.current = findSite.tick;
    setCls('sites');
    setEditing(`sites:${findSite.siteId}`);
    setWantFind(findSite.tick);
  }, [findSite]);
  useEffect(() => {
    if (wantFind === 0 || findSite === undefined) return;
    const box = document.getElementById(findBoxId(findSite.siteId));
    if (!box) return;
    box.scrollIntoView({ block: 'center' });
    box.focus({ preventScroll: true });
    setWantFind(0);
  }, [wantFind, cls, editing, findSite]);
  // A request to change a train (the page's "Change" next to the train) opens the Trains class on that train's form, Name focused.
  const lastTrainTick = useRef(openTrain?.tick ?? 0);
  const [wantTrain, setWantTrain] = useState('');
  useEffect(() => {
    if (openTrain === undefined || openTrain.tick === lastTrainTick.current) return;
    lastTrainTick.current = openTrain.tick;
    setCls('trains');
    setEditing(`trains:${openTrain.trainId}`);
    setWantTrain(openTrain.trainId);
  }, [openTrain]);
  useEffect(() => {
    if (wantTrain === '') return;
    const box = document.getElementById(`edit-train-${wantTrain}-name`);
    if (!box) return;
    box.scrollIntoView({ block: 'center' });
    box.focus({ preventScroll: true });
    setWantTrain('');
  }, [wantTrain, cls, editing]);
  /** Stores the profile, then says so. If the store refuses (another tab saved first) nothing is said as done: the refusal stays on the Gear section and is thrown on. */
  const commit = (next: Profile, what: string) => {
    try {
      onChange(next);
    } catch (e) {
      if (e instanceof HeldGearError) {
        setStatus(e.message);
        setProblem(null);
        throw new ShownError(e.message);
      }
      setStatus(''); // the last "Saved ..." is not the news now
      setProblem({ card: '', text: (e as Error).message });
      throw new ShownError((e as Error).message);
    }
    setStatus(what);
    setProblem(null);
    setUndo(null);
  };
  /** A form's Save: the form that replaces this one (its card changed) puts the keyboard back on Save. */
  const saveFromForm = (next: Profile, what: string) => {
    commit(next, what);
    focusNext.current = 'save';
  };
  const refuse = () => setStatus('');
  const closeForm = (card: string) => {
    setEditing('');
    window.setTimeout(() => document.getElementById(`gear-change-${card}`)?.focus(), 0);
  };
  const pick = (next: GearClass) => {
    focusNext.current = null;
    setCls(next);
    setEditing('');
    setProblem(null);
  };
  const tryAdd = (fn: () => Profile, what: string, cardOf: (p: Profile) => string) => {
    try {
      const next = fn();
      commit(next, what);
      focusNext.current = 'name';
      setEditing(cardOf(next));
    } catch (e) {
      if (e instanceof ShownError) return;
      setStatus('');
      setProblem({ card: '', text: (e as Error).message });
    }
  };
  const lastOf = <T extends { id: string }>(xs: T[]) => xs[xs.length - 1].id;
  const remove = (card: string, name: string, use: Use, fn: () => Profile) => {
    let next: Profile;
    try {
      next = fn();
    } catch (e) {
      // Only a refusal because plans use a site or train offers to open one of them.
      const planId = e instanceof UsedError && use.trains.length === 0 ? use.planIds[0] : undefined;
      setStatus('');
      setProblem({ card, text: (e as Error).message, ...(planId !== undefined ? { plan: { id: planId, name: use.plans[0] } } : {}) });
      return;
    }
    try {
      commit(next, `Removed ${name}.`);
    } catch {
      return; // commit has put the refusal on the Gear section
    }
    setUndo({ before: profile, after: next, name });
    setEditing((e) => (e === card ? '' : e));
    listRef.current?.focus();
  };
  const flagged = [...gearProblems(profile), ...siteProblems(profile)];

  const entries: Entry[] =
    cls === 'trains'
      ? profile.trains.map((train) => ({ kind: 'train', train }))
      : cls === 'scopes'
        ? [
            ...profile.equipment.scopes.map((item): Entry => ({ kind: 'item', list: 'scopes', item })),
            ...profile.equipment.smartScopes.map((item): Entry => ({ kind: 'item', list: 'smartScopes', item })),
          ]
        : itemsOf(profile, cls).map((item): Entry => ({ kind: 'item', list: cls, item }));
  const count = (c: GearClass) => (c === 'trains' ? profile.trains.length : c === 'scopes' ? profile.equipment.scopes.length + profile.equipment.smartScopes.length : itemsOf(profile, c).length);
  const classLabel = classWord(cls);
  const addButtons: { label: string; run: () => void }[] =
    cls === 'trains'
      ? [
          { label: 'Add setup', run: () => tryAdd(() => addTrain(profile, 'optical'), 'Added a setup. Change it and press Save.', (p) => `trains:${lastOf(p.trains)}`) },
          { label: 'Add smart-scope setup', run: () => tryAdd(() => addTrain(profile, 'smart'), 'Added a smart-scope setup. Change it and press Save.', (p) => `trains:${lastOf(p.trains)}`) },
        ]
      : cls === 'scopes'
        ? [
            { label: 'Add scope', run: () => tryAdd(() => addItem(profile, 'scopes'), 'Added a scope. Change it and press Save.', (p) => `scopes:${lastOf(p.equipment.scopes)}`) },
            { label: 'Add smart scope', run: () => tryAdd(() => addItem(profile, 'smartScopes'), 'Added a smart scope. Change it and press Save.', (p) => `smartScopes:${lastOf(p.equipment.smartScopes)}`) },
          ]
        : [{ label: `Add ${LIST_SPECS[cls].noun}`, run: () => tryAdd(() => addItem(profile, cls), `Added a ${LIST_SPECS[cls].noun}. Change it and press Save.`, (p) => `${cls}:${lastOf(itemsOf(p, cls))}`) }];

  return (
    <section aria-labelledby="gear-heading" className="bg-black/70 rounded-lg border border-white/10 p-4 sm:p-6">
      <h2 id="gear-heading" className="text-xl font-light text-white tracking-[0.15em] mb-2">GEAR</h2>
      <p data-testid="setup-help" className="text-white/80 font-normal text-sm mb-3">
        A setup (also called a train) is one scope with its camera, filter and accessories, the combination you image with. Pick a class, then add, change or remove its items. Leave an optional box empty when you do not know it: the planner then says the value is missing instead of guessing.
      </p>
      <div role="group" aria-label="Gear class" className="flex flex-wrap gap-2">
        {GEAR_CLASSES.map((c) => (
          <button key={c.id} type="button" aria-pressed={cls === c.id} className={`${btn} ${cls === c.id ? 'bg-white/15 border-sky-300' : ''}`} onClick={() => pick(c.id)}>
            {classWord(c.id)} ({count(c.id)})
          </button>
        ))}
      </div>
      <p aria-live="polite" className="my-2 min-h-5 break-words text-sky-100 font-normal text-sm">
        {status}
        {undo !== null && undo.after === profile && (
          <>
            {' '}
            <button
              type="button"
              className="min-h-11 rounded px-1 text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              onClick={() => {
                try {
                  commit(undo.before, `Put back ${undo.name}.`);
                } catch {
                  // commit has put the refusal on the Gear section
                }
              }}
            >
              Undo
            </button>
          </>
        )}
      </p>
      {problem?.card === '' && (
        <p role="alert" className="mb-3 break-words bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
          <span aria-hidden="true">! </span>
          {problem.text}
        </p>
      )}
      <h3 className="mb-2 text-base font-normal text-white">{classLabel}</h3>
      <ul ref={listRef} tabIndex={-1} aria-label={classLabel} className="space-y-3 focus:outline-none">
        {entries.length === 0 && <li className="text-white/70 text-sm">None yet.</li>}
        {entries.map((e) => {
          const id = e.kind === 'train' ? e.train.id : e.item.id;
          const card = e.kind === 'train' ? `trains:${id}` : `${e.list}:${id}`;
          const name = e.kind === 'train' ? e.train.name : e.item.name;
          const use = usesOf(profile, plans, e.kind === 'train' ? 'trains' : e.list, id);
          const valueOf = (item: object, key: string) => (item as unknown as Record<string, unknown>)[key];
          const flags =
            e.kind !== 'item'
              ? []
              : e.list === 'sites'
                ? siteBadKeys(e.item).map((key) => problemText({ key, value: valueOf(e.item, key) }, 'this site'))
                : outOfRangeKeys(e.item).map((key) => problemText({ key, value: valueOf(e.item, key) }));
          const focalNote = e.kind === 'train' ? reducedFocalNote(profile, e.train) : null;
          const isOpen = editing === card;
          const here = e.kind === 'train' && id === openTrainId;
          const detail = e.kind === 'train' ? '' : summaryOf(e.list, e.item);
          const tag = e.kind === 'item' && e.list === 'smartScopes' ? 'Smart scope' : e.kind === 'train' && e.train.kind === 'smart' ? 'Smart-scope setup' : '';
          return (
            <li key={card} data-testid={`gear-card-${card}`} className="min-w-0 rounded border border-white/15 p-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 break-words text-base font-normal text-white">{name}</span>
                {tag && <span className="text-sm text-white/70">{tag}</span>}
                {here && <span className="rounded border border-sky-300/60 px-1.5 text-sm text-sky-100">In this plan</span>}
              </div>
              {e.kind === 'train' && <div className="mt-2"><TrainChain profile={profile} train={e.train} /></div>}
              {focalNote !== null && <p className="mt-1 break-words text-sm font-normal text-sky-100" data-testid="gear-focal-note">{focalNote}</p>}
              {detail && <p className="mt-1 break-words text-sm font-normal text-white/80">{detail}</p>}
              <p className="mt-1 break-words text-sm font-normal text-white/80">{usedText(use)}</p>
              {flags.map((t) => (
                <p key={t} className="mt-1 break-words text-sm font-normal text-orange-100" data-testid="gear-flag">
                  <span aria-hidden="true">! </span>
                  {t} Change it and press Save.
                </p>
              ))}
              <div className="mt-2 flex flex-wrap gap-2">
                {e.kind === 'train' && (
                  <button type="button" className={btn} disabled={here} onClick={() => onUseTrain(id)}>
                    {here ? 'Used in this plan' : 'Use in this plan'}
                  </button>
                )}
                <button type="button" id={`gear-change-${card}`} className={btn} aria-expanded={isOpen} onClick={() => {
                  focusNext.current = null;
                  setEditing(isOpen ? '' : card);
                }}>
                  Change
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => remove(card, name, use, () => (e.kind === 'train' ? removeTrain(profile, id, plans) : removeItem(profile, e.list, id, plans)))}
                >
                  Remove
                </button>
              </div>
              {problem?.card === card && (
                <div role="alert" className="mt-2 break-words bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
                  <span aria-hidden="true">! </span>
                  {problem.text}
                  {problem.plan && (
                    <div className="mt-2">
                      <button type="button" className={`${btn} max-w-full min-w-0 break-words text-left`} onClick={() => onOpenPlan(problem.plan!.id)}>
                        Open {problem.plan.name}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {isOpen &&
                (e.kind === 'train' ? (
                  <TrainForm key={`train:${JSON.stringify(e.train)}`} profile={profile} train={e.train} use={use} onChange={saveFromForm} onRefuse={refuse} onClose={() => closeForm(card)} focusTo={takeFocus} />
                ) : (
                  <ItemForm key={`${e.list}:${JSON.stringify(e.item)}`} profile={profile} list={e.list} item={e.item} onChange={saveFromForm} onRefuse={refuse} onClose={() => closeForm(card)} focusTo={takeFocus} />
                ))}
            </li>
          );
        })}
      </ul>
      {flagged.length > 0 && (
        <p className="mt-3 break-words text-sm font-normal text-orange-100" data-testid="gear-flagged">
          <span aria-hidden="true">! </span>
          {flagged.length === 1 ? '1 saved value is' : `${flagged.length} saved values are`} not usable (outside the allowed range or not a number). They are marked on their cards.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        {addButtons.map((b) => (
          <button key={b.label} type="button" className={btn} onClick={b.run}>{b.label}</button>
        ))}
      </div>
    </section>
  );
}

/** Memoised: typing in the horizon or altitude boxes re-renders the page, not this editor. */
export default memo(ProfileEditor);
