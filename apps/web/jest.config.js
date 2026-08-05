/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // Path aliases are not needed for the geography guard test (it uses only
  // Node built-ins + relative paths), but map them so future tests compile.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
