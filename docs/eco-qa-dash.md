# Eco QA Dashboard

Referência de consultas para montar o painel operacional de qualidade.

## Métricas principais

### Q médio (24h/7d) + RetrieveMode

```sql
with base as (
  select
    date_trunc('hour', created_at) as hora,
    retrieve_mode,
    q,
    tokens_total
  from analytics.resposta_q
  where created_at >= now() - interval '7 day'
)
select
  case when hora >= now() - interval '24 hour' then '24h' else '7d' end as janela,
  retrieve_mode,
  avg(q) as q_medio,
  avg(tokens_total) as tokens_medio,
  count(*) as conversas
from base
group by 1, 2
order by 1, 2;
```

### VPT por módulo (top ↑/↓)

```sql
with module_vpt as (
  select
    module_id,
    avg(q / nullif(tokens, 0)) as vpt,
    count(*) as usos,
    percentile_disc(0.5) within group (order by q / nullif(tokens, 0)) as mediana
  from analytics.module_outcomes
  where created_at >= now() - interval '7 day'
  group by module_id
)
select *
from module_vpt
where usos >= 20
order by vpt desc
limit 10;

-- bottom 10
select *
from module_vpt
where usos >= 20
order by vpt asc
limit 10;
```

### Win-rate dos bandits (7d)

```sql
select
  pilar,
  arm,
  count(*) as jogadas,
  avg(case when recompensa > 0 then 1 else 0 end) as win_rate,
  avg(recompensa) as recompensa_media
from analytics.bandit_rewards
where created_at >= now() - interval '7 day'
group by 1, 2
order by pilar, win_rate desc;
```

### ΔQ/ΔT por mudança de budget

```sql
with eventos as (
  select
    date_trunc('day', kd.created_at) as dia,
    kd.budget,
    avg(rq.q) as q_medio,
    avg(rq.tokens_aditivos) as tokens_aditivos
  from analytics.knapsack_decision kd
  join analytics.resposta_q rq on kd.response_id = rq.response_id
  where kd.created_at >= now() - interval '30 day'
  group by dia, kd.budget
)
select
  dia,
  budget,
  q_medio,
  tokens_aditivos,
  q_medio - lag(q_medio) over (partition by budget order by dia) as delta_q,
  tokens_aditivos - lag(tokens_aditivos) over (partition by budget order by dia) as delta_tokens
from eventos
order by dia desc, budget;
```

### p95 TTFB/TTLC vs tokens_total

```sql
select
  width_bucket(tokens_total, 0, 1600, 8) as faixa_tokens,
  percentile_cont(0.95) within group (order by ttfb_ms) as ttfb_p95,
  percentile_cont(0.95) within group (order by ttlc_ms) as ttlc_p95,
  avg(tokens_total) as tokens_medio,
  count(*) as n
from analytics.latency_samples
where created_at >= now() - interval '7 day'
group by faixa_tokens
order by faixa_tokens;
```

## Alertas operacionais

Implementar na ferramenta de monitoramento preferida (ex.: Metabase/Looker/Chronograf) usando consultas acima:

1. **Queda de Q:** acionar alerta quando `Q_24h < Q_7d - 0.03`.
2. **TTLC p95 deteriorado:** acionar quando `TTLC_p95_24h > TTLC_p95_7d * 1.10`.
3. **Memória não citada:** acionar quando `memoria_ok_24h < 0.85`.

Consulta auxiliar para `memoria_ok`:

```sql
select
  case when created_at >= now() - interval '24 hour' then '24h' else '7d' end as janela,
  avg(case when memoria_ok then 1 else 0 end) as memoria_ok
from analytics.resposta_q
where created_at >= now() - interval '7 day'
group by 1;
```

## Conexão no Metabase (Supabase Postgres)

1. Em **Administração → Databases**, escolha **Add database**.
2. Tipo: **Postgres**.
3. Hostname: `db.<project>.supabase.co` (substitua pelo host do projeto).
4. Porta: `6543` (pooler de leitura/escrita com SSL obrigatório).
5. Database name: valor exibido no painel Supabase (normalmente `postgres`).
6. Username/Password: usar credenciais de serviço (recomendado gerar usuário somente leitura).
7. SSL: **Require SSL** (Metabase detecta automaticamente, mas valide em *Advanced → SSL Mode*).
8. Teste a conexão; após salvar, sincronize e habilite a coleta de estatísticas para o schema `analytics`.
