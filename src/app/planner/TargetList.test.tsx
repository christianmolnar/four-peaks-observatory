/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { planTonight, planTrainFor } from '@/planner/plan';
import type { PlanEntry } from '@/planner/plan';
import { starterTargets } from '@/planner/catalog';
import { sampleProfile } from '@/planner/state';
import TargetList from './TargetList';

// The paging rule of the list, over more rows than a small test catalog has: ten first, ten more a press, never past 100.

const profile = sampleProfile();
const base = planTonight({
  site: { latitude: 33.6, longitude: -111.7 },
  horizon: null,
  minAltitude: 20,
  date: '2026-11-13',
  train: planTrainFor(profile, profile.trains[0]),
  targets: starterTargets,
}).entries.filter((e) => e.usableMinutes > 0)[0];

const many = (n: number): PlanEntry[] => Array.from({ length: n }, (_, i) => ({ ...base, id: `t${i}`, name: `Target ${i}` }));
const fmt = (d: Date) => d.toISOString().slice(11, 16);

const mount = (entries: PlanEntry[], extra: Partial<React.ComponentProps<typeof TargetList>> = {}) =>
  render(
    <TargetList
      entries={entries}
      label="Test list"
      idPrefix="t"
      formatTime={fmt}
      describe={() => ({ aka: '', meta: 'Galaxy' })}
      planIds={new Set()}
      added={null}
      onAdd={() => undefined}
      openId=""
      onToggle={() => undefined}
      renderDetail={() => null}
      {...extra}
    />,
  );

afterEach(cleanup);

describe('TargetList paging', () => {
  it('120 entries: ten rows, then 20, ... and it stops at 100 with no button left', () => {
    mount(many(120));
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Show 10 more' })).toBeTruthy();
    for (let n = 20; n <= 100; n += 10) {
      fireEvent.click(screen.getByRole('button', { name: 'Show 10 more' }));
      expect(screen.getAllByRole('listitem')).toHaveLength(n);
    }
    expect(screen.queryByRole('button', { name: /^Show \d+ more$/ })).toBeNull();
    expect(screen.getByText('Showing 100 of 100')).toBeTruthy();
  });

  it('keeps the keyboard in the list: the first new row takes focus after Show more', () => {
    mount(many(30));
    fireEvent.click(screen.getByRole('button', { name: 'Show 10 more' }));
    expect(document.activeElement).toBe(document.getElementById('t-name-t10'));
  });

  it('a list of ten or fewer has no paging line', () => {
    mount(many(7));
    expect(screen.queryByText(/^Showing/)).toBeNull();
  });

  it('Add keeps its place in the list and says In my plan; a press on it does nothing more', () => {
    const onAdd = jest.fn();
    const { rerender } = mount(many(3), { onAdd });
    const add = screen.getByRole('button', { name: 'Add Target 0 to my plan' });
    add.focus();
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith('t0');
    rerender(
      <TargetList entries={many(3)} label="Test list" idPrefix="t" formatTime={fmt} describe={() => ({ aka: '', meta: 'Galaxy' })} planIds={new Set(['t0'])} added={{ id: 't0', text: 'Added, #1 in My plan' }} onAdd={onAdd} openId="" onToggle={() => undefined} renderDetail={() => null} />,
    );
    const same = screen.getByRole('button', { name: 'Target 0 is in my plan' });
    expect(same.textContent).toBe('In my plan');
    expect(screen.getByText('Added, #1 in My plan')).toBeTruthy();
    fireEvent.click(same);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe('TargetList rows on a phone and at md', () => {
  it('keeps one line for up, peak, fit and score, and a one-line Why that is not hidden on a phone', () => {
    mount(many(2));
    const row = screen.getAllByRole('listitem')[0];
    const stats = row.querySelector('[data-testid="row-fit-score"]')!.parentElement!;
    expect(stats.className).toContain('md:contents');
    expect(stats.textContent).toMatch(/Up .*peak .*Score \d+/);
    const why = [...row.querySelectorAll('p')].find((p) => /h clear/.test(p.textContent ?? ''))!;
    expect(why.className).toContain('line-clamp-1');
    expect(why.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('a phone row has no vertical padding (about 64 px, measured in the browser probe); md keeps 6 px', () => {
    mount(many(1));
    const cls = screen.getAllByRole('listitem')[0].className.split(' ');
    expect(cls).toContain('py-0');
    expect(cls).toContain('md:py-1.5');
    expect(cls).not.toContain('py-0.5');
  });

  it('the column titles stick below the page header and the control strip', () => {
    const { container } = mount(many(1));
    const head = container.querySelector('[aria-hidden="true"]')!;
    expect(head.className).toContain('sticky');
    expect(head.className).toContain('top-[var(--planner-top,0px)]');
  });
});
