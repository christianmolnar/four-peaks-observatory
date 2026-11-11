// Jest config for the planner modules. Run via `npm test`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  rootDir: '../..',
  testEnvironment: 'node',
  // The page tests render the whole planner (all eight planet panels included) in jsdom, which is slow per DOM node.
  testTimeout: 30000,
  testMatch: [
    '<rootDir>/src/planner/**/*.test.ts',
    '<rootDir>/src/app/planner/**/*.test.tsx',
    // Sign-in: owner list, requireUser, the session route.
    '<rootDir>/src/lib/planner-auth/**/*.test.ts',
    '<rootDir>/src/app/api/planner/**/*.test.ts',
  ],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
});
