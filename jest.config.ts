import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverage: false,
  coverageDirectory: "coverage",
  testMatch: [
    "<rootDir>/tests/quality/**/*.test.ts",
    "<rootDir>/tests/bandits/**/*.test.ts",
    "<rootDir>/tests/orchestrator/**/*.test.ts",
  ],
  verbose: false,
};

export default config;
