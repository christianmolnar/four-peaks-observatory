'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { MAX_PROJECT_NAME, PROJECT_LIMITS, SEED_DATE } from '@/planner/projects';
import type { NewProject } from '@/planner/projects';
import type { Profile } from '@/planner/profile';
import TargetSearch from './TargetSearch';
import WrapSelect from './WrapSelect';
import { addDraftTarget, fillFromPlan, lineKey, parseDraft, removeDraftTarget, setDraftFilter } from './projectDraft';
import type { Draft, DraftErrors, PlanLine } from './projectDraft';
import type { ProjectsResult } from './useProjects';

const btn = 'min-h-11 min-w-11 rounded border border-p-line/30 px-3 py-1.5 text-sm font-normal text-p-t1 hover:bg-p-raised/10 disabled:opacity-40';
const base = 'min-h-11 min-w-0 rounded border border-p-line/30 bg-p-bg/60 px-2 py-1 text-sm font-normal text-p-t1';
const field = `${base} w-full`;

export interface ProjectEditorProps {
  title: string;
  initial: Draft;
  profile: Profile;
  targetName: (id: string) => string;
  filterName: (id: string) => string;
  /** The one order filters are listed in: Broadband, then the gear's filters (and any filter the project holds that the gear no longer has). */
  filterOrder: readonly string[];
  /** The open plan's targets, offered first. Never all ticked: the user picks. */
  planTargets: readonly { id: string; name: string }[];
  /** What the open plan holds for each of its targets, by filter: the broadband time and the ticked narrowband filters. Adding a target from the plan starts its boxes from these. */
  planned: ReadonlyMap<string, readonly PlanLine[]>;
  /** The page's target search props; the editor adds the project variant and its own add. */
  search: Omit<ComponentProps<typeof TargetSearch>, 'variant' | 'planIds' | 'onAdd' | 'listedAs' | 'added'>;
  /** Lines said above the form (what the seed adds). */
  review?: readonly string[];
  /** Says what a save does to sessions already logged, for an edit. */
  editNote?: string;
  saveLabel: string;
  onSave: (value: NewProject) => ProjectsResult;
  /** The form was refused before saving (a box is wrong): the page drops its earlier "Saved" line. */
  onRefused: () => void;
  onCancel: () => void;
}

/** Create or edit a project: name, setup (scope, camera, filters, sub length), targets (the open plan's first, then the catalog search) and the planned minutes per target and filter. */
export default function ProjectEditor({ title, initial, profile, targetName, filterName, filterOrder, planTargets, planned, search, review, editNote, saveLabel, onSave, onRefused, onCancel }: ProjectEditorProps) {
  const uid = useId();
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<DraftErrors>({ lines: {} });
  const [summary, setSummary] = useState('');
  const [failure, setFailure] = useState('');
  const [added, setAdded] = useState('');
  const form = useRef<HTMLElement>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  useEffect(() => nameBox.current?.focus(), []);
  // After a refused save the keyboard goes to the first box that is wrong.
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  const names = { target: targetName, filter: filterName };
  const inProject = new Set(d.targets.map((t) => t.id));
  const addTarget = (id: string) => {
    if (inProject.has(id)) return;
    if (d.targets.length >= PROJECT_LIMITS.targets.max) {
      setAdded(`A project holds at most ${PROJECT_LIMITS.targets.max} targets.`);
      return;
    }
    const held = planned.get(id);
    if (held === undefined || !planTargets.some((t) => t.id === id)) {
      setD(addDraftTarget(d, id));
      setAdded(`Added ${targetName(id)} to the project.`);
      return;
    }
    const r = fillFromPlan(addDraftTarget(d, id), id, held);
    setD(r.draft);
    setAdded(`Added ${targetName(id)}: ${r.filled} ${r.filled === 1 ? 'box' : 'boxes'} filled from your plan.${r.left > 0 ? ` ${r.left} plan ${r.left === 1 ? 'filter is' : 'filters are'} not in this project. Add ${r.left === 1 ? 'it' : 'them'} under Filters, then add the target again.` : ''}`);
  };
  const dropTarget = (id: string) => {
    setD(removeDraftTarget(d, id));
    setAdded(`Removed ${targetName(id)} from the project.`);
  };
  const setLine = (targetId: string, filterId: string, patch: Partial<{ minutes: string; optional: boolean }>) =>
    setD((p) => ({ ...p, targets: p.targets.map((t) => (t.id === targetId ? { ...t, lines: { ...t.lines, [filterId]: { ...(t.lines[filterId] ?? { minutes: '', optional: false }), ...patch } } } : t)) }));

  const submit = () => {
    setFailure('');
    const r = parseDraft(d, names);
    if (!r.ok) {
      onRefused();
      pending.current = true;
      setErrors(r.errors);
      setSummary(r.summary);
      return;
    }
    setErrors({ lines: {} });
    setSummary('');
    const done = onSave(r.value);
    if (!done.ok && !done.kept) setFailure(done.message);
  };

  const scopes = profile.equipment.scopes;
  const cameras = profile.equipment.cameras;
  const fe = (id: string, text: string | undefined) => (text === undefined ? null : <p id={id} role="alert" className="mt-1 break-words text-sm font-normal text-p-warn-text">{text}</p>);
  return (
    // Not a <form>: the target search inside it is one, and forms do not nest. Enter in a text box saves, as in a form.
    <section
      ref={form}
      aria-labelledby={`${uid}-title`}
      data-testid="project-editor"
      className="space-y-4 rounded-lg border border-p-line/30 p-3 sm:p-4"
      onKeyDown={(e) => {
        const el = e.target as HTMLElement;
        if (e.key === 'Enter' && el.matches('input[type="text"]') && el.closest('[role="search"]') === null) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <h3 id={`${uid}-title`} className="text-lg font-normal text-p-t1">{title}</h3>
      {review !== undefined && review.length > 0 && (
        <div className="rounded border border-p-line/20 p-3" data-testid="seed-review">
          <p className="text-sm font-medium text-p-t1">Saving also logs these hours (all broadband, night of {SEED_DATE}):</p>
          <ul className="mt-1 list-disc pl-5">
            {review.map((l) => <li key={l} className="break-words text-sm font-normal text-p-t1">{l}</li>)}
          </ul>
          <p className="mt-1 text-sm font-normal text-p-t1/70">Type the minutes you plan for each target below. Nothing is saved until you press {saveLabel}.</p>
        </div>
      )}
      {editNote !== undefined && <p className="break-words text-sm font-normal text-p-t1/70">{editNote}</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
        <div>
          <label htmlFor={`${uid}-name`} className="mb-1 block text-sm font-normal text-p-t1">Project name</label>
          <input ref={nameBox} id={`${uid}-name`} type="text" maxLength={MAX_PROJECT_NAME + 20} autoComplete="off" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={field} aria-invalid={errors.name !== undefined} aria-describedby={errors.name === undefined ? undefined : `${uid}-name-err`} />
          {fe(`${uid}-name-err`, errors.name)}
        </div>
        <div>
          <label htmlFor={`${uid}-status`} className="mb-1 block text-sm font-normal text-p-t1">Status</label>
          <WrapSelect id={`${uid}-status`} className="w-full" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as Draft['status'] })}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="finished">Finished</option>
          </WrapSelect>
        </div>
      </div>

      <fieldset className="space-y-3 rounded border border-p-line/20 p-3">
        <legend className="px-1 text-sm font-medium text-p-t1">Setup (starts as the open plan&rsquo;s setup)</legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 [&>*]:min-w-0">
          <div>
            <label htmlFor={`${uid}-scope`} className="mb-1 block text-sm font-normal text-p-t1">Scope</label>
            <WrapSelect id={`${uid}-scope`} className="w-full" value={d.scopeId ?? ''} onChange={(e) => setD({ ...d, scopeId: e.target.value === '' ? null : e.target.value })}>
              <option value="">Not set</option>
              {d.scopeId !== null && !scopes.some((s) => s.id === d.scopeId) && <option value={d.scopeId}>A scope no longer in your gear</option>}
              {scopes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </WrapSelect>
          </div>
          <div>
            <label htmlFor={`${uid}-camera`} className="mb-1 block text-sm font-normal text-p-t1">Camera</label>
            <WrapSelect id={`${uid}-camera`} className="w-full" value={d.cameraId ?? ''} onChange={(e) => setD({ ...d, cameraId: e.target.value === '' ? null : e.target.value })}>
              <option value="">Not set</option>
              {d.cameraId !== null && !cameras.some((c) => c.id === d.cameraId) && <option value={d.cameraId}>A camera no longer in your gear</option>}
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </WrapSelect>
          </div>
          <div>
            <label htmlFor={`${uid}-sub`} className="mb-1 block text-sm font-normal text-p-t1">Sub length (seconds)</label>
            <input id={`${uid}-sub`} type="text" inputMode="decimal" autoComplete="off" value={d.subText} onChange={(e) => setD({ ...d, subText: e.target.value })} className={field} aria-invalid={errors.sub !== undefined} aria-describedby={errors.sub === undefined ? undefined : `${uid}-sub-err`} />
            {fe(`${uid}-sub-err`, errors.sub)}
          </div>
        </div>
        <fieldset className="min-w-0" aria-describedby={errors.filters === undefined ? undefined : `${uid}-filters-err`}>
          <legend className="text-sm font-normal text-p-t1">Filters used</legend>
          <div className="flex flex-wrap gap-x-4">
            {filterOrder.map((id) => (
              <label key={id} className="flex min-h-11 max-w-full items-center gap-2 break-words pr-2 text-sm font-normal text-p-t1">
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-p-focus" checked={d.filterIds.includes(id)} onChange={(e) => setD(setDraftFilter(d, id, e.target.checked, filterOrder))} />
                <span className="min-w-0">{filterName(id)}</span>
              </label>
            ))}
          </div>
          {fe(`${uid}-filters-err`, errors.filters)}
        </fieldset>
      </fieldset>

      <fieldset className="space-y-3 rounded border border-p-line/20 p-3">
        <legend className="px-1 text-sm font-medium text-p-t1">Targets</legend>
        {planTargets.length > 0 && (
          <fieldset className="min-w-0">
            <legend className="text-sm font-normal text-p-t1">From your open plan</legend>
            <div className="flex flex-wrap gap-x-4">
              {planTargets.map((t) => (
                <label key={t.id} className="flex min-h-11 max-w-full items-center gap-2 break-words pr-2 text-sm font-normal text-p-t1">
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-p-focus" checked={inProject.has(t.id)} onChange={(e) => (e.target.checked ? addTarget(t.id) : dropTarget(t.id))} />
                  <span className="min-w-0">{t.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <TargetSearch {...search} variant="project" planIds={inProject} listedAs={() => undefined} added={null} onAdd={addTarget} />
        <p aria-live="polite" role="status" className="min-h-5 break-words text-sm font-normal text-p-t1">{added}</p>
        {fe(`${uid}-targets-err`, errors.targets)}

        <p id={`${uid}-optional`} className="text-sm font-normal text-p-t1/70">
          Planned minutes per filter and target; leave a box empty if unused. Optional lines are left out of every total.
        </p>
        <ul className="space-y-3" aria-label="Targets of the project">
          {d.targets.map((t) => (
            <li key={t.id} className="rounded border border-p-line/20 p-3" data-testid="draft-target">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h4 className="min-w-0 break-words text-base font-medium text-p-t1">{targetName(t.id)}</h4>
                <button type="button" className={btn} onClick={() => dropTarget(t.id)} aria-label={`Remove ${targetName(t.id)} from the project`}>Remove</button>
              </div>
              <ul className="space-y-2">
                {d.filterIds.map((f) => {
                  const k = lineKey(t.id, f);
                  const id = `${uid}-${t.id}-${f}`;
                  const line = t.lines[f] ?? { minutes: '', optional: false };
                  return (
                    <li key={f}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <label htmlFor={`${id}-min`} className="min-w-[7rem] flex-1 break-words text-sm font-normal text-p-t1">{filterName(f)}, minutes</label>
                        <input id={`${id}-min`} type="text" inputMode="numeric" autoComplete="off" value={line.minutes} onChange={(e) => setLine(t.id, f, { minutes: e.target.value })} className={`${base} w-24`} aria-invalid={errors.lines[k] !== undefined} aria-describedby={`${uid}-optional${errors.lines[k] === undefined ? '' : ` ${id}-err`}`} />
                        <label className="flex min-h-11 items-center gap-2 text-sm font-normal text-p-t1">
                          <input type="checkbox" className="h-5 w-5 shrink-0 accent-p-focus" checked={line.optional} onChange={(e) => setLine(t.id, f, { optional: e.target.checked })} />
                          Optional, excluded from totals
                        </label>
                      </div>
                      {fe(`${id}-err`, errors.lines[k])}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </fieldset>

      {summary !== '' && <p role="alert" className="break-words text-sm font-normal text-p-warn-text">{summary}</p>}
      {failure !== '' && <p role="alert" className="break-words text-sm font-normal text-p-warn-text">{failure}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={submit}>{saveLabel}</button>
        <button type="button" className={btn} onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
