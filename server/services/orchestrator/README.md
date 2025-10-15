# Orchestrator helpers

Ferramentas auxiliares para decisões de orçamento de contexto.

- `knapsack.solveKnapsack(budgetTokens, candidatos)` usa uma heurística gulosa ajustada por peso
  anterior (`priorPeso`) para selecionar módulos aditivos sem exceder o orçamento.
- Cada candidato deve informar `tokens` (custo), `priorPeso` (quanto menor, maior prioridade)
  e `vptMean` (valor médio por token). O retorno inclui a lista adotada e o ganho marginal
  estimado (`Σ vptMean * tokens`).

Os orçamentos finais combinam:

1. **MVS fixo** — módulos mínimos vitais sempre incluídos (identidade/estrutura/memória/VIVA).
2. **Aditivos** — variantes _full/_mini/_rules escolhidas via knapsack respeitando o budget
   (`budget_aditivo`, padrão 1200 tokens), usando os priors como desempate.

Os resultados alimentam telemetrias e ajuste dinâmico de VPT agregadas em `analyticsStore`.
