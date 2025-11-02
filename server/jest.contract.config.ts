import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: __dirname,
  roots: ["<rootDir>/tests/controllers"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^node-fetch$": "node-fetch",
  },
  collectCoverage: false,
  verbose: false,
  globals: {
    "ts-jest": {
      diagnostics: false,
      isolatedModules: true,
    },
  },
};

export default config;
