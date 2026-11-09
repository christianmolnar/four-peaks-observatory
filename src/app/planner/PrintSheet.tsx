import { compass, fitLabel, seasonLabel } from '@/planner/plan';
import type { PlanEntry } from '@/planner/plan';
import { TREND_TEXT } from '@/planner/itinerary';
import type { ItineraryReport } from './ItinerarySection';

export interface PrintSheetProps {
  date: string;
  siteLine: string;
  trainLine: string;
  nightLine: string;
  horizonLine: string;
  entries: readonly PlanEntry[];
  captured: ReadonlySet<string>;
  formatTime: (d: Date) => string;
  /** The night itinerary as it stands, or null when there is none to show. */
  itinerary?: ItineraryReport | null;
}

/**
 * The plan as a plain black-on-white page. It is in the page but hidden on screen; "Print or save as PDF"
 * opens the browser's print dialog, whose print stylesheet (the rules below) hides everything else.
 * Same rows as the Targets table and the CSV: the filtered list, in rank order.
 */
export default function PrintSheet({ date, siteLine, trainLine, nightLine, horizonLine, entries, captured, formatTime, itinerary }: PrintSheetProps) {
  return (
    <div className="planner-print-sheet hidden print:block bg-white text-black text-[11pt]" data-testid="print-sheet">
      <style>{`@media print {
  nav { display: none !important; }
  nav ~ div { padding-top: 0 !important; }
  body { background: #fff !important; }
  .planner-print-sheet table { border-collapse: collapse; width: 100%; }
  .planner-print-sheet tr { break-inside: avoid; }
  .planner-print-sheet th, .planner-print-sheet td { border-bottom: 1px solid #999; padding: 3pt 4pt; text-align: left; vertical-align: top; }
  .planner-print-sheet thead { display: table-header-group; }
  @page { margin: 14mm; }
}`}</style>
      <h1 className="text-2xl font-semibold">Imaging plan for the evening of {date}</h1>
      <p className="mt-1">{siteLine}</p>
      <p>{trainLine}</p>
      <p>{nightLine}</p>
      <p>{horizonLine}</p>
      <p className="mt-1 text-sm">
        Planner estimates, not measurements. Times are local to the site&apos;s time zone when one is set, otherwise to the browser. Made with the Four Peaks Observatory imaging planner (free guest tool).
      </p>
      {entries.length === 0 ? (
        <p className="mt-4">No targets match the filters on screen.</p>
      ) : (
        <table className="mt-4 text-sm">
          <caption className="sr-only">Targets ranked for the evening of {date}</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Target</th>
              <th scope="col">Season</th>
              <th scope="col">Fit</th>
              <th scope="col">Peak</th>
              <th scope="col">Usable window</th>
              <th scope="col">Moon</th>
              <th scope="col">Score</th>
              <th scope="col">Captured</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id}>
                <td>{i + 1}</td>
                <th scope="row" className="font-normal">
                  <strong>{e.name}</strong>
                  {e.isPlanet ? ' (planet)' : ''}
                  <br />
                  <span>{e.why}</span>
                </th>
                <td>{e.isPlanet ? 'n/a' : `${seasonLabel(e.seasonMonths)}${e.inSeason ? ' (now)' : ''}`}</td>
                <td>{fitLabel(e)}</td>
                <td>{e.peakAltitude.toFixed(0)}° {compass(e.peakAzimuth)} at {formatTime(e.peakTime)}</td>
                <td>{e.windows.length === 0 ? 'none' : e.windows.map((w) => `${formatTime(w.start)} to ${formatTime(w.end)}`).join(', ')}</td>
                <td>{(e.moonIllumination * 100).toFixed(0)}% lit, {e.moonSeparation.toFixed(0)}° away</td>
                <td>{e.score.total}</td>
                <td>{captured.has(e.id) ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {itinerary && itinerary.plan.slots.length > 0 && (
        <>
          <h2 className="mt-6 text-xl font-semibold">Night itinerary</h2>
          <p className="mt-1 text-sm">Imaging can start at {formatTime(itinerary.plan.startsAt)}.{itinerary.plan.startNote ? ` ${itinerary.plan.startNote}` : ''}</p>
          <table className="mt-2 text-sm">
            <caption className="sr-only">Night itinerary, in order</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Target</th>
                <th scope="col">Start to end</th>
                <th scope="col">Altitude at start</th>
                <th scope="col">In the middle</th>
                <th scope="col">At end</th>
                <th scope="col">Trend</th>
              </tr>
            </thead>
            <tbody>
              {itinerary.plan.slots.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <th scope="row" className="font-normal">{s.name}</th>
                  <td>{s.altitudes ? `${formatTime(s.start)} to ${formatTime(s.end)}` : 'no time'}</td>
                  <td>{s.altitudes ? `${s.altitudes.start.altitude.toFixed(0)}° ${s.altitudes.start.direction}` : ''}</td>
                  <td>{s.altitudes ? `${s.altitudes.middle.altitude.toFixed(0)}° ${s.altitudes.middle.direction}` : ''}</td>
                  <td>{s.altitudes ? `${s.altitudes.end.altitude.toFixed(0)}° ${s.altitudes.end.direction}` : ''}</td>
                  <td>{s.altitudes ? TREND_TEXT[s.altitudes.trend] : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
