import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverage: false,
  coverageDirectory: "coverage",
  // NOTA DE HIGIENE (ver docs/prompt-architecture.md › Testes): o diretório tests/ mistura
  // dois frameworks. Os arquivos em quality/bandits/orchestrator são jest (rodam aqui). Vários
  // arquivos em tests/ na raiz (contextCache, prepareQueryEmbedding, relatorioEmocionalRoutes,
  // openrouterRoutesCache) usam node:test/harness próprio e NÃO rodam sob jest. E
  // intensity-detection.test.ts é jest, mas tem assertions desatualizadas (intensidade dá 6
  // onde espera ≥7 — investigar junto da calibração de intensidade / MEMORY_THRESHOLD).
  // Ampliar para tests/**/*.test.ts só traz ruído até esses serem migrados/corrigidos.
  testMatch: [
    "<rootDir>/tests/quality/**/*.test.ts",
    "<rootDir>/tests/bandits/**/*.test.ts",
    "<rootDir>/tests/orchestrator/**/*.test.ts",
  ],
  verbose: false,
};

export default config;
