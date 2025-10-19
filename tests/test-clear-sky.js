#!/usr/bin/env node

// Test script for Clear Sky Chart analysis
const fetch = require('node-fetch');

async function testClearSkyAnalysis() {
  console.log('🔍 Testing Clear Sky Chart Analysis...\n');
  
  // The Dyersburg chart URL that showed good conditions but was analyzed as poor
  const testUrl = 'http://www.cleardarksky.com/c/DyrsbrgTNcsk.gif?c=928805';
  
  try {
    console.log(`📊 Analyzing chart: ${testUrl}`);
    
    const response = await fetch('http://localhost:3003/api/test-clear-sky', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: testUrl
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log('\n✅ Analysis Results:');
    console.log('==================');
    console.log(`Overall Rating: ${result.overallRating}`);
    console.log(`Total Hours: ${result.totalHours}`);
    console.log(`Good Hours: ${result.goodHours}`);
    console.log(`Fair Hours: ${result.fairHours}`);
    console.log(`Poor Hours: ${result.poorHours}`);
    console.log(`Good Percentage: ${Math.round((result.goodHours / result.totalHours) * 100)}%`);
    
    if (result.opportunities && result.opportunities.length > 0) {
      console.log('\n🎯 Opportunities:');
      result.opportunities.forEach(opp => console.log(`  • ${opp}`));
    }
    
    if (result.warnings && result.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      result.warnings.forEach(warning => console.log(`  • ${warning}`));
    }
    
    if (result.conditions && result.conditions.length > 0) {
      console.log('\n📈 Sample Hourly Conditions (first 5):');
      result.conditions.slice(0, 5).forEach(condition => {
        console.log(`  ${condition.hour}: Clouds=${condition.clouds}, Transparency=${condition.transparency}, Seeing=${condition.seeing}`);
      });
    }
    
    console.log('\n✨ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testClearSkyAnalysis();
