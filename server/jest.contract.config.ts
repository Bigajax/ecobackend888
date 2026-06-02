import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: __dirname,
  // Testes de contrato de API vivem em tests/contract/*.spec.ts (jest @jest/globals).
  // (Antes apontava para tests/controllers, que não existe → o comando não rodava nada.)
  roots: ["<rootDir>/tests/contract"],
  testMatch: ["**/*.spec.ts"],
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
