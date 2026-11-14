import { planTonight, planTrainFor } from '@/planner/plan';
import type { ScoreParts } from '@/planner/plan';
import { starterTargets } from '@/planner/catalog';
import { sampleProfile } from '@/planner/state';
import { addDays, fitReason, nightDateText, nightStatus, peakText, scorePartsText } from './catalogText';

const parts = (over: Partial<ScoreParts>): ScoreParts => {
  const p = { usable: 0, altitude: 0, season: 0, moon: 0, fit: 0, brightness: 0, framing: 0, size: 0, ...over };
  const sum = p.usable + p.altitude + p.season + p.moon + p.fit + p.brightness + p.framing + p.size;
  return { ...p, total: over.total ?? Math.max(0, Math.min(100, Math.round(sum * 10) / 10)) };
};

/** "usable 50, altitude 30, ... = 100": the terms and the figure after the equals sign. */
const read = (text: string) => ({
  terms: [...text.split(' = ')[0].matchAll(/(-?\d+)(?:,|$)/g)].map((m) => Number(m[1])),
  result: text.split(' = ')[1],
});

describe('the score parts add up to the score', () => {
  it('names brightness and framing, and the shown whole numbers sum to the sum', () => {
    const text = scorePartsText(parts({ usable: 50, altitude: 30, brightness: 10, framing: 10 }));
    expect(text).toBe('usable 50, altitude 30, Moon 0, fit 0, brightness 10, framing 10 = 100');
  });

  it('says so when the sum is over 100 and the score is capped', () => {
    const { terms, result } = read(scorePartsText(parts({ usable: 50, altitude: 30, brightness: 10, framing: 10, season: 10 })));
    expect(terms.reduce((a, b) => a + b, 0)).toBe(110);
    expect(result).toBe('110, capped at 100');
  });

  it('a score under 100 is exactly its parts', () => {
    const p = parts({ usable: 31.4, altitude: 12.7, moon: -4.3, brightness: 3.2, framing: -2.9 });
    const { terms, result } = read(scorePartsText(p));
    expect(terms.reduce((a, b) => a + b, 0)).toBe(Math.round(p.total));
    expect(result).toBe(String(Math.round(p.total)));
  });

  it('a sum below 0 is raised to 0 and says so', () => {
    expect(scorePartsText(parts({ usable: 4, altitude: 0, moon: -12, framing: -9 }))).toMatch(/= -17, raised to 0$/);
  });

  it('a target with no clear time scores 0 and says why', () => {
    const p = parts({ usable: 0, altitude: 12, brightness: 4, total: 0 });
    expect(scorePartsText(p)).toMatch(/= 16, but 0 because no time is clear$/);
  });

  it('every entry the real scorer makes: the shown terms sum to the score (or to the capped sum)', () => {
    const profile = sampleProfile();
    const { entries } = planTonight({
      site: { latitude: 33.6, longitude: -111.7 },
      horizon: null,
      minAltitude: 20,
      date: '2026-11-13',
      train: planTrainFor(profile, profile.trains[0]),
      targets: starterTargets,
    });
    expect(entries.length).toBeGreaterThan(10);
    for (const e of entries.filter((x) => x.usableMinutes > 0)) {
      const { terms, result } = read(scorePartsText(e.score));
      const sum = terms.reduce((a, b) => a + b, 0);
      expect(Math.max(0, Math.min(100, sum))).toBe(Math.round(e.score.total));
      expect(result.startsWith(String(sum)) || result === String(Math.round(e.score.total))).toBe(true);
    }
  });
});

describe('dates and small texts', () => {
  it('writes a night as "Sat 21 Nov", in English, with no year', () => {
    expect(nightDateText('2026-11-21')).toBe('Sat 21 Nov');
    expect(nightDateText('2026-12-05')).toBe('Sat 5 Dec');
  });

  it('adds days by the calendar, across a month and a year', () => {
    expect(addDays('2026-11-14', 1)).toBe('2026-11-15');
    expect(addDays('2026-11-14', 7)).toBe('2026-11-21');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('never writes -0°', () => {
    const entry = { peakAltitude: -0.3, peakAzimuth: 90, peakTime: new Date('2026-11-14T08:00:00Z'), usableMinutes: 0 } as Parameters<typeof nightStatus>[0];
    const fmt = (d: Date) => d.toISOString().slice(11, 16);
    expect(nightStatus(entry, 'tonight', fmt)).toContain('peaks at 0° E');
    expect(nightStatus(entry, 'tonight', fmt)).not.toContain('-0');
    expect(peakText(entry, fmt)).toBe('0° E at 08:00');
  });

  it('a round object that fits the long side but not the short one says it is the short side', () => {
    const frame = { long: 29, short: 19 };
    expect(fitReason({ fit: 'too-large', percentOfFrame: 120 }, { major: 23, minor: 23 }, frame)).toBe("Larger than this frame's short side: 23′ vs 19′ (your frame 29′ × 19′)");
    expect(fitReason({ fit: 'too-large', percentOfFrame: 500 }, { major: 160, minor: 40 }, frame)).toBe('Larger than this frame: 160′ × 40′ vs your 29′ × 19′');
  });
});
