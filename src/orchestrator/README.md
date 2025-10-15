# Orquestrador de Módulos

O arquivo `knapsack.ts` oferece o algoritmo guloso usado para selecionar módulos aditivos respeitando o budget de tokens. Ele ordena candidatos pelo produto `vptMean * priorPeso` e retorna os módulos adotados, além do ganho marginal estimado.

Testes vivem em `tests/orchestrator/knapsack.test.ts`.
