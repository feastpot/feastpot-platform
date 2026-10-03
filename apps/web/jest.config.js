/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  maxWorkers: 2,
  coverageReporters: ['text-summary', 'json-summary', 'lcov', 'html'],
  reporters: ['default', '<rootDir>/../../scripts/no-skipped-tests.cjs'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  // Path aliases are not needed for the geography guard test (it uses only
  // Node built-ins + relative paths), but map them so future tests compile.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageThreshold: {
    // Includes all production .ts AND .tsx.
    global: require('../../scripts/coverage-baselines.json').web,
  },
};
