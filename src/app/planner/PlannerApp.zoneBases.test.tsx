/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// A zone row's bad box falls back to that row's own saved zone, never to another zone's numbers. A new row has no
// saved zone, so a bad box in it draws nothing. Checked on the chart (its description) and on the sliders.

const A = { startAz: 10, endAz: 40, heightDeg: 15 };
const B = { startAz: 100, endAz: 160, heightDeg: 60 };
const C = { startAz: 220, endAz: 300, heightDeg: 20 };

const IDS = { start: 'arc-start', end: 'arc-end', height: 'arc-height' } as const;
const idOf = (zone: number, k: keyof typeof IDS) => (zone === 0 ? IDS[k] : `${IDS[k]}-${zone + 1}`);
const box = (zone: number, k: keyof typeof IDS) => document.getElementById(`${idOf(zone, k)}-number`) as HTMLInputElement;
const LABEL = { start: 'Start azimuth', end: 'End azimuth', height: 'Height' } as const;
const sliderOf = (zone: number, k: keyof typeof IDS) => screen.getAllByRole('slider', { name: `${LABEL[k]} slider` })[zone] as HTMLInputElement;
const chart = () => (document.getElementById('polar-desc') as HTMLElement).textContent as string;
const set = (zone: number, k: keyof typeof IDS, text: string) => fireEvent.change(box(zone, k), { target: { value: text } });
const remove = (n: number) => fireEvent.click(screen.getByRole('button', { name: `Remove zone ${n}` }));
const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add another zone' }));

/** What the chart says for these zones, as the editor words it. */
const said = (arcs: { startAz: number; endAz: number; heightDeg: number }[]) => {
  const { describeArcs } = jest.requireActual('./HorizonEditor') as typeof import('./HorizonEditor');
  return describeArcs(arcs);
};

const app = (zones: (typeof A)[]) => {
  const p = sampleProfile();
  p.sites[0] = { ...p.sites[0], blockedArcs: zones };
  return render(<PlannerApp initialDate="2026-12-15" initialProfile={p} />);
};
const sliders = (zone: number) => [sliderOf(zone, 'start').value, sliderOf(zone, 'end').value, sliderOf(zone, 'height').value];

afterEach(cleanup);

describe('a bad box after Remove falls back to its own row', () => {
  it('case 1: saved A,B,C; remove zone 2; empty Height of row 2 -> C at its own height', () => {
    app([A, B, C]);
    remove(2);
    set(1, 'height', '');
    expect(chart()).toBe(said([A, C]));
    expect(sliders(1)).toEqual(['220', '300', '20']);
  });

  it('case 2: saved A,B,C; remove zone 2; row 2 Start = 999 -> C unchanged', () => {
    app([A, B, C]);
    remove(2);
    set(1, 'start', '999');
    expect(chart()).toBe(said([A, C]));
    expect(sliders(1)).toEqual(['220', '300', '20']);
  });

  it('case 3: saved A,C; remove zone 1; empty Start -> C unchanged, no wall', () => {
    app([A, C]);
    remove(1);
    set(0, 'start', '');
    expect(chart()).toBe(said([C]));
    expect(sliders(0)).toEqual(['220', '300', '20']);
  });

  it('case 4: saved A,C; remove zone 1; Height 95 -> C at its own height', () => {
    app([A, C]);
    remove(1);
    set(0, 'height', '95');
    expect(chart()).toBe(said([C]));
    expect(sliders(0)).toEqual(['220', '300', '20']);
  });

  it('case 5: saved A,B; remove zone 1; add a zone; empty its Height -> only B is drawn', () => {
    app([A, B]);
    remove(1);
    add();
    set(1, 'height', '');
    expect(chart()).toBe(said([B]));
    expect(sliders(0)).toEqual(['100', '160', '60']);
  });

  it('remove the first of three: the shifted rows keep their own numbers on a bad box', () => {
    app([A, B, C]);
    remove(1);
    set(0, 'height', '');
    set(1, 'start', '');
    expect(chart()).toBe(said([B, C]));
    expect(sliders(0)).toEqual(['100', '160', '60']);
    expect(sliders(1)).toEqual(['220', '300', '20']);
  });

  it('remove the last of three: the others are unchanged', () => {
    app([A, B, C]);
    remove(3);
    set(1, 'end', '');
    expect(chart()).toBe(said([A, B]));
    expect(sliders(1)).toEqual(['100', '160', '60']);
  });

  it('remove then add: the new row has no base, the old rows keep theirs', () => {
    app([A, B, C]);
    remove(2);
    add();
    set(2, 'start', '');
    set(1, 'height', '');
    expect(chart()).toBe(said([A, C]));
    expect(sliders(1)).toEqual(['220', '300', '20']);
  });

  it('a valid value typed in a row is drawn; a new row fully typed is drawn', () => {
    app([A, B]);
    remove(1);
    add();
    set(1, 'start', '200');
    set(1, 'end', '250');
    set(1, 'height', '33');
    expect(chart()).toBe(said([B, { startAz: 200, endAz: 250, heightDeg: 33 }]));
  });

  it('after Save the row bases are the saved zones', () => {
    app([A, B]);
    remove(1);
    set(0, 'height', '70');
    fireEvent.click(screen.getByRole('button', { name: 'Save horizon' }));
    set(0, 'height', '');
    expect(chart()).toBe(said([{ ...B, heightDeg: 70 }]));
  });
});
