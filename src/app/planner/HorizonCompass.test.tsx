/**
 * @jest-environment jsdom
 */
import { render, cleanup } from '@testing-library/react';
import HorizonEditor from './HorizonEditor';

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

const noop = () => undefined;
const editor = () =>
  render(
    <HorizonEditor
      siteName="Test"
      fields={[{ start: '120', end: '320', height: '42' }]}
      errors={[{}]}
      previews={[{ startAz: 120, endAz: 320, heightDeg: 42 }]}
      sliderValues={[{ start: 120, end: 320, height: 42 }]}
      dirty={false}
      saved={false}
      onField={noop}
      onSave={noop}
      onDiscard={noop}
      onUseSample={noop}
      onClear={noop}
      onAdd={noop}
      onRemove={noop}
    />,
  );

describe('the horizon compass text is at least 12 px on screen at any width', () => {
  it.each([260, 270, 300, 340, 384])('drawn %i px wide', (width) => {
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width, height: width, top: 0, left: 0, right: width, bottom: width, x: 0, y: 0, toJSON: () => ({}) });
    const { container } = editor();
    const svg = container.querySelector('svg[role=img]') as SVGSVGElement;
    const scale = width / svg.viewBox.baseVal.width;
    const texts = [...svg.querySelectorAll('text')];
    expect(texts.map((t) => t.textContent)).toEqual(['N', 'E', 'S', 'W', '30°', '60°']);
    for (const t of texts) expect(Number(t.getAttribute('font-size')) * scale).toBeGreaterThanOrEqual(12);
  });

  it('every label stays inside the drawing', () => {
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 250, height: 250, top: 0, left: 0, right: 250, bottom: 250, x: 0, y: 0, toJSON: () => ({}) });
    const { container } = editor();
    const size = 300;
    for (const t of container.querySelectorAll('svg[role=img] text')) {
      const f = Number(t.getAttribute('font-size'));
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      expect(x - f).toBeGreaterThanOrEqual(0);
      expect(x + f).toBeLessThanOrEqual(size);
      expect(y - f / 2).toBeGreaterThanOrEqual(0);
      expect(y + f / 2).toBeLessThanOrEqual(size);
    }
  });
});

describe('the compass draws every zone', () => {
  const ZONES = [
    { startAz: 120, endAz: 320, heightDeg: 42 },
    { startAz: 20, endAz: 60, heightDeg: 10 },
    { startAz: 70, endAz: 100, heightDeg: 25 },
    { startAz: 330, endAz: 10, heightDeg: 55 },
  ];
  const withZones = (n: number) =>
    render(
      <HorizonEditor
        siteName="Test"
        fields={ZONES.slice(0, n).map((z) => ({ start: String(z.startAz), end: String(z.endAz), height: String(z.heightDeg) }))}
        errors={ZONES.slice(0, n).map(() => ({}))}
        previews={ZONES.slice(0, n)}
        sliderValues={ZONES.slice(0, n).map((z) => ({ start: z.startAz, end: z.endAz, height: z.heightDeg }))}
        dirty={false}
        saved={false}
        onField={noop}
        onSave={noop}
        onDiscard={noop}
        onUseSample={noop}
        onClear={noop}
        onAdd={noop}
        onRemove={noop}
      />,
    );

  it.each([1, 2, 3, 4])('%i zone(s): one sector each, each with its own path, and a row per zone', (n) => {
    const { container } = withZones(n);
    const sectors = container.querySelectorAll('svg[role=img] path');
    expect(sectors).toHaveLength(n);
    expect(new Set([...sectors].map((p) => p.getAttribute('d'))).size).toBe(n);
    expect(container.querySelectorAll('[role=group]')).toHaveLength(n);
    expect(container.querySelector('svg desc')?.textContent).toContain(n === 1 ? 'Blocked from 120 deg' : `${n} blocked zones`);
  });

  it('a new row with a message is not drawn', () => {
    const { container } = render(
      <HorizonEditor
        siteName="Test"
        fields={[{ start: '120', end: '320', height: '42' }, { start: '', end: '', height: '' }]}
        errors={[{}, { start: 'Enter a number from 0 to 359.' }]}
        previews={[ZONES[0], null]}
        sliderValues={[{ start: 120, end: 320, height: 42 }, { start: 0, end: 0, height: 0 }]}
        dirty
        saved={false}
        onField={noop}
        onSave={noop}
        onDiscard={noop}
        onUseSample={noop}
        onClear={noop}
        onAdd={noop}
        onRemove={noop}
      />,
    );
    expect(container.querySelectorAll('svg[role=img] path')).toHaveLength(1);
  });
});
