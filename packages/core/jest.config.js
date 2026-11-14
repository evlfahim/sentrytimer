/** @type {import('jest').Config} */
module.exports = {
  displayName: 'core',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  globalTeardown: '<rootDir>/__tests__/globalTeardown.ts',
};
