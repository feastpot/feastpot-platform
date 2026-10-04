/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  setupFiles: ['<rootDir>/../../../scripts/test-factory/database-pool.cjs'],
  testRegex: '.*\\.spec\\.ts$',
  // Unit/database coverage is not evidence of externally authenticated E2E.
  // Explicit acceptance jobs select that surface and fail on missing secrets.
  testPathIgnorePatterns:
    process.env.FEASTPOT_TEST_ENVIRONMENT === 'authoritative'
      ? ['/node_modules/']
      : [
          '/node_modules/',
          '/e2e/',
          ...(process.env.FEASTPOT_TEST_ENVIRONMENT === 'database'
            ? []
            : ['\\.integration\\.spec\\.ts$']),
        ],
  maxWorkers: 2,
  testTimeout: 30000,
  coverageReporters: ['text-summary', 'json-summary', 'lcov', 'html'],
  reporters: ['default', '<rootDir>/../../../scripts/no-skipped-tests.cjs'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: '<rootDir>/../coverage',
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/*.d.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  coverageThreshold: {
    // All production TypeScript is in the denominator. Separate measured
    // unit/database surfaces; authenticated acceptance is not coverage.
    global: require('../../scripts/coverage-baselines.json').api[
      process.env.FEASTPOT_TEST_ENVIRONMENT === 'database' ? 'database' : 'unit'
    ],
  },
};
