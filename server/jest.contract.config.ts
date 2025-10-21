import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: __dirname,
  roots: ["<rootDir>/tests/contract"],
  testMatch: ["**/*.spec.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/contract/setup.ts"],
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
