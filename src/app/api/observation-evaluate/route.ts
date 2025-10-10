import { NextResponse } from 'next/server';
import { ObservationRecommendation, ObservationCriteria } from '@/types/observation';
import { calculateSunTimes, calculateObservingWindow, formatTime, calculateMoonData } from '@/lib/astronomical-calculations';
import { fetchClearSkyChartData } from '@/lib/clear-sky-parser';
import { evaluateObservingCondition, convertLegacyCondition } from '@/lib/observation-evaluator';
import { getAIObservingRecommendation, formatAIRecommendation } from '@/lib/ai-recommendations';
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
    const timeWindows = groupConsecutiveConditions(filteredConditions);
    
    // Determine overall rating
    const overallRating = determineOverallRating(timeWindows);
    
    // Generate summary
    const summary = generateSummary(timeWindows, observingWindow, moonData);
    
    // Get AI-powered recommendation (fallback to rule-based if AI unavailable)
    let aiRecommendation;
    try {
      console.log('[API] Requesting AI recommendation...');
      aiRecommendation = await getAIObservingRecommendation(
        chartData.forecast,
        criteria,
        moonData,
        {
          start: formatTime(observingWindow.start),
          end: formatTime(observingWindow.end),
          totalHours: observingWindow.totalHours
        }
      );
      console.log(`[API] AI recommendation received: ${aiRecommendation.overall} (${Math.round(aiRecommendation.confidence * 100)}% confidence)`);
    } catch (error) {
      console.error('[API] AI recommendation failed:', error);
      aiRecommendation = null;
    }
    
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
      aiReasoning: aiRecommendation ? 
        formatAIRecommendation(aiRecommendation) : 
        `Analysis based on Clear Sky Chart data for ${criteria.location.name}. Observing window: ${formatTime(observingWindow.start)} to ${formatTime(observingWindow.end)} (${observingWindow.totalHours} hours total). Conditions vary throughout the night with ${timeWindows.length} distinct periods.`,
      aiConfidence: aiRecommendation?.confidence,
      aiSuggestions: aiRecommendation ? {
        bestTimeWindows: aiRecommendation.bestTimeWindows,
        warnings: aiRecommendation.warnings,
        opportunities: aiRecommendation.opportunities
      } : undefined
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

function groupConsecutiveConditions(conditions: ConditionData[]): TimeWindow[] {
  // Sort conditions for nighttime observing chronology
  // Evening hours (18, 19, 20, 21, 22, 23) come before early morning hours (0, 1, 2, 3, 4, 5)
  conditions.sort((a, b) => {
    const hourA = parseInt(a.time.split(':')[0]);
    const hourB = parseInt(b.time.split(':')[0]);
    
    // Convert hours to observing sequence order
    // Evening hours (18-23) get priority, then early morning hours (0-11)
    const getObservingOrder = (hour: number) => {
      if (hour >= 18) return hour - 18; // 18->0, 19->1, 20->2, 21->3, 22->4, 23->5
      if (hour <= 11) return hour + 6;  // 0->6, 1->7, 2->8, 3->9, 4->10, 5->11
      return hour + 12; // Afternoon hours (12-17) go last: 12->24, 13->25, etc.
    };
    
    return getObservingOrder(hourA) - getObservingOrder(hourB);
  });

  const windows: TimeWindow[] = [];
  let currentWindow: TimeWindow | null = null;
  
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    
    // Start new window if:
    // 1. No current window
    // 2. Quality changes
    // 3. Time gap detected (more than 1 hour difference in sequence)
    const shouldStartNewWindow = !currentWindow || 
      currentWindow.quality !== condition.quality ||
      (currentWindow && isTimeGap(currentWindow, condition, conditions, i));
    
    if (shouldStartNewWindow) {
      if (currentWindow) {
        // Enhance window with duration and quality score
        enhanceTimeWindow(currentWindow);
        windows.push(currentWindow);
      }
      
      currentWindow = {
        start: condition.time,
        end: condition.time, // Will be updated as window grows
        quality: condition.quality,
        reason: generateWindowReason(condition, 1),
        count: 1
      };
    } else if (currentWindow) {
      // Extend the current window (only if currentWindow exists)
      currentWindow.end = condition.time;
      currentWindow.count = (currentWindow.count || 0) + 1;
      currentWindow.reason = generateWindowReason(condition, currentWindow.count);
    }
  }
  
  if (currentWindow) {
    enhanceTimeWindow(currentWindow);
    windows.push(currentWindow);
  }
  
  // Filter out single-hour windows for very poor conditions (too brief for practical observing)
  const filteredWindows = windows.filter(window => {
    if (window.quality === 'poor' && (window.count || 1) === 1) {
      return false; // Remove single-hour poor windows
    }
    return true;
  });
  
  // Merge adjacent windows with similar quality levels
  return mergeAdjacentWindows(filteredWindows);
}

/**
 * Check if there's a time gap between current window and next condition
 */
function isTimeGap(currentWindow: TimeWindow, condition: ConditionData, allConditions: ConditionData[], currentIndex: number): boolean {
  if (currentIndex === 0) return false;
  
  const prevCondition = allConditions[currentIndex - 1];
  const prevHour = parseInt(prevCondition.time.split(':')[0]);
  const currentHour = parseInt(condition.time.split(':')[0]);
  
  // Check for non-consecutive hours in observing sequence
  const getSequencePosition = (hour: number) => {
    if (hour >= 18) return hour - 18;
    if (hour <= 11) return hour + 6;
    return hour + 12;
  };
  
  const prevPos = getSequencePosition(prevHour);
  const currentPos = getSequencePosition(currentHour);
  
  // Gap if difference is more than 1 (allowing for 23->0 transition)
  return Math.abs(currentPos - prevPos) > 1;
}

/**
 * Generate appropriate reason text for time windows
 */
function generateWindowReason(condition: ConditionData, hourCount: number): string {
  const duration = hourCount === 1 ? '1 hour' : `${hourCount} hours`;
  const qualityAdjective = {
    excellent: 'outstanding',
    good: 'favorable', 
    dubious: 'marginal',
    poor: 'challenging'
  }[condition.quality];
  
  if (hourCount === 1) {
    return condition.reason;
  }
  
  return `${duration} of ${qualityAdjective} conditions - ${condition.reason}`;
}

/**
 * Enhance time window with calculated end time and additional metadata
 */
function enhanceTimeWindow(window: TimeWindow): void {
  // Calculate proper end time (add 1 hour to last condition time)
  const endHour = parseInt(window.end.split(':')[0]);
  const finalEndHour = (endHour + 1) % 24;
  window.end = `${finalEndHour.toString().padStart(2, '0')}:00`;
  
  // Add duration info to reason if window spans multiple hours
  if ((window.count || 1) > 1) {
    const hours = window.count || 1;
    const timeRange = window.start === window.end ? window.start : `${window.start}-${window.end}`;
    window.reason = `${hours}h window (${timeRange}): ${window.reason}`;
  }
}

/**
 * Merge adjacent windows with compatible quality levels
 */
function mergeAdjacentWindows(windows: TimeWindow[]): TimeWindow[] {
  if (windows.length <= 1) return windows;
  
  const merged: TimeWindow[] = [];
  let current = { ...windows[0] };
  
  for (let i = 1; i < windows.length; i++) {
    const next = windows[i];
    
    // Check if windows can be merged (adjacent times + compatible quality)
    const canMerge = shouldMergeWindows(current, next);
    
    if (canMerge) {
      // Merge windows
      current.end = next.end;
      current.count = (current.count || 1) + (next.count || 1);
      
      // Update quality to better of the two
      const qualityRanking = { excellent: 4, good: 3, dubious: 2, poor: 1 };
      if (qualityRanking[next.quality] > qualityRanking[current.quality]) {
        current.quality = next.quality;
      }
      
      current.reason = `Combined ${current.count}h period with ${current.quality} conditions`;
    } else {
      // Can't merge, add current and start new
      merged.push(current);
      current = { ...next };
    }
  }
  
  merged.push(current);
  return merged;
}

/**
 * Determine if two adjacent windows should be merged
 */
function shouldMergeWindows(first: TimeWindow, second: TimeWindow): boolean {
  // Only merge if qualities are similar (within one tier)
  const qualityRanking = { excellent: 4, good: 3, dubious: 2, poor: 1 };
  const qualityDiff = Math.abs(qualityRanking[first.quality] - qualityRanking[second.quality]);
  
  // Can merge excellent+good, good+dubious, but not excellent+dubious or anything+poor
  if (qualityDiff <= 1 && first.quality !== 'poor' && second.quality !== 'poor') {
    // Check if times are adjacent
    const firstEndHour = parseInt(first.end.split(':')[0]);
    const secondStartHour = parseInt(second.start.split(':')[0]);
    
    // Adjacent if end of first == start of second, accounting for midnight wrap
    return firstEndHour === secondStartHour || 
           (firstEndHour === 23 && secondStartHour === 0) ||
           (firstEndHour === 0 && secondStartHour === 1);
  }
  
  return false;
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customClearSkyUrl, location } = body;
    
    if (!customClearSkyUrl) {
      return NextResponse.json({ error: 'customClearSkyUrl is required' }, { status: 400 });
    }
    
    // Load default observation criteria
    const configPath = path.join(process.cwd(), 'src/config/observation-criteria.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const criteria: ObservationCriteria = JSON.parse(configData);
    
    // Override the Clear Sky Chart URL with the custom one
    const customCriteria = {
      ...criteria,
      location: {
        ...criteria.location,
        ...location,
        clearSkyChartUrl: customClearSkyUrl
      }
    };
    
    const today = new Date();
    
    // Calculate sun times and observing window
    const sunTimes = calculateSunTimes(today, customCriteria.location);
    
    // Calculate observing window based on user preferences
    const observingWindow = calculateObservingWindow(
      sunTimes, 
      customCriteria.observingWindow.startOffset, 
      customCriteria.observingWindow.endOffset
    );
    
    // Calculate moon data
    const moonData = await calculateMoonData(today, customCriteria.location);
    
    // Fetch Clear Sky Chart data using the custom URL
    const chartData = await fetchClearSkyChartData(customClearSkyUrl);
    
    if (!chartData || !chartData.forecast || chartData.forecast.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch or parse Clear Sky Chart data' }, { status: 500 });
    }
    
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

    // Filter conditions to observing window (same logic as GET)
    const filteredConditions = conditions.filter(condition => {
      const [hours] = condition.time.split(':').map(Number);
      
      const conditionTimeToday = new Date(today);
      conditionTimeToday.setHours(hours, 0, 0, 0);
      
      const conditionTimeTomorrow = new Date(today);
      conditionTimeTomorrow.setDate(conditionTimeTomorrow.getDate() + 1);
      conditionTimeTomorrow.setHours(hours, 0, 0, 0);
      
      const conditionEndToday = new Date(conditionTimeToday);
      conditionEndToday.setHours(hours + 1, 0, 0, 0);
      
      const conditionEndTomorrow = new Date(conditionTimeTomorrow);
      conditionEndTomorrow.setHours(hours + 1, 0, 0, 0);
      
      const overlapToday = (conditionTimeToday < observingWindow.end) && (conditionEndToday > observingWindow.start);
      const overlapTomorrow = (conditionTimeTomorrow < observingWindow.end) && (conditionEndTomorrow > observingWindow.start);
      
      return overlapToday || overlapTomorrow;
    });
    
    // Group consecutive good conditions into time windows
    const timeWindows = groupConsecutiveConditions(filteredConditions);
    
    // Determine overall rating
    const overall = determineOverallRating(timeWindows);
    
    // Generate summary
    const summary = generateSummary(timeWindows, observingWindow, moonData);
    
    // Generate AI recommendation
    let aiResult = null;
    let finalOverall = overall; // Default to rule-based assessment
    
    try {
      aiResult = await getAIObservingRecommendation(
        chartData.forecast, // Use the forecast array from chartData
        customCriteria,
        moonData,
        {
          start: formatTime(observingWindow.start),
          end: formatTime(observingWindow.end),
          totalHours: observingWindow.totalHours
        }
      );
      
      // Use AI assessment if available and confident
      if (aiResult.confidence >= 0.8) {
        finalOverall = aiResult.overall;
      }
    } catch (error) {
      console.warn('AI recommendation failed, continuing with rule-based analysis:', error);
    }
    
    // Build response with all the analysis data
    const response: ObservationRecommendation = {
      overall: finalOverall,
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
        seeing: `Ranges from ${Math.min(...filteredConditions.map(c => c.seeingRating))}/5 to ${Math.max(...filteredConditions.map(c => c.seeingRating))}/5`,
        moonImpact: `${Math.round(moonData.illumination * 100)}% illuminated, rises at ${moonData.rise ? formatTime(moonData.rise) : 'N/A'}`,
        weatherWarnings: generateWeatherWarnings(filteredConditions, moonData)
      },
      aiReasoning: aiResult ? 
        formatAIRecommendation(aiResult) : 
        `Analysis based on Clear Sky Chart data for custom location. Observing window: ${formatTime(observingWindow.start)} to ${formatTime(observingWindow.end)} (${observingWindow.totalHours} hours total). Conditions vary throughout the night with ${timeWindows.length} distinct periods.`,
      aiConfidence: aiResult?.confidence,
      aiSuggestions: aiResult ? {
        bestTimeWindows: aiResult.bestTimeWindows,
        warnings: aiResult.warnings,
        opportunities: aiResult.opportunities
      } : undefined
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error in POST observation-evaluate:', error);
    return NextResponse.json(
      { error: 'Failed to analyze Clear Sky Chart' },
      { status: 500 }
    );
  }
}
