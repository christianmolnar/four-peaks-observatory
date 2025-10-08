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
 * Calculate moon data using USNO API for accurate astronomical data
 * Falls back to simplified calculation if API fails
 */
export async function calculateMoonData(date: Date, location: LocationConfig): Promise<MoonData> {
  try {
    // Format date for USNO API (YYYY-MM-DD)
    const formattedDate = date.toISOString().split('T')[0];
    
    // USNO API endpoint for complete sun and moon data
    const usnoUrl = `https://aa.usno.navy.mil/api/rstt/oneday?date=${formattedDate}&coords=${location.latitude},${location.longitude}&tz=${getTimezoneOffset(location.timezone)}`;
    
    const response = await fetch(usnoUrl);
    if (!response.ok) {
      throw new Error(`USNO API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`USNO API error: ${data.error}`);
    }
    
    // Extract moon data from USNO response
    const moonData = data.properties.data;
    const moonPhases = data.properties.data.moondata || [];
    
    // Find moonrise and moonset times
    let moonrise: Date | null = null;
    let moonset: Date | null = null;
    
    moonPhases.forEach((event: { phen: string; time: string | null }) => {
      if (event.phen === 'Rise' && event.time !== null) {
        moonrise = parseUSNOTime(date, event.time);
      } else if (event.phen === 'Set' && event.time !== null) {
        moonset = parseUSNOTime(date, event.time);
      }
    });
    
    // Get current moon phase and illumination
    const illuminationStr = moonData.fracillum || '0%';
    const illumination = parseFloat(illuminationStr.replace('%', '')) / 100;
    const currentPhase = moonData.curphase || 'Unknown';
    
    // Convert phase name to numeric value
    const phaseValue = convertPhaseNameToValue(currentPhase);
    
    return {
      phase: phaseValue,
      rise: moonrise,
      set: moonset,
      altitude: 45, // Would need additional calculation for current altitude
      illumination: illumination
    };
  } catch (error) {
    console.warn('Failed to fetch USNO moon data, falling back to simplified calculation:', error);
    return calculateSimplifiedMoonData(date, location);
  }
}

/**
 * Fallback simplified moon data calculation
 */
function calculateSimplifiedMoonData(date: Date, _location: LocationConfig): MoonData {
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

/**
 * Helper functions for USNO API integration
 */
function parseUSNOTime(date: Date, timeString: string): Date {
  // Parse USNO time format (HH:MM or HH:MM:SS)
  const [hours, minutes, seconds = '0'] = timeString.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, parseInt(seconds.toString()));
  return result;
}

function convertPhaseNameToValue(phaseName: string): number {
  const phaseMap: { [key: string]: number } = {
    'New Moon': 0,
    'Waxing Crescent': 0.125,
    'First Quarter': 0.25,
    'Waxing Gibbous': 0.375,
    'Full Moon': 0.5,
    'Waning Gibbous': 0.625,
    'Last Quarter': 0.75,
    'Waning Crescent': 0.875
  };
  return phaseMap[phaseName] || 0;
}
