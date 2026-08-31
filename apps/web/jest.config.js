/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
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
      // This threshold is measured across the complete discovered web unit
      // suite and all web TypeScript source, not just the original
      // feastpass-callout test. The measured baseline is currently 0.87%.
      statements: 0.8,
    },
  },
};
