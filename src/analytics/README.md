# Persistência Analítica

`store.ts` centraliza gravações no schema `analytics` da Supabase. As funções recebem objetos simples e realizam inserts batelados (quando aplicável) para as tabelas `resposta_q`, `module_outcomes`, `bandit_rewards`, `knapsack_decision` e `latency_samples`.

As credenciais são lidas de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Em ambientes sem essas variáveis os inserts viram no-op com logs de aviso.
