# Validadores de Qualidade

`validators.ts` implementa heurísticas leves para checar estrutura, uso de memórias e presença de bloco técnico em respostas finais. Os validadores são usados pela finalização para computar o score `Q` e alimentar telemetria/analytics.

Testes unitários vivem em `tests/quality/validators.test.ts` com Jest.
