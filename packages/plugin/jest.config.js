/** @type {import('jest').Config} */
module.exports = {
  displayName: 'plugin',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  // Resolve core from source so plugin tests do not depend on core/dist or the workspace symlink.
  moduleNameMapper: {
    '^@sentry-timer/core$': '<rootDir>/../core/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
