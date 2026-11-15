// Jest config for the planner modules. Run via `npm test`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  rootDir: '../..',
  testEnvironment: 'node',
  // The page tests render the whole planner (all eight planet panels included) in jsdom, which is slow per DOM node.
  testTimeout: 30000,
  // The page tests are CPU-bound; on a 16-core box the default (cores - 1) workers starve each other and tests hit the timeout.
  maxWorkers: 4,
  testMatch: [
    '<rootDir>/src/planner/**/*.test.ts',
    '<rootDir>/src/app/planner/**/*.test.{ts,tsx}',
    // Sign-in: owner list, requireUser, the session route.
    '<rootDir>/src/lib/planner-auth/**/*.test.ts',
    '<rootDir>/src/app/api/planner/**/*.test.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/planner/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // The page now holds the sign-in control; the real package is ES-module only, and no page test signs in.
    '^next-auth/react$': '<rootDir>/src/app/planner/next-auth-react.stub.ts',
  },
});
