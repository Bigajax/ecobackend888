import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: __dirname,
  roots: ["<rootDir>/__tests__"],
  testMatch: ["**/*.test.ts"],
  collectCoverage: false,
  verbose: true,
  globals: {
    "ts-jest": {
      diagnostics: false,
      isolatedModules: true,
      tsconfig: {
        types: ["node", "jest"],
      },
    },
  },
};

export default config;
