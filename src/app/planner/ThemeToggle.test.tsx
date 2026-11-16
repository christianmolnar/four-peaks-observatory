/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';
import { THEME_KEY, THEME_SCRIPT } from './themeScript';

const html = document.documentElement;

beforeEach(() => {
  html.removeAttribute('data-theme');
  window.localStorage.clear();
});

describe('ThemeToggle', () => {
  it('starts in Day with one 44 px control named "Night mode (red)", moon icon and text', () => {
    render(<ThemeToggle />);
    const b = screen.getByRole('button', { name: 'Night mode (red)' });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.className).toContain('min-h-[44px]');
    expect(b.querySelector('svg')).not.toBeNull();
    expect(html.hasAttribute('data-theme')).toBe(false);
  });

  it('switches to red, remembers it, and back to Day', () => {
    render(<ThemeToggle />);
    const b = screen.getByRole('button', { name: 'Night mode (red)' });
    fireEvent.click(b);
    expect(html.getAttribute('data-theme')).toBe('red');
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('red');
    fireEvent.click(b);
    expect(html.hasAttribute('data-theme')).toBe(false);
    expect(window.localStorage.getItem(THEME_KEY)).toBe('day');
  });

  it('uses its own storage key, not the plan store', () => {
    expect(THEME_KEY).toBe('planner.theme');
  });

  it('restores red from storage on mount', () => {
    window.localStorage.setItem(THEME_KEY, 'red');
    render(<ThemeToggle />);
    expect(html.getAttribute('data-theme')).toBe('red');
    expect(screen.getByRole('button', { name: 'Night mode (red)' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('follows data-theme the head script already set (storage unreadable now)', () => {
    html.setAttribute('data-theme', 'red');
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Night mode (red)' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('works with storage blocked: switches for this visit, throws nothing, is not remembered', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      render(<ThemeToggle />);
      const b = screen.getByRole('button', { name: 'Night mode (red)' });
      fireEvent.click(b);
      expect(html.getAttribute('data-theme')).toBe('red');
      expect(b.getAttribute('aria-pressed')).toBe('true');
      expect(set).toHaveBeenCalled();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('leaves the page Day when the planner closes', () => {
    const { unmount } = render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Night mode (red)' }));
    unmount();
    expect(html.hasAttribute('data-theme')).toBe(false);
  });

  it('is never sent to the account: no network, no store import', () => {
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Night mode (red)' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('draws one hatch pattern per zone style, out of the layout', () => {
    render(<ThemeToggle />);
    const svg = screen.getByTestId('theme-hatches');
    expect(svg.getAttribute('width')).toBe('0');
    expect(svg.getAttribute('class')).toContain('absolute');
    expect([...svg.querySelectorAll('pattern')].map((p) => p.id)).toEqual(['fp-hatch-0', 'fp-hatch-1', 'fp-hatch-2', 'fp-hatch-3']);
  });
});

describe('head script', () => {
  const run = (path: string) => {
    window.history.pushState({}, '', path);
    new Function(THEME_SCRIPT)();
  };

  it('sets data-theme before first paint when red is stored, on /planner only', () => {
    window.localStorage.setItem(THEME_KEY, 'red');
    run('/astrophotography');
    expect(html.hasAttribute('data-theme')).toBe(false);
    run('/planner');
    expect(html.getAttribute('data-theme')).toBe('red');
  });

  it('leaves Day when nothing or "day" is stored', () => {
    run('/planner');
    window.localStorage.setItem(THEME_KEY, 'day');
    run('/planner');
    expect(html.hasAttribute('data-theme')).toBe(false);
  });

  it('does not throw when storage is blocked', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(() => run('/planner')).not.toThrow();
      expect(html.hasAttribute('data-theme')).toBe(false);
    } finally {
      get.mockRestore();
    }
  });
});
