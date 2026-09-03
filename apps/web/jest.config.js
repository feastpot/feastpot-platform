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
      // Measured full-suite baseline on 2 September 2026:
      // 0.86 statements / 1.37 branches / 0.43 functions / 0.59 lines.
      statements: 0.8,
      branches: 1.3,
      functions: 0.4,
      lines: 0.5,
    },
  },
};
