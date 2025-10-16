-- Views de apoio ao Metabase para o pipeline de analytics da ECO.
-- Este arquivo não recria tabelas existentes; apenas expõe projeções read-only
-- e agregados opcionais para consumo via Supabase REST v2.

create schema if not exists analytics;

-- Views recentes (últimos 90 dias)
create or replace view analytics.v_feedback_recent as
select
  created_at,
  vote,
  reason,
  source,
  session_id,
  interaction_id,
  user_id
from analytics.eco_feedback
where created_at >= now() - interval '90 days';

create or replace view analytics.v_interactions_recent as
select
  created_at,
  id as interaction_id,
  user_id,
  session_id,
  message_id,
  tokens_in,
  tokens_out,
  latency_ms,
  prompt_hash,
  module_combo
from analytics.eco_interactions
where created_at >= now() - interval '90 days';

create or replace view analytics.v_latency_recent as
select
  created_at,
  response_id,
  ttfb_ms,
  ttlc_ms,
  tokens_total
from analytics.latency_samples
where created_at >= now() - interval '90 days';

-- Índices para acelerar consultas por data recente
create index if not exists eco_feedback_created_at_idx on analytics.eco_feedback (created_at desc);
create index if not exists eco_interactions_created_at_idx on analytics.eco_interactions (created_at desc);
create index if not exists latency_samples_created_at_idx on analytics.latency_samples (created_at desc);

-- Materialized view opcional para agregações de latência em 7 dias.
create materialized view if not exists analytics.mv_latency_agg_7d as
select
  date_trunc('day', created_at) as day,
  count(*) as samples,
  avg(ttfb_ms) as avg_ttfb_ms,
  percentile_cont(0.5) within group (order by ttfb_ms) as median_ttfb_ms,
  avg(ttlc_ms) as avg_ttlc_ms,
  percentile_cont(0.5) within group (order by ttlc_ms) as median_ttlc_ms,
  avg(tokens_total) as avg_tokens_total
from analytics.latency_samples
where created_at >= now() - interval '7 days'
group by day
order by day desc;

comment on materialized view analytics.mv_latency_agg_7d is
  'Aggregated latency metrics (avg/median) for the last 7 days. Refresh manually after ETL runs.';

-- Observação sobre segurança futura
comment on schema analytics is
  'Schema destinado a métricas operacionais (RLS desabilitado). Caso métricas precisem ser expostas ao front, criar views em public com security_invoker e RLS.';
