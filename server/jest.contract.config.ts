import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: __dirname,
  // Testes de contrato de API vivem em tests/contract/*.spec.ts (jest @jest/globals).
  // (Antes apontava para tests/controllers, que não existe → o comando não rodava nada.)
  roots: ["<rootDir>/tests/contract"],
  testMatch: ["**/*.spec.ts"],
  // setupEnv.js: dummies de env (SUPABASE_*/OPENROUTER/...) ANTES dos imports,
  // para os guards (ensureSupabaseConfigured etc.) não explodirem no load do app.
  setupFiles: ["<rootDir>/tests/setupEnv.js"],
  // setup.ts: cleanup de mocks jest entre testes (precisa dos globals do jest).
  setupFilesAfterEnv: ["<rootDir>/tests/contract/setup.ts"],
  moduleNameMapper: {
    "^node-fetch$": "node-fetch",
    // uuid v13 é ESM-only e quebra sob ts-jest CJS; shim usa crypto.randomUUID.
    "^uuid$": "<rootDir>/tests/contract/uuidMock.ts",
  },
  collectCoverage: false,
  verbose: false,
  // O app deixa handles abertos (keep-alive do Supabase/undici); sem forceExit o
  // jest fica pendurado após os testes passarem (travaria o CI). Espelha o
  // --test-force-exit usado na suíte node:test.
  forceExit: true,
  testTimeout: 30000,
  globals: {
    "ts-jest": {
      diagnostics: false,
      isolatedModules: true,
    },
  },
};

export default config;
