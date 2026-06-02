import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverage: false,
  coverageDirectory: "coverage",
  // NOTA DE HIGIENE: os arquivos jest vivem em quality/bandits/orchestrator + o
  // intensity-detection.test.ts na raiz. Os antigos órfãos node:test da raiz
  // (contextCache, prepareQueryEmbedding, relatorioEmocionalRoutes, openrouterRoutesCache)
  // foram movidos para server/tests/ e agora rodam sob node:test (npm run test:node).
  // `tests/*.test.ts` casa só os arquivos no nível da raiz (não desce em subdirs),
  // então não duplica os globs de quality/bandits/orchestrator.
  testMatch: [
    "<rootDir>/tests/*.test.ts",
    "<rootDir>/tests/quality/**/*.test.ts",
    "<rootDir>/tests/bandits/**/*.test.ts",
    "<rootDir>/tests/orchestrator/**/*.test.ts",
  ],
  verbose: false,
};

export default config;
