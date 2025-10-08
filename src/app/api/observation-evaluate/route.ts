import { NextResponse } from 'next/server';
import { ObservationRecommendation, ObservationCriteria } from '@/types/observation';
import { calculateSunTimes, calculateObservingWindow, formatTime, calculateMoonData } from '@/lib/astronomical-calculations';
import { fetchClearSkyChartData, analyzeObservingConditions } from '@/lib/clear-sky-parser';
import fs from 'fs';
import path from 'path';

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
    
    // Analyze conditions for the observing window
    const conditions = analyzeObservingConditions(
      chartData, 
      formatTime(observingWindow.start),
      formatTime(observingWindow.end)
    );
    
    // Group consecutive periods of same quality
    const timeWindows = groupConsecutiveConditions(conditions, observingWindow);
    
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

function groupConsecutiveConditions(conditions: any[], observingWindow: any) {
  const windows = [];
  let currentWindow = null;
  
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
      currentWindow.count++;
    }
  }
  
  if (currentWindow) {
    windows.push(currentWindow);
  }
  
  return windows;
}

function determineOverallRating(timeWindows: any[]): 'excellent' | 'good' | 'dubious' | 'poor' {
  if (timeWindows.length === 0) return 'poor';
  
  const excellentHours = timeWindows.filter(w => w.quality === 'excellent').reduce((sum, w) => sum + w.count, 0);
  const goodHours = timeWindows.filter(w => w.quality === 'good').reduce((sum, w) => sum + w.count, 0);
  const totalHours = timeWindows.reduce((sum, w) => sum + w.count, 0);
  
  const goodRatio = (excellentHours + goodHours) / totalHours;
  
  if (excellentHours >= totalHours * 0.6) return 'excellent';
  if (goodRatio >= 0.6) return 'good';
  if (goodRatio >= 0.3) return 'dubious';
  return 'poor';
}

function generateSummary(timeWindows: any[], observingWindow: any, moonData: any): string {
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

function generateWeatherWarnings(conditions: any[], moonData: any): string[] {
  const warnings = [];
  
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
