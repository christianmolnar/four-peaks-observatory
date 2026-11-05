// Jest config for the planner modules. Run via `npm test`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/planner/**/*.test.ts', '<rootDir>/src/app/planner/**/*.test.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
});
