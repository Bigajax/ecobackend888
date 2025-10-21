import type { Config } from 'jest';

const config = {
  preset: 'ts-jest/presets/default-esm',
  useESM: true,
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  extensionsToTreatAsEsm: ['.ts'],
  passWithNoTests: true,
  transformIgnorePatterns: ['/node_modules/'],
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: '<rootDir>/__tests__/tsconfig.json'
    }
  }
} as Config;

export default config;
