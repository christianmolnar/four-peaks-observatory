import { NextResponse } from 'next/server';
import { ObservationRecommendation, ObservationCriteria } from '@/types/observation';
import { calculateSunTimes, calculateObservingWindow, formatTime, calculateMoonData } from '@/lib/astronomical-calculations';
import { fetchClearSkyChartData } from '@/lib/clear-sky-parser';
import { evaluateObservingCondition, convertLegacyCondition } from '@/lib/observation-evaluator';
import fs from 'fs';
import path from 'path';

interface TimeWindow {
  start: string;
  end: string;
  quality: "excellent" | "good" | "dubious" | "poor";
  reason: string;
  count?: number;
}

interface ObservingWindowData {
  start: Date;
  end: Date;
  totalHours: number;
}

interface MoonData {
  phase: number;
  rise: Date | null;
  set: Date | null;
  altitude: number;
  illumination: number;
}

interface ConditionData {
  time: string;
  quality: "excellent" | "good" | "dubious" | "poor";
  reason: string;
  cloudCover: number;
  transparency: number;
  seeingRating: number;
}

export async function GET() {
  try {
    // Load user configuration
    const configPath = path.join(process.cwd(), 'src/config/observation-criteria.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const criteria: ObservationCriteria = JSON.parse(configData);
    
    const today = new Date();
    
    // Calculate sun times for the location
    const sunTimes = calculateSunTimes(today, criteria.location);
    
    // Calculate observing window based on user preferences
    const observingWindow = calculateObservingWindow(
      sunTimes, 
      criteria.observingWindow.startOffset, 
      criteria.observingWindow.endOffset
    );
    
    // Get moon data
    const moonData = await calculateMoonData(today, criteria.location);
    
    // Fetch Clear Sky Chart data
    const chartData = await fetchClearSkyChartData(criteria.location.clearSkyChartUrl);
    
    // Convert legacy format and analyze conditions for the observing window
    const conditions = chartData.forecast.map(condition => {
      const newFormat = convertLegacyCondition(condition);
      const evaluation = evaluateObservingCondition(newFormat);
      
      return {
        time: condition.time,
        quality: evaluation.overall,
        reason: evaluation.reason,
        cloudCover: condition.cloudCover,
        transparency: condition.transparency,
        seeingRating: condition.seeingRating
      };
    });

    const filteredConditions = conditions.filter(condition => {
      // Filter to observing window
      const [hours] = condition.time.split(':').map(Number);
      
      // Create condition time for today
      const conditionTimeToday = new Date(today);
      conditionTimeToday.setHours(hours, 0, 0, 0);
      
      // Create condition time for tomorrow (in case observing window spans midnight)
      const conditionTimeTomorrow = new Date(today);
      conditionTimeTomorrow.setDate(conditionTimeTomorrow.getDate() + 1);
      conditionTimeTomorrow.setHours(hours, 0, 0, 0);
      
      // For edge conditions, we need to be more flexible with partial hours
      // If the condition hour overlaps with the observing window, include it
      const conditionEndToday = new Date(conditionTimeToday);
      conditionEndToday.setHours(hours + 1, 0, 0, 0);
      
      const conditionEndTomorrow = new Date(conditionTimeTomorrow);
      conditionEndTomorrow.setHours(hours + 1, 0, 0, 0);
      
      // Check for overlap with observing window
      const overlapToday = (conditionTimeToday < observingWindow.end) && (conditionEndToday > observingWindow.start);
      const overlapTomorrow = (conditionTimeTomorrow < observingWindow.end) && (conditionEndTomorrow > observingWindow.start);
      
      return overlapToday || overlapTomorrow;
    });
    
    // Group consecutive periods of same quality
    const timeWindows = groupConsecutiveConditions(filteredConditions, observingWindow);
    
    // Determine overall rating
    const overallRating = determineOverallRating(timeWindows);
    
    // Generate summary
    const summary = generateSummary(timeWindows, observingWindow, moonData);
    
    const recommendation: ObservationRecommendation = {
      overall: overallRating,
      timeWindows: timeWindows.map(window => ({
        start: window.start,
        end: window.end,
        quality: window.quality,
        reason: window.reason
      })),
      summary,
      details: {
        cloudCover: `Varies throughout night - see time windows for details`,
        transparency: `Based on Clear Sky Chart analysis`,
        seeing: `Ranges from ${Math.min(...conditions.map(c => c.seeingRating))}/5 to ${Math.max(...conditions.map(c => c.seeingRating))}/5`,
        moonImpact: `${Math.round(moonData.illumination * 100)}% illuminated, rises at ${moonData.rise ? formatTime(moonData.rise) : 'N/A'}`,
        weatherWarnings: generateWeatherWarnings(conditions, moonData)
      },
      aiReasoning: `Analysis based on Clear Sky Chart data for ${criteria.location.name}. Observing window: ${formatTime(observingWindow.start)} to ${formatTime(observingWindow.end)} (${observingWindow.totalHours} hours total). Conditions vary throughout the night with ${timeWindows.length} distinct periods.`
    };

    return NextResponse.json({
      success: true,
      recommendation,
      timestamp: new Date().toISOString(),
      location: criteria.location.name,
      observingWindow: {
        start: formatTime(observingWindow.start),
        end: formatTime(observingWindow.end),
        totalHours: observingWindow.totalHours
      },
      sunTimes: {
        sunset: formatTime(sunTimes.sunset),
        sunrise: formatTime(sunTimes.sunrise)
      }
    });
  } catch (error) {
    console.error('Error evaluating observation conditions:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to evaluate observation conditions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function groupConsecutiveConditions(conditions: ConditionData[], _observingWindow: ObservingWindowData): TimeWindow[] {
  const windows: TimeWindow[] = [];
  let currentWindow: TimeWindow | null = null;
  
  for (const condition of conditions) {
    if (!currentWindow || currentWindow.quality !== condition.quality) {
      if (currentWindow) {
        windows.push(currentWindow);
      }
      currentWindow = {
        start: condition.time,
        end: condition.time,
        quality: condition.quality,
        reason: condition.reason,
        count: 1
      };
    } else {
      currentWindow.end = condition.time;
      currentWindow.count = (currentWindow.count || 0) + 1;
    }
  }
  
  if (currentWindow) {
    windows.push(currentWindow);
  }
  
  return windows;
}

function determineOverallRating(timeWindows: TimeWindow[]): 'excellent' | 'good' | 'dubious' | 'poor' {
  if (timeWindows.length === 0) return 'poor';
  
  const excellentHours = timeWindows.filter(w => w.quality === 'excellent').reduce((sum, w) => sum + (w.count || 1), 0);
  const goodHours = timeWindows.filter(w => w.quality === 'good').reduce((sum, w) => sum + (w.count || 1), 0);
  const totalHours = timeWindows.reduce((sum, w) => sum + (w.count || 1), 0);
  
  const goodRatio = (excellentHours + goodHours) / totalHours;
  
  if (excellentHours >= totalHours * 0.6) return 'excellent';
  if (goodRatio >= 0.6) return 'good';
  if (goodRatio >= 0.3) return 'dubious';
  return 'poor';
}

function generateSummary(timeWindows: TimeWindow[], observingWindow: ObservingWindowData, moonData: MoonData): string {
  const totalHours = observingWindow.totalHours;
  const bestWindow = timeWindows.find(w => w.quality === 'excellent') || timeWindows.find(w => w.quality === 'good');
  
  if (!bestWindow) {
    return `Poor observing conditions throughout the ${totalHours}-hour window. Not recommended for observation tonight.`;
  }
  
  const moonWarning = moonData.illumination > 0.7 ? ` Moon is ${Math.round(moonData.illumination * 100)}% illuminated and may impact deep sky observation.` : '';
  
  if (timeWindows.length === 1) {
    return `${capitalizeFirst(bestWindow.quality)} conditions throughout the ${totalHours}-hour observing window.${moonWarning}`;
  } else {
    return `Mixed conditions: ${bestWindow.quality} observing from ${bestWindow.start} to ${bestWindow.end}, then conditions change. Total observing window: ${totalHours} hours.${moonWarning}`;
  }
}

function generateWeatherWarnings(conditions: ConditionData[], moonData: MoonData): string[] {
  const warnings: string[] = [];
  
  const poorPeriods = conditions.filter(c => c.quality === 'poor');
  if (poorPeriods.length > 0) {
    warnings.push(`Poor conditions expected during ${poorPeriods.length} hour(s) of the night`);
  }
  
  const overcastPeriods = conditions.filter(c => c.cloudCover > 75);
  if (overcastPeriods.length > 0) {
    warnings.push(`Overcast conditions during ${overcastPeriods.length} hour(s) - no observation possible`);
  }
  
  if (moonData.illumination > 0.8) {
    warnings.push(`Bright moon (${Math.round(moonData.illumination * 100)}% illuminated) will wash out faint deep sky objects`);
  }
  
  return warnings;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
