/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: '<rootDir>/../coverage',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  coverageThreshold: {
    // Measured full-suite baseline on 2 September 2026:
    // 44.10 statements / 36.09 branches / 20.61 functions / 44.21 lines.
    // Keep all four dimensions from regressing; raise them as coverage grows.
    global: {
      statements: 44,
      branches: 36,
      functions: 20,
      lines: 44,
    },
  },
};
