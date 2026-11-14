module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'lcov'],
  forceExit: true,
  detectOpenHandles: false,
  testTimeout: 10000,
  moduleNameMapper: {
    '^@sentry-timer/core$': '<rootDir>/../core/dist/index.js',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
};
