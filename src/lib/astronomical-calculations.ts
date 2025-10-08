// Astronomical calculation utilities
import { LocationConfig } from '@/types/observation';

interface SunTimes {
  sunset: Date;
  sunrise: Date;
  civilTwilightEvening: Date;
  civilTwilightMorning: Date;
}

interface MoonData {
  phase: number; // 0-1
  rise: Date | null;
  set: Date | null;
  altitude: number;
  illumination: number;
}

/**
 * Calculate sunrise and sunset times for a given date and location
 * Using simplified astronomical formulas - for production, consider using a more robust library
 */
export function calculateSunTimes(date: Date, location: LocationConfig): SunTimes {
  const lat = location.latitude * Math.PI / 180;
  const lon = location.longitude * Math.PI / 180;
  
  // Day of year
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  // Solar declination
  const declination = 23.45 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
  
  // Hour angle for sunrise/sunset
  const hourAngle = Math.acos(-Math.tan(lat) * Math.tan(declination));
  
  // Hour angle for civil twilight (sun 6° below horizon)
  const civilTwilightAngle = Math.acos(-Math.tan(lat) * Math.tan(declination - 6 * Math.PI / 180));
  
  // Convert to local time
  const timeCorrection = 4 * (lon * 180 / Math.PI - 15 * getTimezoneOffset(location.timezone)) + getEquationOfTime(dayOfYear);
  
  const sunriseTime = 12 - hourAngle * 12 / Math.PI - timeCorrection / 60;
  const sunsetTime = 12 + hourAngle * 12 / Math.PI - timeCorrection / 60;
  const civilEveningTime = 12 + civilTwilightAngle * 12 / Math.PI - timeCorrection / 60;
  const civilMorningTime = 12 - civilTwilightAngle * 12 / Math.PI - timeCorrection / 60;
  
  return {
    sunrise: new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(sunriseTime), Math.round((sunriseTime % 1) * 60)),
    sunset: new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(sunsetTime), Math.round((sunsetTime % 1) * 60)),
    civilTwilightEvening: new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(civilEveningTime), Math.round((civilEveningTime % 1) * 60)),
    civilTwilightMorning: new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(civilMorningTime), Math.round((civilMorningTime % 1) * 60))
  };
}

/**
 * Calculate observing window based on sunset/sunrise and user offsets
 */
export function calculateObservingWindow(sunTimes: SunTimes, startOffset: number, endOffset: number) {
  const observingStart = new Date(sunTimes.sunset.getTime() + startOffset * 60000);
  const observingEnd = new Date(sunTimes.sunrise.getTime() - endOffset * 60000);
  
  // Handle next day sunrise
  if (observingEnd < observingStart) {
    observingEnd.setDate(observingEnd.getDate() + 1);
  }
  
  const totalHours = (observingEnd.getTime() - observingStart.getTime()) / (1000 * 60 * 60);
  
  return {
    start: observingStart,
    end: observingEnd,
    totalHours: Math.round(totalHours * 10) / 10
  };
}

/**
 * Get timezone offset in hours
 */
function getTimezoneOffset(timezone: string): number {
  // Simplified - in production, use proper timezone library
  const offsetMap: { [key: string]: number } = {
    'America/Los_Angeles': -8, // PST
    'America/Denver': -7,      // MST
    'America/Chicago': -6,     // CST
    'America/New_York': -5,    // EST
    // Add more as needed
  };
  return offsetMap[timezone] || -8;
}

/**
 * Equation of time correction (simplified)
 */
function getEquationOfTime(dayOfYear: number): number {
  const B = 2 * Math.PI * (dayOfYear - 81) / 365;
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

/**
 * Format time for display
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    weekday: 'long',
    month: 'long', 
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Calculate moon data using simplified formulas
 * For production, consider using a more accurate ephemeris library
 */
export async function calculateMoonData(date: Date, location: LocationConfig): Promise<MoonData> {
  // This is a simplified implementation
  // In production, you'd want to use USNO API or similar
  
  const daysSince2000 = (date.getTime() - new Date(2000, 0, 1).getTime()) / (1000 * 60 * 60 * 24);
  
  // Simplified moon phase calculation
  const phase = (daysSince2000 % 29.53) / 29.53;
  
  // Simplified moon rise/set (would need proper ephemeris data)
  const moonRise = new Date(date);
  moonRise.setHours(18 + Math.sin(phase * 2 * Math.PI) * 6);
  
  const moonSet = new Date(date);
  moonSet.setHours(6 + Math.sin(phase * 2 * Math.PI) * 6);
  moonSet.setDate(moonSet.getDate() + 1);
  
  return {
    phase,
    rise: moonRise,
    set: moonSet,
    altitude: 45, // Simplified
    illumination: Math.abs(Math.cos(phase * Math.PI))
  };
}
