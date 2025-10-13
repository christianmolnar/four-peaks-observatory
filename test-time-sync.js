#!/usr/bin/env node

/**
 * Test Clear Sky Chart Time Synchronization
 * 
 * Tests different scenarios to ensure proper time handling:
 * 1. Before sunset (11 PM Pacific example)
 * 2. After sunset, before sunrise (current night)
 * 3. Different times of day
 */

import { 
  inferChartGenerationTime,
  calculateDynamicObservingWindow,
  mapObservingWindowToChartColumns,
  getTimingDescription,
  validateChartCoverage
} from '../src/lib/chart-time-sync.js';

// Mock location (Maple Valley Observatory)
const mockLocation = {
  name: "Maple Valley Observatory, WA",
  latitude: 47.3668,
  longitude: -122.0432,
  timezone: "America/Los_Angeles"
};

/**
 * Test scenarios
 */
function runTests() {
  console.log('🔭 Testing Clear Sky Chart Time Synchronization\n');
  
  // Test 1: 11 PM Pacific (your example)
  console.log('=== Test 1: 11 PM Pacific ===');
  const elevenPM = new Date('2025-10-12T23:00:00-07:00'); // 11 PM PDT
  testTimeScenario(elevenPM, '11 PM Pacific - Rest of current night');
  
  // Test 2: 3 PM Pacific (before sunset)
  console.log('\n=== Test 2: 3 PM Pacific ===');
  const threePM = new Date('2025-10-12T15:00:00-07:00'); // 3 PM PDT
  testTimeScenario(threePM, '3 PM Pacific - Plan for tonight');
  
  // Test 3: 8 AM Pacific (morning report time)
  console.log('\n=== Test 3: 8 AM Pacific ===');
  const eightAM = new Date('2025-10-12T08:00:00-07:00'); // 8 AM PDT
  testTimeScenario(eightAM, '8 AM Pacific - Plan for next night');
  
  // Test 4: 5 PM Pacific (evening report time)
  console.log('\n=== Test 4: 5 PM Pacific ===');
  const fivePM = new Date('2025-10-12T17:00:00-07:00'); // 5 PM PDT
  testTimeScenario(fivePM, '5 PM Pacific - Tonight\'s forecast');
  
  // Test chart generation timing
  console.log('\n=== Chart Generation Timing Tests ===');
  testChartGenerationTiming();
}

function testTimeScenario(currentTime, description) {
  console.log(`📅 ${description}`);
  console.log(`Current time: ${currentTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PDT`);
  
  try {
    // Test chart generation inference
    const chartTiming = inferChartGenerationTime('https://cleardarksky.com/c/MplVllyObWAcsk.gif', currentTime);
    console.log(`📊 Chart generated: ${chartTiming.generatedAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC`);
    console.log(`⏰ Chart age: ${Math.round(chartTiming.chartAgeHours * 10) / 10} hours`);
    
    // Test observing window calculation
    const observingWindow = calculateDynamicObservingWindow(currentTime, mockLocation, 60, 60);
    console.log(`🌅 ${observingWindow.reason}`);
    console.log(`🕐 Window: ${observingWindow.start.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} to ${observingWindow.end.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`);
    console.log(`⏱️  Duration: ${observingWindow.totalHours} hours`);
    console.log(`🌙 Partial night: ${observingWindow.isPartialNight}`);
    
    // Test column mapping
    const { columnIndices, hours } = mapObservingWindowToChartColumns(observingWindow, chartTiming);
    console.log(`📍 Relevant columns: ${columnIndices.length} of 48 total`);
    if (columnIndices.length > 0) {
      console.log(`📍 First column: ${columnIndices[0]} (${hours[0].toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })})`);
      console.log(`📍 Last column: ${columnIndices[columnIndices.length - 1]} (${hours[hours.length - 1].toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })})`);
    }
    
    // Test coverage validation
    const coverage = validateChartCoverage(observingWindow, chartTiming);
    console.log(`✅ Chart coverage adequate: ${coverage.adequate}`);
    if (!coverage.adequate) {
      console.log(`⚠️  ${coverage.warning}`);
    }
    
    // Test timing description
    const description = getTimingDescription(observingWindow, chartTiming, columnIndices.length);
    console.log(`📝 Description: ${description}`);
    
  } catch (error) {
    console.error(`❌ Error in scenario: ${error.message}`);
  }
}

function testChartGenerationTiming() {
  console.log('Testing chart generation time inference...\n');
  
  // Test at different times relative to generation schedule
  const testTimes = [
    { time: new Date('2025-10-12T00:05:00Z'), desc: '5 minutes after midnight UTC' },
    { time: new Date('2025-10-12T02:50:00Z'), desc: '10 minutes before 3 AM UTC generation' },
    { time: new Date('2025-10-12T03:10:00Z'), desc: '10 minutes after 3 AM UTC generation' },
    { time: new Date('2025-10-12T05:45:00Z'), desc: '15 minutes before 6 AM UTC generation' },
    { time: new Date('2025-10-12T12:30:00Z'), desc: 'Middle of 12-15 UTC interval' }
  ];
  
  testTimes.forEach(({ time, desc }) => {
    console.log(`🕐 ${desc}`);
    console.log(`   UTC time: ${time.toISOString()}`);
    
    const chartTiming = inferChartGenerationTime('test-url', time);
    console.log(`   Inferred generation: ${chartTiming.generatedAt.toISOString()}`);
    console.log(`   Chart age: ${Math.round(chartTiming.chartAgeHours * 10) / 10} hours`);
    console.log('');
  });
}

// Simulate astronomical calculations for testing
function calculateSunTimes(date, location) {
  // Simplified calculation for testing
  const sunset = new Date(date);
  sunset.setHours(19, 30, 0, 0); // Approximate sunset for October in Pacific
  
  const sunrise = new Date(date);
  sunrise.setDate(sunrise.getDate() + 1);
  sunrise.setHours(7, 0, 0, 0); // Approximate sunrise
  
  return { sunset, sunrise };
}

// Mock the imports for testing
global.calculateSunTimes = calculateSunTimes;

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { runTests };
