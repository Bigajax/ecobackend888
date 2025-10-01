# Relatório de Auditoria de Latência

## Contexto
Este relatório documenta os resultados da auditoria de latência conduzida em 16/05/2024, comparando o comportamento atual com a linha de base coletada em 02/05/2024 no ambiente de staging (`stg-api.ecobackend.internal`). O foco esteve nas rotas conversacionais que disparam geração de respostas streaming e consultas RAG.

## Sumário Executivo
- TTFB caiu 42% após ajustes de cache de contexto e pré-cálculo de embeddings.
- TTLC apresentou redução de 37%, impulsionada pela diminuição de tokens totais gerados.
- Volume de RAG retornado por requisição caiu 28%, reduzindo o tempo de serialização e trânsito.

## Métricas
### Linha de Base (02/05/2024)
- TTFB médio: **1.42s**
- TTLC médio: **5.30s**
- Tokens gerados por resposta: **2,980 tokens**
- Volume RAG transferido: **118 KB**
- Requests amostradas: 60 execuções em `/api/v2/chat/stream`

### Pós-Otimizações (16/05/2024)
- TTFB médio: **0.82s**
- TTLC médio: **3.34s**
- Tokens gerados por resposta: **2,040 tokens**
- Volume RAG transferido: **85 KB**
- Requests amostradas: 60 execuções em `/api/v2/chat/stream`

### Tabela Comparativa
| Métrica | Baseline (02/05) | Pós (16/05) | Variação |
| --- | --- | --- | --- |
| TTFB | 1.42s | 0.82s | -42% |
| TTLC | 5.30s | 3.34s | -37% |
| Tokens / resposta | 2,980 | 2,040 | -32% |
| Volume RAG (KB) | 118 | 85 | -28% |

## Observações e Próximos Passos
- Cache incremental do `ModuleStore` eliminou leituras redundantes de disco e reduziu 180 ms por requisição.
- Reordenação das políticas de contexto minimizou anexos de módulos de baixa relevância, diminuindo o total de tokens processados.
- Ajustes na serialização da camada RAG reduziram payloads repetidos enviados ao cliente.
- Recomenda-se monitorar continuamente a regressão de TTFB acima de 1.0s e acionar revisão do pipeline de embeddings caso TTLC ultrapasse 4.0s por 3 ciclos consecutivos.

### Notas sobre implementação
```ts
// LATENCY: Ajustar pré-carregamento de embeddings para evitar TTFB acima de 1s.
// LATENCY: Priorizar módulos essenciais na montagem do contexto para manter tokens abaixo de 2.2k.
```
