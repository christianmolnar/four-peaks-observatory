#!/usr/bin/env node

/**
 * Test Runner for Maple Valley Observatory
 * Provides convenient commands for running different test suites
 */

const { execSync } = require('child_process');

const commands = {
  unit: 'jest tests/unit --verbose',
  data: 'jest tests/data --verbose', 
  integration: 'jest tests/integration --verbose',
  all: 'jest --verbose',
  coverage: 'jest --coverage',
  watch: 'jest --watch',
  ci: 'jest --ci --coverage --watchAll=false'
};

const testType = process.argv[2] || 'all';

if (!commands[testType]) {
  console.log('Available test commands:');
  Object.keys(commands).forEach(cmd => {
    console.log(`  npm run test:${cmd}`);
  });
  process.exit(1);
}

console.log(`\n🧪 Running ${testType} tests...\n`);

try {
  execSync(commands[testType], { stdio: 'inherit' });
  console.log(`\n✅ ${testType} tests completed successfully!\n`);
} catch (error) {
  console.log(`\n❌ ${testType} tests failed!\n`);
  process.exit(1);
}
