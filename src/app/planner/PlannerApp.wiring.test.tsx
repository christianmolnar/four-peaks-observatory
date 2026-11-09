/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultDateForProfile, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// 2026-12-20 05:00 UTC = 22:00 on Dec 19 in Phoenix, already 15:00 on Dec 20 in Sydney.
const NOW = Date.UTC(2026, 11, 20, 5, 0);
const PHOENIX_OFFSET_MIN = 420;

const sydney = () => {
  const p = sampleProfile();
  return {
    ...p,
    sites: [{ ...p.sites[0], id: 'syd', name: 'Sydney', latitude: -33.87, longitude: 151.2, timeZone: 'Australia/Sydney' }],
    plans: p.plans.map((pl) => ({ ...pl, siteId: 'syd' })),
  };
};
const jsonFile = (p: unknown) => new File([JSON.stringify(p)], 'profile.json', { type: 'application/json' });
const date = () => (screen.getByLabelText('Evening of') as HTMLInputElement).value;

/** Fake only the clock; timers stay real so userEvent and React keep working. */
function phoenixClock() {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'queueMicrotask', 'nextTick', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(PHOENIX_OFFSET_MIN);
}

beforeEach(() => {
  window.localStorage.clear();
  // jsdom has no Blob.text
  if (!Blob.prototype.text) {
    Blob.prototype.text = function (this: Blob) {
      return new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsText(this);
      });
    };
  }
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('default date', () => {
  it('comes from the profile site, not the browser: Sydney site, Phoenix browser', async () => {
    phoenixClock();
    render(<PlannerApp initialProfile={sydney()} />);
    await waitFor(() => expect(date()).toBe('2026-12-20'));
  });

  it('the same clock at a Phoenix site gives Dec 19', async () => {
    phoenixClock();
    render(<PlannerApp initialProfile={sampleProfile()} />);
    await waitFor(() => expect(date()).toBe('2026-12-19'));
  });

  it('uses the browser longitude only when the profile has no site', () => {
    phoenixClock();
    const empty = { ...sampleProfile(), sites: [] };
    // Phoenix browser (UTC-7 = -105 deg): 22:00 Dec 19 local, so Dec 19; a site at +151 deg would say Dec 20.
    expect(defaultDateForProfile(new Date(NOW), empty)).toBe('2026-12-19');
    expect(defaultDateForProfile(new Date(NOW), sydney())).toBe('2026-12-20');
  });

  it('importing a profile refreshes the date from the new profile\'s site', async () => {
    phoenixClock();
    render(<PlannerApp initialProfile={sampleProfile()} />);
    await waitFor(() => expect(date()).toBe('2026-12-19'));
    const u = userEvent.setup();
    await u.upload(screen.getByLabelText('Import profile (JSON)'), jsonFile(sydney()));
    await waitFor(() => expect(date()).toBe('2026-12-20'));
    expect(screen.getByRole('status').textContent).toMatch(/Imported profile\.json/);
  });
});

describe('storage that cannot be read or written', () => {
  it('loading with storage blocked shows the sample and a plain message, not a crash', async () => {
    jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    render(<PlannerApp />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/browser storage is blocked or unavailable/));
    expect(screen.getByTestId('target-table')).toBeTruthy();
    expect((screen.getByRole('spinbutton', { name: /^Start azimuth/ }) as HTMLInputElement).value).toBe('120');
  });

  it('importing with storage that cannot be written still loads the profile and says it is not saved', async () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const u = userEvent.setup();
    await u.upload(screen.getByLabelText('Import profile (JSON)'), jsonFile(sydney()));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Imported profile\.json\. Not saved, so it is lost on reload: denied/));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Site').textContent).toContain('Sydney');
  });

  it('a file over the size limit is refused from its size, without being read', async () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    const big = jsonFile(sydney());
    Object.defineProperty(big, 'size', { value: 500 * 1024 * 1024 });
    const text = jest.spyOn(big, 'text');
    const u = userEvent.setup();
    await u.upload(screen.getByLabelText('Import profile (JSON)'), big);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/not a planner profile\. The file is too large/));
    expect(text).not.toHaveBeenCalled();
  });

  it('ticking captured with storage that cannot be written says the tick is not saved', async () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const u = userEvent.setup();
    await u.click(screen.getAllByRole('checkbox', { name: /^Captured:/ })[0]);
    expect(screen.getByRole('status').textContent).toMatch(/Not saved, so the tick is lost on reload: denied/);
  });
});

describe('CSV export', () => {
  it('writes times through formatCsvTime (date, 24 h time and zone)', async () => {
    let blob: Blob | undefined;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => {
      blob = b;
      return 'blob:test';
    };
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(blob).toBeDefined();
    const text = await (blob as Blob).text();
    expect(text).toMatch(/\d{4}-\d\d-\d\d \d\d:\d\d \S+/);
  });
});
