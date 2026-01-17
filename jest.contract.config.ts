const config = {
  preset: 'ts-jest',
  testMatch: ['<rootDir>/server/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  passWithNoTests: true,
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json'
    }
  }
};

export default config;
