// test-fs-write.js
const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, 'src', 'data', 'metadata.test.json');
const testData = { test: 'write', timestamp: Date.now() };

try {
  fs.writeFileSync(testPath, JSON.stringify(testData, null, 2), 'utf8');
  console.log('✅ File write succeeded:', testPath);
} catch (err) {
  console.error('❌ File write failed:', err);
}
