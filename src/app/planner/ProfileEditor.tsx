'use client';

import { useState } from 'react';
import type { Profile, TrainEntry } from '@/planner/profile';
import { LIST_SPECS, addItem, addTrain, removeItem, removeTrain, replaceItem, replaceTrain, textsOf } from '@/planner/state/edit';
import type { FieldSpec, ListKey } from '@/planner/state/edit';

const field =
  'min-h-11 w-full bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';
const btn =
  'min-h-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';
const labelClass = 'block text-white/90 font-normal text-sm mb-1';

export interface ProfileEditorProps {
  profile: Profile;
  /** Receives a validated profile; the parent stores it. */
  onChange: (next: Profile) => void;
}

/** A native disclosure that builds its content only while open, so a closed panel costs the page nothing. */
function Disclosure({ summary, defaultOpen, children }: { summary: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <details
      className="mb-3 border-b border-white/10 pb-3"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="min-h-11 flex items-center cursor-pointer text-white font-normal text-base rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
        {summary}
      </summary>
      {open && <div className="mt-3">{children}</div>}
    </details>
  );
}

const LISTS: ListKey[] = ['sites', 'scopes', 'accessories', 'cameras', 'smartScopes', 'filters'];

function itemsOf(profile: Profile, list: ListKey): ({ id: string; name: string } & object)[] {
  return list === 'sites' ? profile.sites : profile.equipment[list];
}

function Box({ id, spec, value, onChange }: { id: string; spec: FieldSpec; value: string; onChange: (v: string) => void }) {
  const label = spec.unit ? `${spec.label} (${spec.unit})` : spec.label;
  const options: readonly { value: string; text: string }[] | null =
    spec.kind === 'tristate'
      ? [{ value: '', text: 'Unknown' }, { value: 'yes', text: 'Yes' }, { value: 'no', text: 'No' }]
      : spec.kind === 'choice'
        ? [...(spec.required ? [] : [{ value: '', text: 'Unknown' }]), ...(spec.options ?? []).map((o) => ({ value: o, text: o }))]
        : null;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {options ? (
        <select id={id} className={field} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.text}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="text"
          inputMode={spec.kind === 'number' ? 'decimal' : 'text'}
          autoComplete="off"
          required={spec.required}
          className={field}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/** Save and Remove with the error line under them. */
function FormShell({ legend, error, onSave, onRemove, children }: { legend: string; error: string | null; onSave: () => void; onRemove: () => void; children: React.ReactNode }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="rounded border border-white/15 p-4 mb-4"
    >
      <fieldset>
        <legend className="px-1 text-white font-normal text-sm">{legend}</legend>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button type="submit" className={btn}>Save</button>
          <button type="button" className={btn} onClick={onRemove}>Remove</button>
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

function ItemForm({ profile, list, item, onChange }: { profile: Profile; list: ListKey; item: { id: string; name: string } & object; onChange: (p: Profile, what: string) => void }) {
  const spec = LIST_SPECS[list];
  const [texts, setTexts] = useState(() => textsOf(list, item));
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Profile, what: string) => {
    try {
      const next = fn();
      setError(null);
      onChange(next, what);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <FormShell
      legend={`${spec.title === 'Site' ? 'Site' : spec.noun[0].toUpperCase() + spec.noun.slice(1)}: ${item.name}`}
      error={error}
      onSave={() => run(() => replaceItem(profile, list, item.id, texts), `Saved ${texts.name || item.name}.`)}
      onRemove={() => run(() => removeItem(profile, list, item.id), `Removed ${item.name}.`)}
    >
      {spec.fields.map((f) => (
        <Box key={f.key} id={`edit-${list}-${item.id}-${f.key}`} spec={f} value={texts[f.key] ?? ''} onChange={(v) => setTexts((t) => ({ ...t, [f.key]: v }))} />
      ))}
    </FormShell>
  );
}

function TrainForm({ profile, train, onChange }: { profile: Profile; train: TrainEntry; onChange: (p: Profile, what: string) => void }) {
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
      <select id={id} className={field} value={value} onChange={(e) => set(e.target.value)}>
        {none !== undefined && <option value="">{none}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
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
      onRemove={() => run(() => removeTrain(profile, train.id), `Removed ${train.name}.`)}
    >
      <div>
        <label htmlFor={`${base}-name`} className={labelClass}>Name</label>
        <input id={`${base}-name`} type="text" required autoComplete="off" className={field} value={name} onChange={(e) => setName(e.target.value)} />
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

/**
 * Site, equipment and train editor. Every Save goes through the profile validator; a refused edit leaves the
 * profile as it was and shows the reason under the form. The horizon has its own editor.
 */
export default function ProfileEditor({ profile, onChange }: ProfileEditorProps) {
  const [status, setStatus] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const commit = (next: Profile, what: string) => {
    setStatus(what);
    setAddError(null);
    onChange(next);
  };
  const tryAdd = (fn: () => Profile, what: string) => {
    try {
      commit(fn(), what);
    } catch (e) {
      setAddError((e as Error).message);
    }
  };
  return (
    <section aria-labelledby="gear-heading" className="bg-black/70 rounded-lg border border-white/10 p-6">
      <h2 id="gear-heading" className="text-xl font-light text-white tracking-[0.15em] mb-2">SITE AND GEAR</h2>
      <p className="text-white/80 font-normal text-sm mb-4">
        Enter your own site, telescopes, cameras, filters and trains. Each item has its own Save button; a value that is not valid is refused with the reason. Leave an optional box empty when you do not know it: the planner then says the value is missing instead of guessing.
      </p>
      <p aria-live="polite" className="text-sky-100 font-normal text-sm min-h-5 mb-2">{status}</p>
      {addError && (
        <p role="alert" className="mb-3 bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
          <span aria-hidden="true">! </span>
          {addError}
        </p>
      )}
      {LISTS.map((list) => {
        const items = itemsOf(profile, list);
        const spec = LIST_SPECS[list];
        return (
          <Disclosure key={list} summary={`${spec.title} (${items.length})`} defaultOpen={list === 'sites'}>
            {items.map((it) => (
              <ItemForm key={`${list}:${JSON.stringify(it)}`} profile={profile} list={list} item={it} onChange={commit} />
            ))}
            <button type="button" className={btn} onClick={() => tryAdd(() => addItem(profile, list), `Added a ${spec.noun}. Edit it below and press Save.`)}>
              Add {spec.noun}
            </button>
          </Disclosure>
        );
      })}
      <Disclosure summary={`Trains (${profile.trains.length})`}>
        {profile.trains.map((t) => (
          <TrainForm key={`train:${JSON.stringify(t)}`} profile={profile} train={t} onChange={commit} />
        ))}
        <div className="flex flex-wrap gap-3">
          <button type="button" className={btn} onClick={() => tryAdd(() => addTrain(profile, 'optical'), 'Added a train. Edit it and press Save.')}>Add train</button>
          <button type="button" className={btn} onClick={() => tryAdd(() => addTrain(profile, 'smart'), 'Added a smart-scope train. Edit it and press Save.')}>Add smart-scope train</button>
        </div>
      </Disclosure>
    </section>
  );
}
