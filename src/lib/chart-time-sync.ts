/**
 * Clear Sky Chart Time Synchronization Module
 * 
 * Handles the complex timing logic for Clear Sky Charts:
 * 1. Charts are generated at specific times and represent future forecasts
 * 2. First column represents the hour when the chart was generated
 * 3. Need to map chart columns to actual times based on generation time
 * 4. Handle dynamic observing windows based on current time vs sunset/sunrise
 */

import { LocationConfig } from '@/types/observation';
import { calculateSunTimes, calculateObservingWindow, formatTime } from './astronomical-calculations';

export interface ChartTimeMapping {
  generatedAt: Date;
  firstColumnTime: Date;
  columnHours: Date[];
  chartAgeHours: number;
}

export interface DynamicObservingWindow {
  start: Date;
  end: Date;
  totalHours: number;
  isPartialNight: boolean;
  reason: string;
}

/**
 * Determine when a Clear Sky Chart was generated based on its URL or metadata
 * Clear Sky Charts are typically generated every 3 hours: 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 UTC
 */
export function inferChartGenerationTime(chartUrl: string, currentTime: Date = new Date()): ChartTimeMapping {
  // Clear Sky Charts are generated every 3 hours in UTC
  const generationIntervalHours = 3;
  const currentUTC = new Date(currentTime.getTime());
  
  // Find the most recent generation time (round down to nearest 3-hour mark)
  const utcHours = currentUTC.getUTCHours();
  const lastGenerationHour = Math.floor(utcHours / generationIntervalHours) * generationIntervalHours;
  
  const generatedAt = new Date(currentUTC);
  generatedAt.setUTCHours(lastGenerationHour, 0, 0, 0);
  
  // If we're very close to the generation time (within 15 minutes), use the previous generation
  const timeSinceGeneration = currentTime.getTime() - generatedAt.getTime();
  if (timeSinceGeneration < 15 * 60 * 1000) {
    generatedAt.setUTCHours(lastGenerationHour - generationIntervalHours);
  }
  
  const firstColumnTime = new Date(generatedAt);
  const chartAgeHours = (currentTime.getTime() - generatedAt.getTime()) / (1000 * 60 * 60);
  
  // Generate array of times for each column (48 hours of forecast)
  const columnHours: Date[] = [];
  for (let i = 0; i < 48; i++) {
    const columnTime = new Date(firstColumnTime.getTime() + (i * 60 * 60 * 1000));
    columnHours.push(columnTime);
  }
  
  return {
    generatedAt,
    firstColumnTime,
    columnHours,
    chartAgeHours
  };
}

/**
 * Calculate observing window based on current time and astronomical data
 * Handles three scenarios:
 * 1. Before sunset: Full night ahead (sunset+1hr to sunrise-1hr)
 * 2. After sunset, before sunrise: Rest of current night
 * 3. After sunrise: Next night
 */
export function calculateDynamicObservingWindow(
  currentTime: Date,
  location: LocationConfig,
  startOffset: number = 60,
  endOffset: number = 60
): DynamicObservingWindow {
  const today = new Date(currentTime);
  const tomorrow = new Date(currentTime);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Calculate sun times for today and tomorrow
  const todaySun = calculateSunTimes(today, location);
  const tomorrowSun = calculateSunTimes(tomorrow, location);
  
  // Determine which scenario we're in
  if (currentTime < todaySun.sunset) {
    // Scenario 1: Before sunset - plan for tonight
    const window = calculateObservingWindow(todaySun, startOffset, endOffset);
    return {
      start: window.start,
      end: window.end,
      totalHours: window.totalHours,
      isPartialNight: false,
      reason: `Full night observing window: ${formatTime(window.start)} to ${formatTime(window.end)}`
    };
  } else if (currentTime < todaySun.sunrise) {
    // Scenario 2: After sunset, before sunrise - rest of current night
    const observingStart = new Date(Math.max(currentTime.getTime(), todaySun.sunset.getTime() + startOffset * 60000));
    const observingEnd = new Date(todaySun.sunrise.getTime() - endOffset * 60000);
    
    // Handle case where sunrise is tomorrow
    if (observingEnd < observingStart) {
      observingEnd.setDate(observingEnd.getDate() + 1);
    }
    
    const totalHours = Math.max(0, (observingEnd.getTime() - observingStart.getTime()) / (1000 * 60 * 60));
    
    return {
      start: observingStart,
      end: observingEnd,
      totalHours: Math.round(totalHours * 10) / 10,
      isPartialNight: true,
      reason: `Remaining observing time tonight: ${formatTime(observingStart)} to ${formatTime(observingEnd)}`
    };
  } else {
    // Scenario 3: After sunrise - plan for next night
    const window = calculateObservingWindow(tomorrowSun, startOffset, endOffset);
    return {
      start: window.start,
      end: window.end,
      totalHours: window.totalHours,
      isPartialNight: false,
      reason: `Next night observing window: ${formatTime(window.start)} to ${formatTime(window.end)}`
    };
  }
}

/**
 * Map Clear Sky Chart columns to specific hours for filtering
 * Returns which columns correspond to the observing window
 */
export function mapObservingWindowToChartColumns(
  observingWindow: DynamicObservingWindow,
  chartTiming: ChartTimeMapping
): { columnIndices: number[]; hours: Date[] } {
  const columnIndices: number[] = [];
  const hours: Date[] = [];
  
  chartTiming.columnHours.forEach((columnTime, index) => {
    // Check if this column's hour falls within our observing window
    if (columnTime >= observingWindow.start && columnTime <= observingWindow.end) {
      columnIndices.push(index);
      hours.push(columnTime);
    }
  });
  
  return { columnIndices, hours };
}

/**
 * Get user-friendly description of the forecast timing
 */
export function getTimingDescription(
  observingWindow: DynamicObservingWindow,
  chartTiming: ChartTimeMapping,
  relevantColumns: number
): string {
  const currentTime = new Date();
  const hoursUntilStart = (observingWindow.start.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
  const chartAge = Math.round(chartTiming.chartAgeHours * 10) / 10;
  
  let description = observingWindow.reason;
  
  if (hoursUntilStart > 0) {
    description += ` (starts in ${Math.round(hoursUntilStart * 10) / 10} hours)`;
  } else if (hoursUntilStart > -1) {
    description += ` (starting now)`;
  }
  
  description += `. Forecast based on ${relevantColumns} hours of Clear Sky Chart data`;
  
  if (chartAge > 6) {
    description += ` (chart is ${chartAge} hours old - may be less accurate)`;
  }
  
  return description;
}

/**
 * Check if we have enough chart data to cover the observing window
 */
export function validateChartCoverage(
  observingWindow: DynamicObservingWindow,
  chartTiming: ChartTimeMapping
): { adequate: boolean; missingHours: number; warning?: string } {
  const windowEnd = observingWindow.end;
  const chartEnd = chartTiming.columnHours[chartTiming.columnHours.length - 1];
  
  if (windowEnd <= chartEnd) {
    return { adequate: true, missingHours: 0 };
  }
  
  const missingHours = (windowEnd.getTime() - chartEnd.getTime()) / (1000 * 60 * 60);
  const warning = `Chart only covers ${Math.round((chartEnd.getTime() - observingWindow.start.getTime()) / (1000 * 60 * 60) * 10) / 10} of ${observingWindow.totalHours} observing hours`;
  
  return {
    adequate: false,
    missingHours: Math.round(missingHours * 10) / 10,
    warning
  };
}
