'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_PLAN_NAME } from '@/planner/state/plans';
import WrapSelect from './WrapSelect';

export interface PlansBarProps {
  plans: readonly { id: string; name: string; targets: number }[];
  openId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  /** Returns whether the plan was deleted. */
  onDelete: () => boolean;
}

const btn =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-p-line/30 px-3 py-1.5 text-sm font-normal text-p-t1 hover:bg-p-raised/10 disabled:opacity-40';

/**
 * My plans: the saved plans, one open at a time. The switcher opens another; New, Rename, Duplicate and Delete act on the open one
 * (New starts empty). Rename and the delete confirmation are in the page, not a browser dialog: Rename takes focus to its box,
 * Delete to Cancel, the safe choice, and both put focus back on their button when they close; after a delete, focus goes to the switcher.
 */
export default function PlansBar({ plans, openId, onOpen, onNew, onRename, onDuplicate, onDelete }: PlansBarProps) {
  const open = plans.find((p) => p.id === openId) ?? plans[0];
  const [mode, setMode] = useState<'rename' | 'delete' | null>(null);
  const [draft, setDraft] = useState('');
  const renameButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (mode === 'rename') {
      nameBox.current?.focus();
      nameBox.current?.select();
    }
    if (mode === 'delete') cancelDelete.current?.focus();
  }, [mode]);
  // Opening another plan closes whatever was asked of the one before.
  useEffect(() => setMode(null), [openId]);
  // After a delete the pressed button is gone: focus goes to the switcher, which shows the plan that took its place.
  const focusSwitch = useRef(false);
  useEffect(() => {
    if (!focusSwitch.current) return;
    focusSwitch.current = false;
    document.getElementById('plan-switch')?.focus();
  });
  if (!open) return null;

  const close = (back: HTMLButtonElement | null) => {
    setMode(null);
    back?.focus();
  };

  return (
    <section aria-labelledby="plans-heading" data-testid="plans-bar" className="rounded-lg border border-p-line/10 bg-p-bg/70 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-0 basis-full sm:basis-72">
          <h2 id="plans-heading" className="mb-1 text-sm font-normal text-p-t1/90">
            <label htmlFor="plan-switch">My plans ({plans.length})</label>
          </h2>
          <WrapSelect id="plan-switch" className="w-full" value={open.id} onChange={(e) => onOpen(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.targets})</option>
            ))}
          </WrapSelect>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={onNew}>New</button>
          <button
            ref={renameButton}
            type="button"
            className={btn}
            aria-expanded={mode === 'rename'}
            onClick={() => {
              setDraft(open.name);
              setMode('rename');
            }}
          >
            Rename
          </button>
          <button type="button" className={btn} onClick={onDuplicate}>Duplicate</button>
          <button ref={deleteButton} type="button" className={btn} aria-expanded={mode === 'delete'} onClick={() => setMode('delete')}>Delete</button>
        </div>
      </div>
      {mode === 'rename' && (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() === '') return;
            onRename(draft);
            close(renameButton.current);
          }}
        >
          <div className="min-w-0 basis-72">
            <label htmlFor="plan-name" className="mb-1 block text-sm font-normal text-p-t1/90">Plan name</label>
            <input
              ref={nameBox}
              id="plan-name"
              type="text"
              autoComplete="off"
              maxLength={MAX_PLAN_NAME}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') close(renameButton.current);
              }}
              className="min-h-11 w-full rounded border border-p-line/30 bg-p-bg/60 px-2 py-1 text-sm font-normal text-p-t1"
            />
          </div>
          <button type="submit" className={btn} disabled={draft.trim() === ''}>Save name</button>
          <button type="button" className={btn} onClick={() => close(renameButton.current)}>Cancel</button>
        </form>
      )}
      {mode === 'delete' && (
        <div role="group" aria-labelledby="plan-delete-title" data-testid="plan-delete-confirm" className="mt-3 max-w-xl rounded-lg border border-p-warn/50 bg-p-bg/80 p-4">
          <p id="plan-delete-title" className="break-words text-sm font-normal text-p-t1">
            Delete the plan “{open.name}”?
          </p>
          <p className="mt-1 text-sm font-normal text-p-t1/90">
            Its {open.targets} {open.targets === 1 ? 'target' : 'targets'}, times and notes are removed from this browser. This cannot be undone.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className={`${btn} max-w-full min-w-0 [overflow-wrap:anywhere] text-left`}
              onClick={() => {
                setMode(null);
                focusSwitch.current = onDelete();
              }}
            >
              Yes, delete {open.name}
            </button>
            <button ref={cancelDelete} type="button" className={btn} onClick={() => close(deleteButton.current)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
