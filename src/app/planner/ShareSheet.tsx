'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { download } from './download';

export type ShareWhat = 'plan' | 'all' | 'gear' | 'everything';
export type ShareFormat = 'text' | 'markdown' | 'json' | 'csv';

export const FORMATS: readonly { id: ShareFormat; label: string; ext: string; mime: string }[] = [
  { id: 'text', label: 'Plain text', ext: 'txt', mime: 'text/plain;charset=utf-8' },
  { id: 'markdown', label: 'Markdown', ext: 'md', mime: 'text/markdown;charset=utf-8' },
  { id: 'json', label: 'JSON', ext: 'json', mime: 'application/json' },
  { id: 'csv', label: 'CSV', ext: 'csv', mime: 'text/csv;charset=utf-8' },
];

/** The import flow's state: nothing, a refusal, a finished import, or a file read and waiting for the user's choice about plans that are already here. */
export type ImportPanel =
  | { kind: 'none' }
  | { kind: 'error'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'ask'; file: string; names: string[]; total: number; same: number; clash: number; notices: string[]; hasGear: boolean };

export interface ShareSheetProps {
  planName: string;
  planCount: number;
  what: ShareWhat;
  onWhat: (w: ShareWhat) => void;
  /** Why a choice cannot be made now (saved gear that could not be loaded), by choice. */
  blocked: Partial<Record<ShareWhat, string>>;
  /** One line above the choices (saved plans are held back, so this is what the page shows). */
  note: string | null;
  /** The text and file name for a choice and a format. */
  make: (what: ShareWhat, format: ShareFormat) => { text: string; file: string };
  asiair: {
    /** Objects that go in the file, and what is left out (solar-system bodies, targets without a position) in words, or ''. */
    count: number;
    /** Which object each pane of the file is ("Pane 1: M42"): the file has no column for a name. */
    panes: string[];
    left: string;
    /** Why the pane size is not the train's own field, or null. */
    fovNote: string | null;
    make: (degreeLetter: boolean) => { text: string; file: string };
  };
  onPrint: () => void;
  onPickFile: (file: File | undefined) => void;
  importPanel: ImportPanel;
  onImport: (repeats: 'copy' | 'skip' | 'cancel') => void;
  onClose: () => void;
}

const btn =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-white/30 px-3 py-1.5 text-sm font-normal text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';
const radio = 'flex min-h-11 items-start gap-2 py-2 text-sm font-normal text-white/90';

/**
 * The Share sheet: what to share (this plan, all plans, gear, everything) and in what format, each as a file or as text to copy; Print; the ASIAir
 * positions file; and Import plans. A dialog over the page (full screen on a phone, a side panel on a desktop); Escape closes it.
 */
export default function ShareSheet({ planName, planCount, what, onWhat, blocked, note, make, asiair, onPrint, onPickFile, importPanel, onImport, onClose }: ShareSheetProps) {
  const [format, setFormat] = useState<ShareFormat>('text');
  const [letter, setLetter] = useState(false);
  const [said, setSaid] = useState('');
  const out = useMemo(() => make(what, format), [make, what, format]);
  const asi = useMemo(() => asiair.make(letter), [asiair, letter]);
  const fmt = FORMATS.find((f) => f.id === format)!;

  // The page behind is inert while the sheet is open; Escape and Tab are heard here, so they work wherever focus is.
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    heading.current?.focus();
    const own = dialog.current;
    const made: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === own || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      made.push(el);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && own) {
        const items = Array.from(own.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter((el) => el.closest('[hidden]') === null);
        if (items.length === 0) return;
        const at = document.activeElement;
        const inside = at instanceof Node && own.contains(at);
        if (e.shiftKey && (!inside || at === items[0] || at === heading.current)) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && (!inside || at === items[items.length - 1])) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      made.forEach((el) => el.removeAttribute('inert'));
    };
  }, []);

  const save = (file: string, text: string, mime: string, bom: boolean) => {
    try {
      download(file, text, mime, bom);
      setSaid(`Downloaded ${file}.`);
    } catch (e) {
      setSaid(`Not downloaded: ${(e as Error).message}. Select the text in the box and copy it by hand.`);
    }
  };
  const copy = async (text: string, label: string) => {
    try {
      if (!navigator.clipboard) throw new Error('this browser does not let a page copy');
      await navigator.clipboard.writeText(text);
      setSaid(`Copied ${label}.`);
    } catch (e) {
      setSaid(`Not copied: ${(e as Error).message}. Select the text in the box and copy it by hand.`);
    }
  };

  const choices: { id: ShareWhat; label: string }[] = [
    { id: 'plan', label: `This plan: ${planName}` },
    { id: 'all', label: `All plans (${planCount})` },
    { id: 'gear', label: 'Gear' },
    { id: 'everything', label: 'Everything: all plans and gear' },
  ];

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-heading"
      data-testid="share-sheet"
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white shadow-2xl print:hidden md:inset-y-0 md:left-auto md:right-0 md:w-[32rem] md:max-w-[90vw] md:border-l md:border-white/20"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        <h2 id="share-heading" ref={heading} tabIndex={-1} className="mb-3 text-xl font-light tracking-[0.1em] text-white focus:outline-none">
          SHARE AND EXPORT
        </h2>
        {note !== null && <p className="mb-3 break-words text-sm font-normal text-orange-100" data-testid="share-note">{note}</p>}

        <fieldset className="mb-3 min-w-0">
          <legend className="mb-1 text-sm font-medium text-white">What to share</legend>
          {choices.map((c) => (
            <div key={c.id}>
              <label className={radio}>
                <input type="radio" name="share-what" value={c.id} checked={what === c.id} disabled={blocked[c.id] !== undefined} onChange={() => onWhat(c.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-sky-400" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{c.label}</span>
              </label>
              {blocked[c.id] !== undefined && <p className="ml-7 break-words text-xs font-normal text-orange-100">{blocked[c.id]}</p>}
            </div>
          ))}
        </fieldset>

        <fieldset className="mb-3 min-w-0">
          <legend className="mb-1 text-sm font-medium text-white">Format</legend>
          <div className="flex flex-wrap gap-x-4">
            {FORMATS.map((f) => (
              <label key={f.id} className={radio}>
                <input type="radio" name="share-format" value={f.id} checked={format === f.id} onChange={() => setFormat(f.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-sky-400" />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mb-2 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => save(out.file, out.text, fmt.mime, format === 'csv')}>Download file</button>
          <button type="button" className={btn} onClick={() => void copy(out.text, fmt.label.toLowerCase())}>Copy text</button>
        </div>
        <label htmlFor="share-text" className="sr-only">Text to share</label>
        <textarea id="share-text" readOnly value={out.text} rows={8} wrap="soft" className="mb-1 block w-full min-w-0 rounded border border-white/30 bg-black/60 p-2 font-mono text-xs font-normal text-white focus:outline-none focus:ring-2 focus:ring-sky-400" />
        <p className="mb-4 text-xs font-normal text-white/70">Plain text and Markdown are run sheets: order, time, name, position, subs, filter. JSON keeps everything and can be imported again below.</p>

        <section aria-labelledby="share-print" className="mb-4 border-t border-white/10 pt-3">
          <h3 id="share-print" className="mb-1 text-base font-normal text-white">Print</h3>
          <p className="mb-2 text-sm font-normal text-white/80">Prints the run sheet for what is chosen above, black on white, one column, A4 or Letter. In the print dialog choose Save as PDF for a PDF.</p>
          <button type="button" className={btn} onClick={onPrint}>Print run sheet</button>
        </section>

        <section aria-labelledby="share-asiair" className="mb-4 border-t border-white/10 pt-3">
          <h3 id="share-asiair" className="mb-1 text-base font-normal text-white">Export for ASIAir (CSV)</h3>
          <p className="mb-2 text-sm font-normal text-white/80" data-testid="asiair-note">
            Positions only, for this plan: {asiair.count} {asiair.count === 1 ? 'target' : 'targets'}, one pane each (Pane 1, Pane 2 and so on) with its RA and Dec. The file has no column for a name, so the panes are listed below in the order of the plan. Exposure, gain, filter and times do not import into the ASIAir; read those from the run sheet.{asiair.left === '' ? '' : ` ${asiair.left}`}
          </p>
          {asiair.panes.length > 0 && (
            <ul className="mb-2 list-none break-words text-sm font-normal text-white/90" data-testid="asiair-panes">
              {asiair.panes.map((p) => (
                <li key={p} className="break-words [overflow-wrap:anywhere]">{p}</li>
              ))}
            </ul>
          )}
          {asiair.fovNote !== null && <p className="mb-2 break-words text-sm font-normal text-orange-100">{asiair.fovNote}</p>}
          <label className="mb-2 flex min-h-11 items-start gap-2 text-sm font-normal text-white/90">
            <input type="checkbox" checked={letter} onChange={(e) => setLetter(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-sky-400" />
            <span>Write the degree sign as the letter d (try this if the ASIAir refuses the file)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={asiair.count === 0} onClick={() => save(asi.file, asi.text, 'text/csv;charset=utf-8', false)}>Download file</button>
            <button type="button" className={btn} disabled={asiair.count === 0} onClick={() => void copy(asi.text, 'the ASIAir CSV')}>Copy text</button>
          </div>
          <p className="mt-2 text-xs font-normal text-white/70">
            Not yet tested on a real ASIAir. The format is copied from a real Telescopius export, and the ASIAir may not take unrelated targets as panes. The one test to run: in the ASIAir app open Plan, Add, Import, load the downloaded file (download works better than paste), and check that each pane arrives at the right RA and Dec. If it refuses the file, tick the box above and try again.
          </p>
        </section>

        <section aria-labelledby="share-import" className="mb-4 border-t border-white/10 pt-3">
          <h3 id="share-import" className="mb-1 text-base font-normal text-white">Import plans</h3>
          <p className="mb-2 text-sm font-normal text-white/80">Adds plans from a JSON file made here. Your plans are never replaced: a plan that is already here is skipped, and a plan that has the id of a different plan here is skipped or added as a copy.</p>
          <label htmlFor="plans-import" className="mb-1 block text-sm font-normal text-white/90">Plans file (JSON)</label>
          <input
            id="plans-import"
            type="file"
            accept="application/json,.json"
            className="block w-full min-w-0 text-sm font-normal text-white file:mr-3 file:min-h-11 file:rounded file:border file:border-white/30 file:bg-transparent file:px-3 file:text-white"
            onChange={(e) => {
              onPickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {importPanel.kind === 'error' && <p role="alert" className="mt-2 break-words text-sm font-normal text-orange-100" data-testid="import-error">Nothing was imported. {importPanel.text}</p>}
          {importPanel.kind === 'done' && <p role="status" className="mt-2 break-words text-sm font-normal text-white" data-testid="import-done">{importPanel.text}</p>}
          {importPanel.kind === 'ask' && (
            <div role="group" aria-label="Import choice" className="mt-2 rounded border border-white/30 p-3" data-testid="import-ask">
              <p className="break-words text-sm font-normal text-white">
                {importPanel.file} holds {importPanel.total} {importPanel.total === 1 ? 'plan' : 'plans'}: {importPanel.names.join(', ')}.
                {importPanel.same > 0 ? (importPanel.same === importPanel.total ? ` ${importPanel.total === 1 ? 'It is' : 'All of them are'} already here and will be skipped.` : ` ${importPanel.same} of ${importPanel.total} ${importPanel.same === 1 ? 'is' : 'are'} already here and will be skipped.`) : ''}
                {importPanel.clash > 0 ? ` ${importPanel.clash === 1 ? 'One has' : `${importPanel.clash} have`} the same id as a different plan here.` : ''}
              </p>
              {importPanel.notices.map((n) => (
                <p key={n} className="mt-1 break-words text-sm font-normal text-orange-100">{n}</p>
              ))}
              {importPanel.hasGear && <p className="mt-1 text-sm font-normal text-white/80">The file also holds gear. Import it under Gear and site, Import profile.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {importPanel.clash > 0 ? (
                  <>
                    <button type="button" className={btn} onClick={() => onImport('copy')}>Import, same-id plans as copies</button>
                    <button type="button" className={btn} onClick={() => onImport('skip')}>Import new plans only</button>
                  </>
                ) : (
                  <button type="button" className={btn} onClick={() => onImport('skip')}>Import {importPanel.total === 1 ? 'the plan' : `${importPanel.total} plans`}</button>
                )}
                <button type="button" className={btn} onClick={() => onImport('cancel')}>Cancel</button>
              </div>
            </div>
          )}
        </section>

        <p role="status" aria-live="polite" className="min-h-5 break-words text-sm font-normal text-white" data-testid="share-status">{said}</p>
      </div>
      <div className="border-t border-white/20 p-3">
        <button type="button" className={btn} onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body,
  );
}
