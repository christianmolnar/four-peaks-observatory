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
      fields={{ start: '120', end: '320', height: '42' }}
      errors={{}}
      preview={{ startAz: 120, endAz: 320, heightDeg: 42 }}
      sliderValues={{ start: 120, end: 320, height: 42 }}
      dirty={false}
      saved={false}
      onField={noop}
      onSave={noop}
      onDiscard={noop}
      onUseSample={noop}
      onClear={noop}
      onAdd={noop}
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
