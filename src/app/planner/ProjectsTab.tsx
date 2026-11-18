'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MAX_PLANS_FILE_CHARS, PlansFileError, durationText, percentText, readProjectsFile, trackerText } from '@/planner/export';
import type { Profile } from '@/planner/profile';
import {
  BROADBAND_ID,
  MAX_PROJECTS,
  MAX_PROJECT_NAME,
  addProject,
  addSession,
  addSessionsWithIds,
  compareIncomingProjects,
  importProjects,
  loggedMinutes,
  projectSheet,
  removeProject,
  removeSession,
  seedHeldBy,
  seedSessions,
  sessionMinutes,
  updateProject,
  updateSession,
} from '@/planner/projects';
import type { NewProject, NewSession, Project } from '@/planner/projects';
import ProjectEditor from './ProjectEditor';
import type { ProjectEditorProps } from './ProjectEditor';
import ProjectProgress from './ProjectProgress';
import ProjectSessions from './ProjectSessions';
import WrapSelect from './WrapSelect';
import { draftFromProject, newDraft } from './projectDraft';
import type { Draft, DraftContext, PlanLine } from './projectDraft';
import { BROADBAND_NAME, filterName, sheetNames } from './projectNames';
import type { ProjectsApi, ProjectsResult } from './useProjects';

const btn = 'min-h-11 min-w-11 rounded border border-p-line/30 px-3 py-1.5 text-sm font-normal text-p-t1 hover:bg-p-raised/10 disabled:opacity-40';
const field = 'min-h-11 w-full min-w-0 rounded border border-p-line/30 bg-p-bg/60 px-2 py-1 text-sm font-normal text-p-t1';

/** The night's targets the seed offer starts with: last night's three broadband hours (ids of the bundled catalog). */
const SEED_TARGET_IDS = [...new Set(seedSessions().map((s) => s.targetId))];

export interface ProjectsTabProps {
  api: ProjectsApi;
  profile: Profile;
  /** The page's one way to name a target id. */
  targetName: (id: string) => string;
  /** The open plan's setup: where a new project's scope, camera, filters and sub length start. */
  context: DraftContext;
  /** The open plan's targets, offered first when picking a project's targets. */
  planTargets: readonly { id: string; name: string }[];
  /** The minutes the open plan holds per target and filter (broadband and the ticked narrowband filters): a plan target added to a new project starts its boxes from them. */
  planned: ReadonlyMap<string, readonly PlanLine[]>;
  /** The evening a new session starts on (YYYY-MM-DD). */
  today: string;
  search: ProjectEditorProps['search'];
  onShare: () => void;
}

type View = { kind: 'show' } | { kind: 'new'; seed: boolean } | { kind: 'edit' } | { kind: 'rename' } | { kind: 'delete' };

type ImportAsk = { file: string; names: string[]; total: number; same: number; clash: number; notices: string[]; incoming: Project[] };

/**
 * The Projects tab: the marathon projects (several at once, one shown at a time), their progress, the session log, Copy tracker, share and import.
 * Every number comes from the projects engine; this file only lays it out.
 */
export default function ProjectsTab({ api, profile, targetName, context, planTargets, planned, today, search, onShare }: ProjectsTabProps) {
  const uid = useId();
  const projects = api.state.projects;
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<View>({ kind: 'show' });
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const [renameText, setRenameText] = useState('');
  const [renameError, setRenameError] = useState('');
  const [ask, setAsk] = useState<ImportAsk | null>(null);
  const [importError, setImportError] = useState('');
  const refocus = useRef<string | null>(null);

  const project = projects.find((p) => p.id === selected) ?? projects[0] ?? null;
  const names = useMemo(() => (project === null ? null : sheetNames(profile, project.setup, targetName)), [project, profile, targetName]);
  const filterOrder = useMemo(() => {
    const own = [BROADBAND_ID, ...profile.equipment.filters.map((f) => f.id)];
    const extra = (project === null || view.kind !== 'edit' ? [] : project.setup.filterIds).filter((id) => !own.includes(id));
    return [...own, ...extra];
  }, [profile, project, view.kind]);

  // Focus goes where the user was when a form or a confirmation closes (the element that opened it), else stays.
  useEffect(() => {
    if (refocus.current === null) return;
    const el = document.getElementById(refocus.current);
    refocus.current = null;
    el?.focus();
  });

  /** `inForm`: a refusal that leaves its form open is said in that form only (the form is where the user looks), not a second time up here. */
  const finish = (r: ProjectsResult, okText: string, inForm = false): boolean => {
    if (r.ok) {
      setProblem('');
      setSaid(okText);
      return true;
    }
    setSaid('');
    setProblem(inForm && !r.kept ? '' : r.message);
    return r.kept;
  };

  // ---- projects: new, edit, rename, duplicate, delete
  const startNew = (seed: boolean) => {
    setProblem('');
    setSaid('');
    setView({ kind: 'new', seed });
  };
  const newProjectDraft = (seed: boolean): Draft => {
    const filterIds = seed ? [BROADBAND_ID, ...context.filterIds.filter((f) => f !== BROADBAND_ID)] : context.filterIds;
    let d = newDraft({ ...context, filterIds });
    if (seed) {
      d = { ...d, name: 'Marathon', targets: SEED_TARGET_IDS.map((id) => ({ id, lines: Object.fromEntries(filterIds.map((f) => [f, { minutes: '', optional: false }])) })) };
    }
    return d;
  };
  const saveNew = (value: NewProject, seed: boolean): ProjectsResult => {
    let made = '';
    const r = api.change((s, now) => {
      // The latest stored projects, not this page's: another tab may have saved the same offer, and its hours must not be logged twice.
      const held = seed ? seedHeldBy(s) : null;
      if (held !== null) throw new Error(`last night’s hours are already logged in the project “${held}”. Open that project instead of starting another.`);
      const a = addProject(s, value, now);
      made = a.id;
      // The seed's sessions have fixed ids: adding them twice to one project adds nothing.
      return seed ? addSessionsWithIds(a.state, a.id, seedSessions(), now) : a.state;
    });
    if (finish(r, `Saved the project “${value.name}”.`, true)) {
      setSelected(made);
      setView({ kind: 'show' });
      refocus.current = 'project-heading';
    }
    return r;
  };
  const saveEdit = (value: NewProject): ProjectsResult => {
    if (project === null) return { ok: false, message: 'There is no such project.', kept: false };
    const r = api.change((s, now) => updateProject(s, project.id, value, now));
    if (finish(r, `Saved the changes to “${value.name}”.`, true)) {
      setView({ kind: 'show' });
      refocus.current = 'project-edit';
    }
    return r;
  };
  const saveRename = () => {
    if (project === null) return;
    const name = renameText.trim();
    if (name === '' || name.length > MAX_PROJECT_NAME) {
      setRenameError(`Name: type a name of 1 to ${MAX_PROJECT_NAME} characters.`);
      return;
    }
    const r = api.change((s, now) => updateProject(s, project.id, { name }, now));
    if (r.ok || r.kept) {
      setRenameError('');
      setView({ kind: 'show' });
      refocus.current = 'project-rename';
    } else setRenameError(r.message);
    finish(r, `Renamed the project to “${name}”.`);
  };
  const duplicate = () => {
    if (project === null) return;
    let made = '';
    const copyName = `${project.name.slice(0, MAX_PROJECT_NAME - ' (copy)'.length)} (copy)`;
    const r = api.change((s, now) => {
      const a = addProject(s, { name: copyName, setup: project.setup, targets: project.targets, status: project.status }, now);
      made = a.id;
      return a.state;
    });
    if (finish(r, `Duplicated the project as “${copyName}”: the plan was copied, the logged sessions were not.`) && made !== '') setSelected(made);
  };
  const confirmDelete = () => {
    if (project === null) return;
    const r = api.change((s) => removeProject(s, project.id));
    if (finish(r, `Deleted the project “${project.name}”.`)) {
      setSelected('');
      setView({ kind: 'show' });
      refocus.current = 'project-new';
    }
  };

  // ---- sessions
  const withNames = names!;
  const addSessionTo = (draft: NewSession): ProjectsResult => {
    const r = api.change((s, now) => addSession(s, project!.id, draft, now).state);
    finish(r, `Added ${durationText(sessionMinutes(draft))} of ${withNames.filter(draft.filterId)} on ${withNames.target(draft.targetId)} for ${draft.date}.`, true);
    return r;
  };
  const updateSessionIn = (id: string, draft: NewSession): ProjectsResult => {
    const r = api.change((s, now) => updateSession(s, project!.id, id, draft, now));
    finish(r, `Changed the session of ${draft.date} on ${withNames.target(draft.targetId)}.`, true);
    return r;
  };
  const deleteSessionIn = (id: string): ProjectsResult => {
    const gone = project!.sessions.find((x) => x.id === id);
    const r = api.change((s, now) => removeSession(s, project!.id, id, now));
    finish(r, gone === undefined ? 'Deleted the session.' : `Deleted the session of ${gone.date} on ${withNames.target(gone.targetId)}, ${withNames.filter(gone.filterId)}, ${durationText(sessionMinutes(gone))}.`);
    return r;
  };

  // ---- copy tracker
  const copyTracker = async () => {
    if (project === null || names === null) return;
    const text = trackerText(projectSheet(project, names));
    try {
      if (!navigator.clipboard) throw new Error('this browser does not let a page copy');
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        throw new Error('the browser did not allow it');
      }
      setCopyFallback('');
      setProblem('');
      setSaid(`Copied the tracker of “${project.name}”.`);
    } catch (e) {
      setSaid('');
      setProblem(`Not copied: ${(e as Error).message}. Select the text in the box below and copy it by hand.`);
      setCopyFallback(text);
    }
  };

  // ---- import
  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setAsk(null);
    setImportError('');
    setSaid('');
    try {
      if (file.size > MAX_PLANS_FILE_CHARS) throw new PlansFileError('This file is not a planner file with projects. The file is too large.');
      const read = readProjectsFile(await file.text());
      const names5 = read.projects.slice(0, 5).map((p) => `“${p.name}”`);
      if (read.projects.length > 5) names5.push(`and ${read.projects.length - 5} more`);
      const c = compareIncomingProjects(api.state, read.projects);
      setAsk({ file: file.name.length > 40 ? `${file.name.slice(0, 40)}…` : file.name, names: names5, total: read.projects.length, same: c.same, clash: c.clash, notices: read.notices, incoming: read.projects });
    } catch (e) {
      setImportError(e instanceof PlansFileError ? e.message : 'The file could not be read.');
    }
  };
  const finishImport = (choice: 'copy' | 'skip' | 'cancel') => {
    const pending = ask;
    setAsk(null);
    if (choice === 'cancel' || pending === null) return;
    let counts: ReturnType<typeof importProjects> | null = null;
    const r = api.change((s, now) => {
      counts = importProjects(s, pending.incoming, choice, now);
      return counts.state;
    });
    const c = counts as ReturnType<typeof importProjects> | null;
    const parts =
      c === null
        ? []
        : [
            `Added ${c.added} ${c.added === 1 ? 'project' : 'projects'}${c.copies > 0 ? ` (${c.copies} as ${c.copies === 1 ? 'a copy' : 'copies'})` : ''}.`,
            c.skipped > 0 ? `${c.skipped} already here, skipped.` : '',
            c.clashSkipped > 0 ? `${c.clashSkipped} with the id of a different project, skipped.` : '',
            c.leftOut > 0 ? `${c.leftOut} left out: a browser holds at most ${MAX_PROJECTS} projects.` : '',
          ].filter((x) => x !== '');
    finish(r, `${parts.join(' ')} ${pending.notices.join(' ')}`.trim());
  };

  const planLine = (p: Project) => {
    const percent = projectSheet(p, sheetNames(profile, p.setup, targetName)).overall.percent;
    return `${p.name}${p.status === 'active' ? '' : ` (${p.status})`}, ${percentText(percent)}`;
  };

  const importBox = (
    <div className="space-y-2">
      <label htmlFor={`${uid}-import`} className="block text-sm font-normal text-p-t1/90">Import projects file (JSON made by Share and export)</label>
      <input
        id={`${uid}-import`}
        type="file"
        accept="application/json,.json"
        className="block w-full min-w-0 text-sm font-normal text-p-t1 file:mr-3 file:min-h-11 file:rounded file:border file:border-p-line/30 file:bg-transparent file:px-3 file:text-p-t1"
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {importError !== '' && <p role="alert" className="break-words text-sm font-normal text-p-warn-text" data-testid="projects-import-error">Nothing was imported. {importError}</p>}
      {ask !== null && (
        <div role="group" aria-label="Import choice" className="rounded border border-p-line/30 p-3" data-testid="projects-import-ask">
          <p className="break-words text-sm font-normal text-p-t1">
            {ask.file} holds {ask.total} {ask.total === 1 ? 'project' : 'projects'}: {ask.names.join(', ')}.
            {ask.same > 0 ? (ask.same === ask.total ? ` ${ask.total === 1 ? 'It is' : 'All of them are'} already here and will be skipped.` : ` ${ask.same} of ${ask.total} ${ask.same === 1 ? 'is' : 'are'} already here and will be skipped.`) : ''}
            {ask.clash > 0 ? ` ${ask.clash === 1 ? 'One has' : `${ask.clash} have`} the same id as a different project here.` : ''}
          </p>
          {ask.notices.map((n) => (
            <p key={n} className="mt-1 break-words text-sm font-normal text-p-warn-text">{n}</p>
          ))}
          <div className="mt-2 flex flex-wrap gap-2">
            {ask.clash > 0 ? (
              <>
                <button type="button" className={btn} onClick={() => finishImport('copy')}>Import, same-id projects as copies</button>
                <button type="button" className={btn} onClick={() => finishImport('skip')}>Import new projects only</button>
              </>
            ) : (
              <button type="button" className={btn} onClick={() => finishImport('skip')}>Import {ask.total === 1 ? 'the project' : `${ask.total} projects`}</button>
            )}
            <button type="button" className={btn} onClick={() => finishImport('cancel')}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );

  const editorCommon = { profile, targetName, filterName: (id: string) => filterName(profile, id), filterOrder, planTargets, planned, search };

  return (
    <div className="space-y-4" data-testid="projects-tab">
      <h2 id="projects-heading" className="text-xl font-light tracking-[0.15em] text-p-t1">PROJECTS</h2>

      {api.notes.length > 0 && (
        <div role="group" aria-label="About your saved projects" data-testid="projects-notes" className="flex items-start gap-3 rounded-lg border border-p-accent/50 bg-p-bg/80 p-3">
          <p className="min-w-0 flex-1 break-words text-sm font-normal text-p-t1/90">{api.notes.join(' ')}</p>
          <button type="button" className={`${btn} shrink-0`} onClick={api.clearNotes}>Dismiss</button>
        </div>
      )}
      {api.held !== null && <p role="alert" data-testid="projects-held" className="break-words rounded border border-p-warn/40 bg-p-warn-fill/15 px-3 py-2 text-sm font-normal text-p-warn-text">{api.held}</p>}
      {api.unsaved && <p role="alert" data-testid="projects-unsaved" className="break-words rounded border border-p-warn/40 bg-p-warn-fill/15 px-3 py-2 text-sm font-normal text-p-warn-text">Not saved: the latest changes are on this page only, because browser storage did not take them. Copy the tracker or export the project so nothing is lost; the next change tries to save again.</p>}
      <p role="status" aria-live="polite" className="min-h-5 break-words text-sm font-normal text-p-t1" data-testid="projects-status">{said}</p>
      {problem !== '' && <p role="alert" className="break-words text-sm font-normal text-p-warn-text" data-testid="projects-problem">{problem}</p>}

      {!api.loaded ? (
        <p className="text-sm font-normal text-p-t1/80">Loading your projects…</p>
      ) : view.kind === 'new' ? (
        <ProjectEditor
          {...editorCommon}
          title={view.seed ? 'New project from last night’s hours' : 'New project'}
          initial={newProjectDraft(view.seed)}
          review={view.seed ? seedSessions().map((s) => `${targetName(s.targetId)}: ${s.minutes} min`) : undefined}
          saveLabel="Save project"
          onRefused={() => setSaid('')}
          onSave={(v) => saveNew(v, view.seed)}
          onCancel={() => {
            setView({ kind: 'show' });
            refocus.current = 'project-new';
          }}
        />
      ) : project === null ? (
        <div className="space-y-3 rounded-lg border border-p-line/20 p-4" data-testid="projects-empty">
          <p className="text-sm font-normal text-p-t1">No projects yet. A project is a list of targets with the minutes you plan for each filter; you log each night&rsquo;s light and the bars show how far you are.</p>
          <div className="flex flex-wrap gap-2">
            <button id="project-new" type="button" className={btn} onClick={() => startNew(false)}>New project</button>
            <button type="button" className={btn} onClick={() => startNew(true)}>Start from last night&rsquo;s hours</button>
          </div>
          <p className="text-sm font-normal text-p-t1/80">Last night&rsquo;s hours: {seedSessions().map((s) => `${targetName(s.targetId)} ${s.minutes} min`).join(', ')}, all {BROADBAND_NAME.toLowerCase()}. You review them, and type the minutes you plan, before anything is saved.</p>
          {importBox}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-56">
              <label htmlFor="project-pick" className="mb-1 block text-sm font-normal text-p-t1/90">Project</label>
              <WrapSelect id="project-pick" className="w-full" value={project.id} onChange={(e) => { setSelected(e.target.value); setView({ kind: 'show' }); setProblem(''); setSaid(''); setCopyFallback(''); }}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{planLine(p)}</option>
                ))}
              </WrapSelect>
            </div>
            <button id="project-new" type="button" className={btn} onClick={() => startNew(false)} disabled={projects.length >= MAX_PROJECTS}>New project</button>
          </div>
          {projects.length >= MAX_PROJECTS && <p className="text-sm font-normal text-p-t1/80">Projects hold at most {MAX_PROJECTS} projects. Delete one to make another.</p>}

          <div className="flex flex-wrap gap-2" role="group" aria-label="This project">
            <button id="project-edit" type="button" className={btn} onClick={() => { setProblem(''); setSaid(''); setView({ kind: 'edit' }); }}>Edit plan</button>
            <button id="project-rename" type="button" className={btn} onClick={() => { setRenameText(project.name); setRenameError(''); setView({ kind: 'rename' }); }}>Rename</button>
            <button type="button" className={btn} onClick={duplicate} disabled={projects.length >= MAX_PROJECTS}>Duplicate</button>
            <button id="project-delete" type="button" className={btn} onClick={() => setView({ kind: 'delete' })}>Delete</button>
            <button type="button" className={btn} onClick={() => void copyTracker()}>Copy tracker</button>
            <button id="project-share" type="button" className={btn} onClick={onShare}>Share and export…</button>
          </div>

          {view.kind === 'rename' && (
            <form
              className="space-y-2 rounded-lg border border-p-line/30 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveRename();
              }}
            >
              <label htmlFor={`${uid}-rename`} className="block text-sm font-normal text-p-t1/90">New name</label>
              <input id={`${uid}-rename`} autoFocus type="text" maxLength={MAX_PROJECT_NAME + 20} autoComplete="off" value={renameText} onChange={(e) => setRenameText(e.target.value)} className={field} aria-invalid={renameError !== ''} aria-describedby={renameError === '' ? undefined : `${uid}-rename-err`} />
              {renameError !== '' && <p id={`${uid}-rename-err`} role="alert" className="break-words text-sm font-normal text-p-warn-text">{renameError}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={btn}>Save name</button>
                <button type="button" className={btn} onClick={() => { setView({ kind: 'show' }); refocus.current = 'project-rename'; }}>Cancel</button>
              </div>
            </form>
          )}

          {view.kind === 'delete' && (
            <div role="group" aria-labelledby={`${uid}-del`} className="space-y-2 rounded-lg border border-p-warn/50 p-3" data-testid="project-delete-confirm">
              <p id={`${uid}-del`} className="break-words text-sm font-normal text-p-t1">
                Delete the project “{project.name}”? This removes the project, its {project.targets.length} {project.targets.length === 1 ? 'target' : 'targets'}, {project.targets.reduce((n, t) => n + t.lines.length, 0)} planned {project.targets.reduce((n, t) => n + t.lines.length, 0) === 1 ? 'line' : 'lines'} and its {project.sessions.length} logged {project.sessions.length === 1 ? 'session' : 'sessions'} ({durationText(loggedMinutes(project))} of light). It cannot be undone. Copy the tracker or export it first to keep a record.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" autoFocus className={btn} onClick={() => { setView({ kind: 'show' }); refocus.current = 'project-delete'; }}>Keep the project</button>
                <button type="button" className={btn} onClick={confirmDelete}>Delete the project</button>
              </div>
            </div>
          )}

          {view.kind === 'edit' ? (
            <ProjectEditor
              {...editorCommon}
              key={project.id}
              title={`Edit plan: ${project.name}`}
              initial={draftFromProject(project)}
              editNote="Logged sessions are kept. A session for a target or filter you take out stays in the log and shows as not in the plan."
              saveLabel="Save changes"
              onRefused={() => setSaid('')}
              onSave={saveEdit}
              onCancel={() => { setView({ kind: 'show' }); refocus.current = 'project-edit'; }}
            />
          ) : (
            <>
              <h3 id="project-heading" tabIndex={-1} className="break-words text-xl font-normal text-p-t1 focus:outline-none">
                {project.name}
                {project.status !== 'active' && <span className="ml-2 text-sm font-normal text-p-t1/80">({project.status})</span>}
              </h3>
              <ProjectProgress project={project} names={names!} />
              <ProjectSessions key={project.id} project={project} names={names!} today={today} onAdd={addSessionTo} onUpdate={updateSessionIn} onDelete={deleteSessionIn} onRefused={() => setSaid('')} />
              {copyFallback !== '' && (
                <div>
                  <label htmlFor={`${uid}-tracker`} className="mb-1 block text-sm font-normal text-p-t1/90">Tracker text</label>
                  <textarea id={`${uid}-tracker`} readOnly rows={8} value={copyFallback} className="block w-full min-w-0 rounded border border-p-line/30 bg-p-bg/60 p-2 font-mono text-sm font-normal text-p-t1" />
                </div>
              )}
              {importBox}
            </>
          )}
        </>
      )}
    </div>
  );
}
