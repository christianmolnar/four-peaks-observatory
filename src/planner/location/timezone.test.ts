import { isKnownTimeZone, timeZoneAt } from './timezone'

const CITIES: [string, number, number, string][] = [
  ['Phoenix', 33.4484, -112.074, 'America/Phoenix'],
  ['New York', 40.7128, -74.006, 'America/New_York'],
  ['Denver', 39.7392, -104.9903, 'America/Denver'],
  ['Los Angeles', 34.0522, -118.2437, 'America/Los_Angeles'],
  ['London', 51.5074, -0.1278, 'Europe/London'],
  ['Mumbai', 19.076, 72.8777, 'Asia/Kolkata'],
  ['Kathmandu', 27.7172, 85.324, 'Asia/Kathmandu'],
  ['Adelaide', -34.9285, 138.6007, 'Australia/Adelaide'],
  ['Tokyo', 35.6762, 139.6503, 'Asia/Tokyo'],
  ['Sao Paulo', -23.5505, -46.6333, 'America/Sao_Paulo'],
]

/** UTC offset in minutes of a zone at an instant, read through Intl. */
function offsetMinutes(zone: string, iso: string): number {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(d)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - Math.floor(d.getTime() / 60000) * 60000) / 60000
}

describe('timeZoneAt (tz-lookup)', () => {
  it.each(CITIES)('%s', (_n, lat, lon, zone) => {
    expect(timeZoneAt(lat, lon)).toBe(zone)
    expect(isKnownTimeZone(zone)).toBe(true)
  })

  it('half-hour and 45-minute zones really are offset that way', () => {
    expect(offsetMinutes(timeZoneAt(19.076, 72.8777), '2026-01-15T12:00:00Z')).toBe(330)
    expect(offsetMinutes(timeZoneAt(27.7172, 85.324), '2026-01-15T12:00:00Z')).toBe(345)
    expect(offsetMinutes(timeZoneAt(-34.9285, 138.6007), '2026-07-15T12:00:00Z')).toBe(570)
  })

  it('daylight saving: Phoenix never changes, New York and the southern Adelaide do, in opposite seasons', () => {
    const phx = timeZoneAt(33.4484, -112.074)
    expect(offsetMinutes(phx, '2026-01-15T12:00:00Z')).toBe(-420)
    expect(offsetMinutes(phx, '2026-07-15T12:00:00Z')).toBe(-420)
    const ny = timeZoneAt(40.7128, -74.006)
    expect(offsetMinutes(ny, '2026-01-15T12:00:00Z')).toBe(-300)
    expect(offsetMinutes(ny, '2026-07-15T12:00:00Z')).toBe(-240)
    const ade = timeZoneAt(-34.9285, 138.6007)
    expect(offsetMinutes(ade, '2026-01-15T12:00:00Z')).toBe(630)
    expect(offsetMinutes(ade, '2026-07-15T12:00:00Z')).toBe(570)
  })

  it('bad coordinates throw instead of returning a guess', () => {
    expect(() => timeZoneAt(91, 0)).toThrow()
    expect(() => timeZoneAt(NaN, 0)).toThrow()
  })

  it('isKnownTimeZone refuses junk', () => {
    for (const bad of ['Mars/Olympus', '', 5, null, 'x'.repeat(100)]) expect(isKnownTimeZone(bad)).toBe(false)
  })
})
