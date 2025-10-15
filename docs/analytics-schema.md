# Schema `analytics`

O schema `analytics` concentra métricas operacionais para a IA ECO. O objetivo é permitir análises agregadas sem impactar o fluxo transacional do chat.

## Estrutura das tabelas

- **`analytics.resposta_q`** – Snapshot de qualidade por resposta.
  - Campos principais: `response_id`, `user_id`, `retrieve_mode`, `q`, `estruturado_ok`, `memoria_ok`, `bloco_ok`, `tokens_total`, `tokens_aditivos`, `ttfb_ms`, `ttlc_ms`.
  - Índices: `created_at`, `user_id`, `retrieve_mode` para facilitar cortes temporais e por usuário.
- **`analytics.module_outcomes`** – Métrica de VPT (valor por token) de cada módulo aditivo adotado.
  - Índice composto (`module_id`, `created_at desc`) permite listas top/bottom por módulo.
- **`analytics.bandit_rewards`** – Histórico de recompensas aplicadas aos bandits de Thompson.
  - Índice (`pilar`, `arm`, `created_at desc`) suporta análises de win-rate por combinação.
- **`analytics.knapsack_decision`** – Registros do otimizador guloso indicando quais módulos entraram no prompt.
  - Índice em `created_at desc` facilita auditorias recentes.
- **`analytics.latency_samples`** – Amostras de latência (TTFB/TTLC) correlacionadas com o volume de tokens.

> **RLS:** não habilitado. O schema é usado apenas por processos internos de analytics com credenciais de serviço.

## Retenção sugerida

- `resposta_q` e `latency_samples`: manter 90 dias (dados usados em tendências e alertas operacionais).
- `module_outcomes`, `bandit_rewards`, `knapsack_decision`: 180 dias para alimentar tuning de módulos/bandits.

## Como aplicar o schema

1. Garanta que as variáveis de ambiente `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_URL` estejam configuradas na CLI.
2. Execute no terminal:
   ```bash
   psql "$SUPABASE_URL" < supabase/schema/analytics_schema.sql
   ```
   ou, via Supabase CLI:
   ```bash
   supabase db push --file supabase/schema/analytics_schema.sql
   ```
3. Verifique no painel do Supabase se as tabelas e índices foram criados.
