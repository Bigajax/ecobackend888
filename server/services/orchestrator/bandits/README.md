# Thompson Sampling dos pilares

- Cada pilar (`Linguagem`, `Encerramento`, `Modulacao`) possui três variantes (`_full`, `_mini`, `_rules`).
- `pickArm(pilar)` consulta o `qualityAnalyticsStore`, calcula média e variância beta e faz uma amostra Normal aproximada (Box-Muller) para Thompson Sampling.
- `updateArm(pilar, arm, recompensa)` grava a recompensa normalizada (reward = Q − 0.01 * tokens_total/1000) e atualiza o posterior.
- As amostras ficam em memória (janela 7d) e podem ser persistidas via handler do `analyticsStore` quando disponível.
- Falhas no bandit são best-effort e nunca bloqueiam o fluxo principal.
