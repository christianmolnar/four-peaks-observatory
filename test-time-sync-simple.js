#!/usr/bin/env node

/**
 * Simple Time Synchronization Test
 * Tests the logic without importing the actual modules
 */

console.log('🔭 Testing Clear Sky Chart Time Synchronization Logic\n');

// Mock location (Maple Valley Observatory)
const mockLocation = {
  name: "Maple Valley Observatory, WA",
  latitude: 47.3668,
  longitude: -122.0432,
  timezone: "America/Los_Angeles"
};

/**
 * Simplified astronomical calculations for testing
 */
function calculateSunTimes(date, location) {
  // Approximate sunset/sunrise for October in Pacific timezone
  const sunset = new Date(date);
  sunset.setHours(19, 30, 0, 0); // ~7:30 PM
  
  const sunrise = new Date(date);
  // If we're past midnight, sunrise is same day, otherwise next day
  if (date.getHours() < 12) {
    sunrise.setHours(7, 0, 0, 0); // 7 AM same day
  } else {
    sunrise.setDate(sunrise.getDate() + 1);
    sunrise.setHours(7, 0, 0, 0); // 7 AM next day
  }
  
  return { sunset, sunrise };
}

/**
 * Test chart generation time inference
 */
function inferChartGenerationTime(currentTime) {
  // Clear Sky Charts are generated every 3 hours in UTC: 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00
  const generationIntervalHours = 3;
  const currentUTC = new Date(currentTime.getTime());
  
  const utcHours = currentUTC.getUTCHours();
  const lastGenerationHour = Math.floor(utcHours / generationIntervalHours) * generationIntervalHours;
  
  const generatedAt = new Date(currentUTC);
  generatedAt.setUTCHours(lastGenerationHour, 0, 0, 0);
  
  // If we're very close to generation time (within 15 minutes), use previous generation
  const timeSinceGeneration = currentTime.getTime() - generatedAt.getTime();
  if (timeSinceGeneration < 15 * 60 * 1000) {
    generatedAt.setUTCHours(lastGenerationHour - generationIntervalHours);
  }
  
  const chartAgeHours = (currentTime.getTime() - generatedAt.getTime()) / (1000 * 60 * 60);
  
  return {
    generatedAt,
    chartAgeHours
  };
}

/**
 * Calculate dynamic observing window
 */
function calculateDynamicObservingWindow(currentTime, location, startOffset = 60, endOffset = 60) {
  const today = new Date(currentTime);
  const tomorrow = new Date(currentTime);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const todaySun = calculateSunTimes(today, location);
  const tomorrowSun = calculateSunTimes(tomorrow, location);
  
  // Determine scenario
  if (currentTime < todaySun.sunset) {
    // Before sunset - plan for tonight
    const observingStart = new Date(todaySun.sunset.getTime() + startOffset * 60000);
    const observingEnd = new Date(todaySun.sunrise.getTime() - endOffset * 60000);
    
    if (observingEnd < observingStart) {
      observingEnd.setDate(observingEnd.getDate() + 1);
    }
    
    const totalHours = (observingEnd.getTime() - observingStart.getTime()) / (1000 * 60 * 60);
    
    return {
      start: observingStart,
      end: observingEnd,
      totalHours: Math.round(totalHours * 10) / 10,
      isPartialNight: false,
      reason: `Full night observing window`
    };
  } else if (currentTime < todaySun.sunrise) {
    // After sunset, before sunrise - rest of current night
    const observingStart = new Date(Math.max(currentTime.getTime(), todaySun.sunset.getTime() + startOffset * 60000));
    const observingEnd = new Date(todaySun.sunrise.getTime() - endOffset * 60000);
    
    if (observingEnd < observingStart) {
      observingEnd.setDate(observingEnd.getDate() + 1);
    }
    
    const totalHours = Math.max(0, (observingEnd.getTime() - observingStart.getTime()) / (1000 * 60 * 60));
    
    return {
      start: observingStart,
      end: observingEnd,
      totalHours: Math.round(totalHours * 10) / 10,
      isPartialNight: true,
      reason: `Remaining observing time tonight`
    };
  } else {
    // After sunrise - plan for next night
    const observingStart = new Date(tomorrowSun.sunset.getTime() + startOffset * 60000);
    const observingEnd = new Date(tomorrowSun.sunrise.getTime() - endOffset * 60000);
    
    if (observingEnd < observingStart) {
      observingEnd.setDate(observingEnd.getDate() + 1);
    }
    
    const totalHours = (observingEnd.getTime() - observingStart.getTime()) / (1000 * 60 * 60);
    
    return {
      start: observingStart,
      end: observingEnd,
      totalHours: Math.round(totalHours * 10) / 10,
      isPartialNight: false,
      reason: `Next night observing window`
    };
  }
}

/**
 * Test scenarios
 */
function testTimeScenario(currentTime, description) {
  console.log(`📅 ${description}`);
  console.log(`Current time: ${currentTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PDT`);
  
  // Test chart generation timing
  const chartTiming = inferChartGenerationTime(currentTime);
  console.log(`📊 Chart generated: ${chartTiming.generatedAt.toISOString()} (${Math.round(chartTiming.chartAgeHours * 10) / 10} hours ago)`);
  
  // Test observing window
  const observingWindow = calculateDynamicObservingWindow(currentTime, mockLocation, 60, 60);
  console.log(`🌅 ${observingWindow.reason}`);
  console.log(`🕐 Window: ${observingWindow.start.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} to ${observingWindow.end.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`);
  console.log(`⏱️  Duration: ${observingWindow.totalHours} hours`);
  console.log(`🌙 Partial night: ${observingWindow.isPartialNight}`);
  
  // Calculate how many chart columns are relevant
  const chartStart = chartTiming.generatedAt;
  const hoursToWindowStart = (observingWindow.start.getTime() - chartStart.getTime()) / (1000 * 60 * 60);
  const hoursToWindowEnd = (observingWindow.end.getTime() - chartStart.getTime()) / (1000 * 60 * 60);
  
  const startColumn = Math.max(0, Math.floor(hoursToWindowStart));
  const endColumn = Math.min(47, Math.floor(hoursToWindowEnd));
  const relevantColumns = Math.max(0, endColumn - startColumn + 1);
  
  console.log(`📍 Chart columns: ${startColumn} to ${endColumn} (${relevantColumns} of 48 total)`);
  
  console.log('');
}

// Run tests
console.log('=== Test 1: 11 PM Pacific (Your Example) ===');
const elevenPM = new Date('2025-10-12T23:00:00-07:00');
testTimeScenario(elevenPM, '11 PM Pacific - Rest of current night');

console.log('=== Test 2: 3 PM Pacific ===');
const threePM = new Date('2025-10-12T15:00:00-07:00');
testTimeScenario(threePM, '3 PM Pacific - Plan for tonight');

console.log('=== Test 3: 8 AM Pacific (Morning Report) ===');
const eightAM = new Date('2025-10-12T08:00:00-07:00');
testTimeScenario(eightAM, '8 AM Pacific - Plan for next night');

console.log('=== Test 4: 5 PM Pacific (Evening Report) ===');
const fivePM = new Date('2025-10-12T17:00:00-07:00');
testTimeScenario(fivePM, '5 PM Pacific - Tonight\'s forecast');

console.log('=== Test 5: 1 AM Pacific (Middle of Night) ===');
const oneAM = new Date('2025-10-13T01:00:00-07:00');
testTimeScenario(oneAM, '1 AM Pacific - Rest of current night');

console.log('✅ Time synchronization tests completed!');
