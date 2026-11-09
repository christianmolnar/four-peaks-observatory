/**
 * @jest-environment jsdom
 */
import { render, cleanup, screen } from '@testing-library/react';
import axe from 'axe-core';
import sample from '@/planner/data/sample-profile.json';
import { starterTargets } from '@/planner/catalog';
import { tonightsNight } from '@/planner/plan';
import { arcToHorizonPoints, validateProfile } from '@/planner/profile';
import { buildItinerary } from '@/planner/itinerary';
import type { ItineraryItem } from '@/planner/itinerary';
import { slotInputFor } from '@/planner/itinerary/resolve';
import NightTimeline from './NightTimeline';

const profile = validateProfile(sample);
const SITE = { latitude: 33.6115, longitude: -111.719, elevationM: 0 };
const NIGHT = tonightsNight(SITE, '2026-12-15');
const HORIZON = arcToHorizonPoints({ startAz: 120, endAz: 320, heightDeg: 42 });
const fmt = (d: Date) => d.toISOString().slice(11, 16);

function draw(ids: string[], startAt?: Date) {
  const items: ItineraryItem[] = ids.map((targetId, i) => ({ id: `n${i}`, targetId, trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' }));
  const inputs = items.map((i) => slotInputFor(i, profile, starterTargets));
  const plan = buildItinerary({ site: SITE, night: NIGHT, horizon: HORIZON, minAltitude: 20, bortle: 6, slots: inputs, startAt, formatTime: fmt });
  const view = render(<NightTimeline plan={plan} inputs={inputs} night={NIGHT} site={SITE} horizon={HORIZON} minAltitude={20} formatTime={fmt} />);
  return { plan, ...view };
}
const thick = (c: HTMLElement) => c.querySelectorAll('svg polyline[stroke-width="5"]');
const violations = async (c: HTMLElement) => (await axe.run(c, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes[0].html.slice(0, 80)}`);

afterEach(cleanup);

describe('Night graph', () => {
  it('empty: the frame and the night edges are drawn, nothing else, and it says what to do', async () => {
    const { container } = draw([]);
    expect(thick(container)).toHaveLength(0);
    expect(container.textContent).toMatch(/Night starts 01:49/);
    expect(container.textContent).toMatch(/ends 12:55/);
    expect(container.textContent).toMatch(/Add a target to draw it on the night\./);
    expect(await violations(container)).toEqual([]);
  });

  it('one slot: one thick segment, numbered, with the start marker and a described, focusable picture', async () => {
    const { container, plan } = draw(['m31']);
    expect(thick(container)).toHaveLength(1);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('tabindex')).toBe('0');
    const desc = container.querySelector(`#${svg.getAttribute('aria-labelledby')!.split(' ')[1]}`)!.textContent!;
    expect(desc).toContain(`Slot 1, Andromeda Galaxy, ${fmt(plan.slots[0].start)} to ${fmt(plan.slots[0].end)}`);
    expect(container.textContent).toContain(`Start ${fmt(plan.startsAt)}`);
    expect(await violations(container)).toEqual([]);
  });

  it('six slots: six segments, five changeover connectors among them, a key line per number', async () => {
    const { container, plan } = draw(['m31', 'm42', 'm33', 'ic405', 'planet-jupiter', 'planet-moon']);
    const drawn = plan.slots.filter((s) => s.altitudes).length;
    expect(thick(container)).toHaveLength(drawn);
    expect(container.querySelectorAll('svg line[stroke-dasharray="1 5"]')).toHaveLength(drawn - 1);
    expect(container.querySelectorAll('ol[aria-label="Slots on the graph"] li')).toHaveLength(6);
    expect(await violations(container)).toEqual([]);
  });

  it('a slot with no time is listed as "no time, not drawn" and has no line', () => {
    const { container, plan } = draw(['m31', 'm42'], new Date((NIGHT.end as Date).getTime() + 3600000));
    expect(plan.slots.every((s) => s.altitudes === null)).toBe(true);
    expect(thick(container)).toHaveLength(0);
    expect(container.textContent).toMatch(/1\. Andromeda Galaxy: no time, not drawn/);
    expect(container.querySelector('svg desc')!.textContent).toMatch(/Slot 1, Andromeda Galaxy: no time\./);
  });

  it('the table of numbers is collapsed on load and holds start, middle and end for every slot', () => {
    const { container, plan } = draw(['m31', 'm42']);
    const details = screen.getByTestId('timeline-numbers') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const a = plan.slots[0].altitudes!;
    expect(rows[0].textContent).toContain(`${Math.round(a.start.altitude)}° ${a.start.direction}`);
    expect(rows[0].textContent).toContain(`${Math.round(a.end.altitude)}° ${a.end.direction}`);
  });

  it('uses no animation, so there is nothing for reduced motion to switch off', () => {
    const { container } = draw(['m31']);
    expect(container.innerHTML).not.toMatch(/animate|transition|animation/i);
  });
});
