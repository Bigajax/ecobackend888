// Shim CommonJS para `uuid` nos contract tests.
//
// O uuid v13 é ESM-only (package.json exports → dist-node/index.js usa `import`),
// o que quebra sob ts-jest em modo CommonJS ("Cannot use import statement outside
// a module") assim que o app (server/routes/payments.ts) é importado.
//
// Todo o app usa apenas `v4`, e crypto.randomUUID() gera um UUID v4 válido —
// suficiente para os contract tests. Mapeado via moduleNameMapper em
// jest.contract.config.ts.
import { randomUUID } from "crypto";

export const v4 = (): string => randomUUID();

export default { v4 };
