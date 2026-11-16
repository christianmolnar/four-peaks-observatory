import { GAIN_NOTE, NOT_SCHEDULED } from '@/planner/export';
import type { PlanSheet, SheetRow, ShareDoc } from '@/planner/export';

export interface PrintSheetProps {
  doc: ShareDoc;
}

const timeText = (r: SheetRow): string => (r.state === 'unscheduled' ? NOT_SCHEDULED : r.start === '' ? 'no time' : r.end === '' ? r.start : `${r.start}–${r.end}`);

/** What the Subs cell says: the timeline's subs and light, or why there are none. */
function Subs({ r }: { r: SheetRow }) {
  if (r.subSeconds !== null && r.subCount !== null) {
    return (
      <>
        <strong className="run-sheet-nowrap">{r.subCount} &times; {r.subSeconds} s</strong>
        <br />
        {r.lightMin} min
      </>
    );
  }
  if (r.state === 'unscheduled') return <>none</>;
  const light = r.lightMin !== null && r.lightMin > 0 ? <><br />about {r.lightMin} min</> : null;
  return r.type === 'Solar system' ? <>clips, not subs{light}</> : <>not worked out{light}</>;
}

function Plan({ p, first }: { p: PlanSheet; first: boolean }) {
  return (
    <section className={first ? '' : 'run-sheet-break'} aria-label={`Run sheet: ${p.name}`}>
      <h1 className="break-words text-2xl font-semibold">{p.name}</h1>
      <p>Evening of {p.date}. Times are local at the site.</p>
      <p>Site: {p.site}</p>
      <p>Train: {p.train}</p>
      {p.night !== '' && <p>{p.night}</p>}
      {p.startsAt !== '' && <p>Imaging starts {p.startsAt}.</p>}
      <p>{GAIN_NOTE} Write it in the Gain column.</p>
      {p.notes.trim() !== '' && <p className="whitespace-pre-line break-words">Notes: {p.notes}</p>}
      {p.warnings.map((w) => (
        <p key={w} className="font-semibold">Warning: {w}</p>
      ))}
      {p.caveat !== '' && <p>Note: {p.caveat}</p>}
      {p.rows.length === 0 ? (
        <p className="mt-3">No objects in this plan.</p>
      ) : (
        <table className="mt-3 print:font-normal print:text-black" data-testid="print-plan">
          <caption className="sr-only">Run sheet for {p.name}, in order</caption>
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '23%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="print:text-black">#</th>
              <th scope="col" className="print:text-black">Time</th>
              <th scope="col" className="print:text-black">Target</th>
              <th scope="col" className="print:text-black">Subs</th>
              <th scope="col" className="print:text-black">Gain</th>
              <th scope="col" className="print:text-black">Filter</th>
              <th scope="col" className="print:text-black">Notes</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.order}>
                <td className="print:font-normal print:text-black">{r.order}</td>
                <td className="print:font-normal print:text-black">{r.state === 'unscheduled' || r.start === '' ? timeText(r) : <span className="run-sheet-nowrap">{timeText(r)}</span>}</td>
                <th scope="row" className="font-normal print:font-normal print:text-black">
                  <strong>{r.name}</strong>
                  {r.type !== '' && <> ({r.type})</>}
                  {r.ra !== '' && (
                    <>
                      <br />
                      RA {r.ra}
                      <br />
                      Dec {r.dec}
                    </>
                  )}
                </th>
                <td className="print:font-normal print:text-black">
                  <Subs r={r} />
                </td>
                <td className="run-sheet-gain print:font-normal print:text-black" />
                <td className="print:font-normal print:text-black">{r.filter}</td>
                <td className="print:font-normal print:text-black">
                  {[r.preset, r.favorite, r.note, r.warning === '' ? '' : `Warning: ${r.warning}`].filter((x) => x !== '').join('. ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {p.totalLightMin !== null && <p className="mt-2 font-semibold">Total light: {p.totalLightMin} min</p>}
    </section>
  );
}

/**
 * The run sheet as a plain black-on-white page: one table per plan (order, time, target and position, subs, gain to write in, filter, notes),
 * and the gear as lists. It is in the page but hidden on screen; the print stylesheet below hides everything else. It reads the same
 * `ShareDoc` as the text, Markdown and CSV files, so the numbers are the rows' own, and nothing on it is told by colour.
 */
export default function PrintSheet({ doc }: PrintSheetProps) {
  return (
    <div className="planner-print-sheet hidden print:block bg-white text-black text-[12pt]" data-testid="print-sheet">
      <style>{`@media print {
  nav { display: none !important; }
  nav ~ div { padding-top: 0 !important; }
  body { background: #fff !important; }
  .planner-print-sheet { width: 100%; overflow-wrap: break-word; }
  .planner-print-sheet table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  .planner-print-sheet .run-sheet-nowrap { white-space: nowrap; }
  .planner-print-sheet tr { break-inside: avoid; }
  .planner-print-sheet th, .planner-print-sheet td { border: 1px solid #555; padding: 3pt 4pt; text-align: left; vertical-align: top; }
  .planner-print-sheet .run-sheet-gain { min-width: 14mm; }
  .planner-print-sheet .run-sheet-break { break-before: page; }
  .planner-print-sheet thead { display: table-header-group; }
  @page { margin: 12mm; }
}`}</style>
      {doc.notes.map((n) => (
        <p key={n} className="font-semibold">{n}</p>
      ))}
      {doc.plans.map((p, i) => (
        <Plan key={i} p={p} first={i === 0 && doc.notes.length === 0} />
      ))}
      {doc.gear !== null && (
        <section className={doc.plans.length > 0 ? 'run-sheet-break' : ''} aria-label="Gear">
          <h1 className="text-2xl font-semibold">Gear</h1>
          {doc.gear.sections.map((s) => (
            <div key={s.title}>
              <h2 className="mt-3 text-lg font-semibold">{s.title}</h2>
              <ul className="list-disc pl-5">
                {s.lines.map((l, i) => (
                  <li key={i} className="break-words">{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      <p className="mt-4 text-sm">Planner estimates, not measurements. Made with the Four Peaks Observatory imaging planner.</p>
    </div>
  );
}
