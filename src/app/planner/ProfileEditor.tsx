'use client';

import { memo, useEffect, useRef, useState } from 'react';
import type { Profile, TrainEntry } from '@/planner/profile';
import { LIST_SPECS, addItem, addTrain, removeItem, removeTrain, replaceItem, replaceTrain, textsOf } from '@/planner/state/edit';
import type { FieldSpec, ListKey } from '@/planner/state/edit';
import { GEAR_CLASSES, usedText, usesOf } from '@/planner/state/gear';
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
}

/** The Find box of a site's form. */
export const findBoxId = (siteId: string) => `site-find-${siteId}`;

const itemsOf = (profile: Profile, list: ListKey): ({ id: string; name: string } & object)[] => (list === 'sites' ? profile.sites : profile.equipment[list]);

/** The filled boxes of an item as one short line: "Focal length 2800 mm, Aperture 280 mm". */
function summaryOf(list: ListKey, item: object): string {
  const texts = textsOf(list, item);
  return LIST_SPECS[list].fields
    .filter((f) => f.key !== 'name' && texts[f.key] !== '')
    .map((f) => {
      const t = f.kind === 'tristate' ? (texts[f.key] === 'yes' ? 'yes' : 'no') : texts[f.key];
      const unit = f.unit !== undefined && f.unit.length <= 4 ? ` ${f.unit}` : '';
      return `${f.label} ${t}${unit}`;
    })
    .join(', ');
}

function Box({ id, spec, value, onChange }: { id: string; spec: FieldSpec; value: string; onChange: (v: string) => void }) {
  const label = spec.unit ? `${spec.label} (${spec.unit})` : spec.label;
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
            required={spec.required}
            className={field}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <WrapText id={id} autoComplete="off" required={spec.required} className={field} value={value} onChange={(e) => onChange(e.target.value)} />
        )
      )}
    </div>
  );
}

/** Save and Close with the error line under them. */
function FormShell({ legend, error, onSave, onClose, children }: { legend: string; error: string | null; onSave: () => void; onClose: () => void; children: React.ReactNode }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="mt-3 rounded border border-white/15 p-3 sm:p-4"
    >
      <fieldset>
        <legend className="px-1 text-white font-normal text-sm">{legend}</legend>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button type="submit" className={btn}>Save</button>
          <button type="button" className={btn} onClick={onClose}>Close</button>
        </div>
        {error && (
          <p role="alert" className="mt-3 bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
            <span aria-hidden="true">! </span>
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}

function ItemForm({ profile, list, item, onChange, onClose }: { profile: Profile; list: ListKey; item: { id: string; name: string } & object; onChange: (p: Profile, what: string) => void; onClose: () => void }) {
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

function TrainForm({ profile, train, onChange, onClose }: { profile: Profile; train: TrainEntry; onChange: (p: Profile, what: string) => void; onClose: () => void }) {
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
      legend={`${train.kind === 'smart' ? 'Smart-scope train' : 'Train'}: ${train.name}`}
      error={error}
      onSave={() =>
        run(
          () => (train.kind === 'smart' ? replaceTrain(profile, train.id, { name, smartScopeId }) : replaceTrain(profile, train.id, { name, scopeId, accessoryIds, cameraId, filterId })),
          `Saved ${name || train.name}.`,
        )
      }
      onClose={onClose}
    >
      <div>
        <label htmlFor={`${base}-name`} className={labelClass}>Name</label>
        <WrapText id={`${base}-name`} required autoComplete="off" className={field} value={name} onChange={(e) => setName(e.target.value)} />
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
                <label key={a.id} className="flex min-h-11 items-center gap-2 text-white/90 font-normal text-sm">
                  <input
                    type="checkbox"
                    className="accent-sky-400"
                    checked={accessoryIds.includes(a.id)}
                    onChange={(e) => setAccessoryIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))}
                  />
                  {a.name}
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
const chipLabel = 'block text-xs uppercase tracking-wide text-white/70';

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
function ProfileEditor({ profile, onChange, findSite, plans, openTrainId, onUseTrain }: ProfileEditorProps) {
  const [status, setStatus] = useState('');
  const [cls, setCls] = useState<GearClass>('trains');
  // The one card whose form is open, and the one message (an error from Add, or a refusal) with the card it belongs to ('' for the class).
  const [editing, setEditing] = useState<string>('');
  const [problem, setProblem] = useState<{ card: string; text: string } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
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
  const commit = (next: Profile, what: string) => {
    setStatus(what);
    setProblem(null);
    onChange(next);
  };
  const pick = (next: GearClass) => {
    setCls(next);
    setEditing('');
    setProblem(null);
  };
  const tryAdd = (fn: () => Profile, what: string, cardOf: (p: Profile) => string) => {
    try {
      const next = fn();
      commit(next, what);
      setEditing(cardOf(next));
    } catch (e) {
      setProblem({ card: '', text: (e as Error).message });
    }
  };
  const lastOf = <T extends { id: string }>(xs: T[]) => xs[xs.length - 1].id;
  const remove = (card: string, name: string, fn: () => Profile) => {
    try {
      const next = fn();
      commit(next, `Removed ${name}.`);
      setEditing((e) => (e === card ? '' : e));
      listRef.current?.focus();
    } catch (e) {
      setProblem({ card, text: (e as Error).message });
    }
  };

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
  const classLabel = GEAR_CLASSES.find((c) => c.id === cls)?.label ?? '';
  const addButtons: { label: string; run: () => void }[] =
    cls === 'trains'
      ? [
          { label: 'Add train', run: () => tryAdd(() => addTrain(profile, 'optical'), 'Added a train. Change it and press Save.', (p) => `trains:${lastOf(p.trains)}`) },
          { label: 'Add smart-scope train', run: () => tryAdd(() => addTrain(profile, 'smart'), 'Added a smart-scope train. Change it and press Save.', (p) => `trains:${lastOf(p.trains)}`) },
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
      <p className="text-white/80 font-normal text-sm mb-3">
        Pick a class, then add, change or remove its items. Leave an optional box empty when you do not know it: the planner then says the value is missing instead of guessing.
      </p>
      <div role="group" aria-label="Gear class" className="flex flex-wrap gap-2">
        {GEAR_CLASSES.map((c) => (
          <button key={c.id} type="button" aria-pressed={cls === c.id} className={`${btn} ${cls === c.id ? 'bg-white/15 border-sky-300' : ''}`} onClick={() => pick(c.id)}>
            {c.label} ({count(c.id)})
          </button>
        ))}
      </div>
      <p aria-live="polite" className="text-sky-100 font-normal text-sm min-h-5 my-2">{status}</p>
      {problem?.card === '' && (
        <p role="alert" className="mb-3 bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
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
          const isOpen = editing === card;
          const here = e.kind === 'train' && id === openTrainId;
          const detail = e.kind === 'train' ? '' : summaryOf(e.list, e.item);
          const tag = e.kind === 'item' && e.list === 'smartScopes' ? 'Smart scope' : e.kind === 'train' && e.train.kind === 'smart' ? 'Smart-scope train' : '';
          return (
            <li key={card} data-testid={`gear-card-${card}`} className="rounded border border-white/15 p-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 break-words text-base font-normal text-white">{name}</span>
                {tag && <span className="text-xs text-white/70">{tag}</span>}
                {here && <span className="rounded border border-sky-300/60 px-1.5 text-xs text-sky-100">In this plan</span>}
              </div>
              {e.kind === 'train' && <div className="mt-2"><TrainChain profile={profile} train={e.train} /></div>}
              {detail && <p className="mt-1 break-words text-sm font-normal text-white/80">{detail}</p>}
              <p className="mt-1 break-words text-sm font-normal text-white/80">{usedText(use)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {e.kind === 'train' && (
                  <button type="button" className={btn} disabled={here} onClick={() => onUseTrain(id)}>
                    {here ? 'Used in this plan' : 'Use in this plan'}
                  </button>
                )}
                <button type="button" className={btn} aria-expanded={isOpen} onClick={() => setEditing(isOpen ? '' : card)}>
                  Change
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => remove(card, name, () => (e.kind === 'train' ? removeTrain(profile, id, plans) : removeItem(profile, e.list, id, plans)))}
                >
                  Remove
                </button>
              </div>
              {problem?.card === card && (
                <p role="alert" className="mt-2 bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
                  <span aria-hidden="true">! </span>
                  {problem.text}
                </p>
              )}
              {isOpen &&
                (e.kind === 'train' ? (
                  <TrainForm key={`train:${JSON.stringify(e.train)}`} profile={profile} train={e.train} onChange={commit} onClose={() => setEditing('')} />
                ) : (
                  <ItemForm key={`${e.list}:${JSON.stringify(e.item)}`} profile={profile} list={e.list} item={e.item} onChange={commit} onClose={() => setEditing('')} />
                ))}
            </li>
          );
        })}
      </ul>
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
