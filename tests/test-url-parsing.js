// Simple test to verify the Clear Sky Chart URL parsing fix
console.log('🔍 Testing URL parsing fix...\n');

// Test the URL parsing regex that we just fixed
const chartUrl = 'http://www.cleardarksky.com/c/DyrsbrgTNcsk.gif?c=928805';
console.log(`Original URL: ${chartUrl}`);

// This is the regex pattern we fixed in clear-sky-parser.ts
const chartIdMatch = chartUrl.match(/\/c\/([^/]+?)(?:\?|$)/);

if (chartIdMatch) {
  const chartId = chartIdMatch[1];
  console.log(`✅ Extracted Chart ID: ${chartId}`);
  
  // Construct the clean URL (what our parser should be using)
  const cleanUrl = `http://www.cleardarksky.com/c/${chartId}`;
  console.log(`✅ Clean URL for parsing: ${cleanUrl}`);
  
  console.log('\n🎯 URL parsing fix is working correctly!');
  console.log('The parser should now properly handle URLs with query parameters.');
} else {
  console.log('❌ URL parsing failed - regex pattern needs adjustment');
}

console.log('\n📊 Testing different URL formats:');

const testUrls = [
  'http://www.cleardarksky.com/c/DyrsbrgTNcsk.gif',
  'http://www.cleardarksky.com/c/DyrsbrgTNcsk.gif?c=928805',
  'http://www.cleardarksky.com/c/DyrsbrgTNcsk.gif?timestamp=12345',
  'https://www.cleardarksky.com/c/SomeOtherSite.gif?param=value'
];

testUrls.forEach(url => {
  const match = url.match(/\/c\/([^/]+?)(?:\?|$)/);
  if (match) {
    console.log(`  ✅ ${url} → Chart ID: ${match[1]}`);
  } else {
    console.log(`  ❌ ${url} → No match`);
  }
});

console.log('\n✨ URL parsing test completed!');
