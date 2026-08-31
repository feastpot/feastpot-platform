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
    // The current API baseline is approximately 41.83% statements. Keep this
    // gate honest now and raise it to 60% as the service-level suite grows.
    global: {
      statements: 40,
    },
  },
};
