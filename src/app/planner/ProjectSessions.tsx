'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { durationText } from '@/planner/export';
import { MAX_SESSION_NOTE, PROJECT_LIMITS, isRealDate, sessionMinutes } from '@/planner/projects';
import type { NewSession, Project, Session, SheetNames } from '@/planner/projects';
import WrapSelect from './WrapSelect';
import { readBox } from './projectInput';
import type { ProjectsResult } from './useProjects';

const btn = 'min-h-11 min-w-11 rounded border border-p-line/30 px-3 py-1.5 text-sm font-normal text-p-t1 hover:bg-p-raised/10 disabled:opacity-40';
const field = 'min-h-11 w-full min-w-0 rounded border border-p-line/30 bg-p-bg/60 px-2 py-1 text-sm font-normal text-p-t1';
const FIRST_SHOWN = 50;

interface FormState {
  date: string;
  targetId: string;
  filterId: string;
  mode: 'minutes' | 'exposures';
  amount: string;
  subText: string;
  note: string;
}

type Errors = Partial<Record<'date' | 'amount' | 'sub' | 'note', string>>;

const formFrom = (s: Session): FormState => ({ date: s.date, targetId: s.targetId, filterId: s.filterId, mode: s.minutes !== undefined ? 'minutes' : 'exposures', amount: String(s.minutes ?? s.exposures ?? ''), subText: String(s.subSeconds ?? ''), note: s.note });

/** Reads the form's boxes into a session, or says in words which box is wrong. Nothing is stored here. */
function readForm(f: FormState): { ok: true; draft: NewSession } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  if (!isRealDate(f.date)) errors.date = 'Date: pick a real date between 2000 and 2100.';
  if (f.note.length > MAX_SESSION_NOTE) errors.note = `Note: at most ${MAX_SESSION_NOTE} characters.`;
  const base = { date: f.date, targetId: f.targetId, filterId: f.filterId, note: f.note.trim() };
  if (f.mode === 'minutes') {
    const m = readBox(PROJECT_LIMITS.minutes, f.amount, 'Minutes');
    if (!m.ok) errors.amount = m.message;
    if (Object.keys(errors).length > 0 || !m.ok || m.value === null) return { ok: false, errors };
    return { ok: true, draft: { ...base, minutes: m.value } };
  }
  const e = readBox(PROJECT_LIMITS.exposures, f.amount, 'Exposures');
  const s = readBox(PROJECT_LIMITS.subSeconds, f.subText, 'Sub length');
  if (!e.ok) errors.amount = e.message;
  if (!s.ok) errors.sub = s.message;
  if (Object.keys(errors).length > 0 || !e.ok || !s.ok || e.value === null || s.value === null) return { ok: false, errors };
  return { ok: true, draft: { ...base, exposures: e.value, subSeconds: s.value } };
}

interface FormProps {
  project: Project;
  names: SheetNames;
  initial: FormState;
  submitLabel: string;
  title: string;
  onSubmit: (draft: NewSession) => ProjectsResult;
  /** Called after a save went through; `again` is true for the add form, which stays open for the next entry. */
  onDone: (draft: NewSession) => void;
  onCancel: () => void;
  onRefused: () => void;
  keepOpen: boolean;
  /** Where the focus goes when the form opens (the first box). */
  focusOnOpen: boolean;
}

/** One session form, to add or to edit: date, target and filter of the project, minutes or exposures with a sub length, and a note. */
function SessionForm({ project, names, initial, submitLabel, title, onSubmit, onDone, onCancel, onRefused, keepOpen, focusOnOpen }: FormProps) {
  const uid = useId();
  const [f, setF] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState('');
  const first = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusOnOpen) first.current?.focus();
  }, [focusOnOpen]);
  const set = (patch: Partial<FormState>) => setF((p) => ({ ...p, ...patch }));
  const submit = () => {
    setFailure('');
    const r = readForm(f);
    if (!r.ok) {
      onRefused();
      setErrors(r.errors);
      return;
    }
    setErrors({});
    const done = onSubmit(r.draft);
    if (done.ok || done.kept) {
      onDone(r.draft);
      if (keepOpen) {
        setF((p) => ({ ...p, amount: '', note: '' }));
        amountRef.current?.focus();
      }
    } else setFailure(done.message);
  };
  const err = (k: keyof Errors, id: string) => (errors[k] === undefined ? undefined : id);
  const bad = (k: keyof Errors) => errors[k] !== undefined;
  const noPlan = !project.targets.some((t) => t.id === f.targetId && t.lines.some((l) => l.filterId === f.filterId));
  return (
    <form
      aria-labelledby={`${uid}-title`}
      noValidate
      className="space-y-3 rounded-lg border border-p-line/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h5 id={`${uid}-title`} className="text-base font-medium text-p-t1">{title}</h5>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <div>
          <label htmlFor={`${uid}-date`} className="mb-1 block text-sm font-normal text-p-t1">Date (the evening of the night)</label>
          <input ref={first} id={`${uid}-date`} type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} className={field} aria-invalid={bad('date')} aria-describedby={err('date', `${uid}-date-err`)} />
          {errors.date !== undefined && <p id={`${uid}-date-err`} role="alert" className="mt-1 break-words text-sm font-normal text-p-warn-text">{errors.date}</p>}
        </div>
        <div>
          <label htmlFor={`${uid}-target`} className="mb-1 block text-sm font-normal text-p-t1">Target</label>
          <WrapSelect id={`${uid}-target`} className="w-full" value={f.targetId} onChange={(e) => set({ targetId: e.target.value })}>
            {project.targets.map((t) => (
              <option key={t.id} value={t.id}>{names.target(t.id)}</option>
            ))}
          </WrapSelect>
        </div>
        <div>
          <label htmlFor={`${uid}-filter`} className="mb-1 block text-sm font-normal text-p-t1">Filter</label>
          <WrapSelect id={`${uid}-filter`} className="w-full" value={f.filterId} onChange={(e) => set({ filterId: e.target.value })}>
            {project.setup.filterIds.map((id) => (
              <option key={id} value={id}>{names.filter(id)}</option>
            ))}
          </WrapSelect>
        </div>
        <fieldset className="min-w-0">
          <legend className="mb-1 text-sm font-normal text-p-t1">Enter the light as</legend>
          <div className="flex flex-wrap gap-x-4">
            {(['minutes', 'exposures'] as const).map((m) => (
              <label key={m} className="flex min-h-11 items-center gap-2 text-sm font-normal text-p-t1">
                <input type="radio" name={`${uid}-mode`} checked={f.mode === m} onChange={() => set({ mode: m, amount: '' })} className="h-5 w-5 shrink-0 accent-p-focus" />
                {m === 'minutes' ? 'Minutes' : 'Exposures'}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${uid}-amount`} className="mb-1 block text-sm font-normal text-p-t1">{f.mode === 'minutes' ? 'Minutes of light' : 'Number of exposures'}</label>
          <input ref={amountRef} id={`${uid}-amount`} type="text" inputMode="numeric" autoComplete="off" value={f.amount} onChange={(e) => set({ amount: e.target.value })} className={field} aria-invalid={bad('amount')} aria-describedby={err('amount', `${uid}-amount-err`)} />
          {errors.amount !== undefined && <p id={`${uid}-amount-err`} role="alert" className="mt-1 break-words text-sm font-normal text-p-warn-text">{errors.amount}</p>}
        </div>
        {f.mode === 'exposures' && (
          <div>
            <label htmlFor={`${uid}-sub`} className="mb-1 block text-sm font-normal text-p-t1">Sub length of these exposures (seconds)</label>
            <input id={`${uid}-sub`} type="text" inputMode="decimal" autoComplete="off" value={f.subText} onChange={(e) => set({ subText: e.target.value })} className={field} aria-invalid={bad('sub')} aria-describedby={err('sub', `${uid}-sub-err`)} />
            {errors.sub !== undefined && <p id={`${uid}-sub-err`} role="alert" className="mt-1 break-words text-sm font-normal text-p-warn-text">{errors.sub}</p>}
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-note`} className="mb-1 block text-sm font-normal text-p-t1">Note (optional)</label>
          <input id={`${uid}-note`} type="text" maxLength={MAX_SESSION_NOTE} autoComplete="off" value={f.note} onChange={(e) => set({ note: e.target.value })} className={field} aria-invalid={bad('note')} aria-describedby={err('note', `${uid}-note-err`)} />
          {errors.note !== undefined && <p id={`${uid}-note-err`} role="alert" className="mt-1 break-words text-sm font-normal text-p-warn-text">{errors.note}</p>}
        </div>
      </div>
      {noPlan && <p className="break-words text-sm font-normal text-p-warn-text">{names.target(f.targetId)} has no hours planned for {names.filter(f.filterId)}, so this light is kept but not counted in the plan.</p>}
      {failure !== '' && <p role="alert" className="break-words text-sm font-normal text-p-warn-text">{failure}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btn}>{submitLabel}</button>
        <button type="button" className={btn} onClick={onCancel}>{keepOpen ? 'Close' : 'Cancel'}</button>
      </div>
    </form>
  );
}

const describe = (s: Session, names: SheetNames): string => `${s.date}, ${names.target(s.targetId)}, ${names.filter(s.filterId)}, ${durationText(sessionMinutes(s))}`;

export interface ProjectSessionsProps {
  project: Project;
  names: SheetNames;
  /** The evening the add form starts on (YYYY-MM-DD). */
  today: string;
  onAdd: (draft: NewSession) => ProjectsResult;
  onUpdate: (id: string, draft: NewSession) => ProjectsResult;
  onDelete: (id: string) => ProjectsResult;
  /** A form was refused before saving (a box is wrong): the page drops its earlier "Saved" line. */
  onRefused: () => void;
}

/** "Add session", and the session log of a project, newest first (50, then "Show all"), with Edit and Delete (asking first) on every row. */
export default function ProjectSessions({ project, names, today, onAdd, onUpdate, onDelete, onRefused }: ProjectSessionsProps) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const [last, setLast] = useState<{ targetId: string; filterId: string; date: string }>({ targetId: project.targets[0]?.id ?? '', filterId: project.setup.filterIds[0] ?? '', date: today });
  const afterDelete = useRef(false);

  useEffect(() => {
    if (asking !== null) keepButton.current?.focus();
  }, [asking]);
  useEffect(() => {
    if (afterDelete.current) {
      afterDelete.current = false;
      heading.current?.focus();
    }
  });

  // Newest night first; the same night: the one logged last first (the log keeps entry order).
  const log = project.sessions.map((s, i) => ({ s, i })).sort((a, b) => (a.s.date < b.s.date ? 1 : a.s.date > b.s.date ? -1 : b.i - a.i)).map((x) => x.s);
  const shown = all ? log : log.slice(0, FIRST_SHOWN);
  const none = project.targets.length === 0;

  return (
    <section aria-labelledby={`log-${project.id}`} className="space-y-3 rounded-lg border border-p-line/20 p-3" data-testid="session-log">
      <h4 id={`log-${project.id}`} ref={heading} tabIndex={-1} className="text-base font-medium text-p-t1 focus:outline-none">Log new exposures</h4>
      {!adding && (
        <button ref={addButton} type="button" className={btn} disabled={none} onClick={() => setAdding(true)}>
          Add session
        </button>
      )}
      {adding && (
        <SessionForm
          project={project}
          names={names}
          title="Add session"
          submitLabel="Add session"
          initial={{ date: last.date, targetId: last.targetId, filterId: last.filterId, mode: 'minutes', amount: '', subText: String(project.setup.subSeconds), note: '' }}
          keepOpen
          focusOnOpen
          onRefused={onRefused}
          onSubmit={onAdd}
          onDone={(d) => {
            setLast({ targetId: d.targetId, filterId: d.filterId, date: d.date });
          }}
          onCancel={() => {
            setAdding(false);
            setTimeout(() => addButton.current?.focus(), 0);
          }}
        />
      )}
      {log.length === 0 ? (
        <p className="text-sm font-normal text-p-t1/70">No sessions yet.</p>
      ) : (
        <>
          <p className="text-sm font-normal text-p-t1/70" data-testid="log-count">
            {log.length} {log.length === 1 ? 'session' : 'sessions'}, newest first{!all && log.length > FIRST_SHOWN ? `; showing the first ${FIRST_SHOWN}` : ''}.
          </p>
          <ul className="space-y-2">
            {shown.map((s) => (
              <li key={s.id} data-testid="session-row" className="rounded border border-p-line/15 p-2">
                {editing === s.id ? (
                  <SessionForm
                    project={project}
                    names={names}
                    title={`Edit session: ${describe(s, names)}`}
                    submitLabel="Save session"
                    initial={formFrom(s)}
                    keepOpen={false}
                    focusOnOpen
                    onRefused={onRefused}
                    onSubmit={(d) => onUpdate(s.id, d)}
                    onDone={() => {
                      setEditing(null);
                      setTimeout(() => document.getElementById(`edit-${s.id}`)?.focus(), 0);
                    }}
                    onCancel={() => {
                      setEditing(null);
                      setTimeout(() => document.getElementById(`edit-${s.id}`)?.focus(), 0);
                    }}
                  />
                ) : (
                  <>
                    <p className="break-words text-sm font-normal text-p-t1">
                      {describe(s, names)}
                      {s.exposures !== undefined && <span className="text-p-t1/70"> ({s.exposures.toLocaleString('en-US')} exposures of {s.subSeconds} s)</span>}
                      {s.note !== '' && <span className="text-p-t1/70"> &ndash; {s.note}</span>}
                    </p>
                    {asking === s.id ? (
                      <div role="group" aria-label={`Delete this session?`} className="mt-1 space-y-2">
                        <p className="break-words text-sm font-normal text-p-t1">Delete this session ({describe(s, names)})? Its light leaves the bars. It cannot be undone.</p>
                        <div className="flex flex-wrap gap-2">
                          <button ref={keepButton} type="button" className={btn} onClick={() => { setAsking(null); setTimeout(() => document.getElementById(`delete-${s.id}`)?.focus(), 0); }}>Keep it</button>
                          <button
                            type="button"
                            className={btn}
                            onClick={() => {
                              const r = onDelete(s.id);
                              setAsking(null);
                              if (r.ok || r.kept) afterDelete.current = true;
                            }}
                          >
                            Delete session
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-2">
                        <button id={`edit-${s.id}`} type="button" className={btn} aria-label={`Edit session ${describe(s, names)}`} onClick={() => { setAsking(null); setEditing(s.id); }}>Edit</button>
                        <button id={`delete-${s.id}`} type="button" className={btn} aria-label={`Delete session ${describe(s, names)}`} onClick={() => setAsking(s.id)}>Delete</button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {!all && log.length > FIRST_SHOWN && (
            <button type="button" className={btn} onClick={() => setAll(true)}>Show all {log.length} sessions</button>
          )}
        </>
      )}
    </section>
  );
}
