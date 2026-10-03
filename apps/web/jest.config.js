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
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // Path aliases are not needed for the geography guard test (it uses only
  // Node built-ins + relative paths), but map them so future tests compile.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageThreshold: {
    global: {
      // Measured current full source surface, 3 October 2026.
      statements: 5.13,
      branches: 3.95,
      functions: 5.17,
      lines: 4.8,
    },
  },
};
