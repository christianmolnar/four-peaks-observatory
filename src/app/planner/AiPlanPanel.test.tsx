/**
 * @jest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { starterTargets } from '@/planner/catalog';
import { MAX_SLOTS } from '@/planner/itinerary';
import { tonightsNight } from '@/planner/plan';
import { sampleProfile } from '@/planner/state';
import AiPlanPanel from './AiPlanPanel';
import type { AiPlanPanelProps } from './AiPlanPanel';

// The panel on its own, with an answer that has more slots than an itinerary holds (the page's own My plan limit makes it hard to reach).

const profile = sampleProfile();
const site = { latitude: 33.6, longitude: -111.7 };
const night = tonightsNight(site, '2026-12-15', 'America/Phoenix');
if (night.kind !== 'normal') throw new Error('test night must be normal');
const picks = starterTargets.slice(0, MAX_SLOTS + 1);
const slots = picks.map((t, i) => ({ id: t.id, start: `2026-12-15T${String(19 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}-07:00`, end: `2026-12-15T${String(19 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '25' : '55'}-07:00` }));
const answer = { status: 'verified', plan: { exposures: [], plan: slots, cut: [], fitsAll: true }, violations: [], warnings: [], lastTarget: null, flips: 0, repairRounds: 0, modelCalls: 1 };

afterEach(cleanup);

it('a verified plan with more slots than an itinerary holds cannot be applied, and says how many fit', async () => {
  const fetchPlan = (async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => answer })) as unknown as typeof fetch;
  const props: AiPlanPanelProps = {
    base: { site, timeZone: 'America/Phoenix', horizon: null, minAltitude: 20, date: '2026-12-15' },
    targets: picks.map((t) => ({ id: t.id, name: t.name, raHours: t.raHours, decDeg: t.decDeg })),
    blocked: null,
    leftOutNote: '',
    profile,
    train: profile.trains.find((t) => t.kind === 'optical')!,
    siteName: 'Test site',
    nightWord: 'tonight',
    night,
    catalogTargets: starterTargets,
    formatTime: (d) => d.toISOString().slice(11, 16),
    owner: false,
    fetchPlan,
    onApply: jest.fn(async () => true),
  };
  render(<AiPlanPanel {...props} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Plan my night with AI' }));
  const result = await screen.findByTestId('ai-result');
  expect(within(result).getAllByRole('listitem').filter((li) => li.getAttribute('data-testid')?.startsWith('ai-slot-'))).toHaveLength(MAX_SLOTS + 1);
  expect((within(result).getByRole('button', { name: 'Use this plan as my itinerary' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId('ai-apply-note').textContent).toBe(`An itinerary holds at most ${MAX_SLOTS} slots and this plan has ${MAX_SLOTS + 1}. Remove a target from My plan and plan again.`);
  expect(props.onApply).not.toHaveBeenCalled();
});
