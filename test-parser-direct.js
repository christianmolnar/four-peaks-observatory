const { fetchClearSkyChartData } = require('./src/lib/clear-sky-parser.ts');
const { evaluateConditions } = require('./src/lib/observation-evaluator.ts');

async function testClearSkyParser() {
  console.log('🔍 Testing Clear Sky Chart Parser directly...\n');
  
  const testUrl = 'http://www.cleardarksky.com/c/DyrsbrgTNcsk.gif?c=928805';
  
  try {
    console.log(`📊 Fetching chart data from: ${testUrl}`);
    
    // Test the parser directly
    const chartData = await fetchClearSkyChartData(testUrl);
    
    if (!chartData || !chartData.conditions) {
      throw new Error('Failed to fetch chart data or no conditions found');
    }
    
    console.log(`\n✅ Successfully parsed ${chartData.conditions.length} hourly conditions`);
    
    // Show sample conditions
    console.log('\n📈 Sample conditions (first 5):');
    chartData.conditions.slice(0, 5).forEach(condition => {
      console.log(`  ${condition.hour}: Clouds=${condition.clouds}, Transparency=${condition.transparency}, Seeing=${condition.seeing}`);
    });
    
    // Evaluate overall conditions
    const evaluation = evaluateConditions(chartData.conditions);
    
    console.log('\n🎯 Evaluation Results:');
    console.log(`Overall Rating: ${evaluation.overallRating}`);
    console.log(`Total Hours: ${evaluation.totalHours}`);
    console.log(`Good Hours: ${evaluation.goodHours}`);
    console.log(`Fair Hours: ${evaluation.fairHours}`);
    console.log(`Poor Hours: ${evaluation.poorHours}`);
    
    if (evaluation.totalHours > 0) {
      const goodPercentage = Math.round((evaluation.goodHours / evaluation.totalHours) * 100);
      console.log(`Good Percentage: ${goodPercentage}%`);
    }
    
    if (evaluation.opportunities) {
      console.log('\n🎯 Opportunities:');
      evaluation.opportunities.forEach(opp => console.log(`  • ${opp}`));
    }
    
    if (evaluation.warnings) {
      console.log('\n⚠️ Warnings:');
      evaluation.warnings.forEach(warning => console.log(`  • ${warning}`));
    }
    
    console.log('\n✨ Direct parser test completed successfully!');
    
  } catch (error) {
    console.error('❌ Parser test failed:', error.message);
    console.error(error.stack);
  }
}

testClearSkyParser();
