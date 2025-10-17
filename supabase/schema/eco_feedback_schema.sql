create schema if not exists analytics;

create type if not exists analytics.eco_feedback_vote as enum ('up', 'down');

create table if not exists analytics.eco_interactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid,
    session_id text,
    message_id text,
    prompt_hash text,
    module_combo text[],
    tokens_in int,
    tokens_out int,
    latency_ms int,
    created_at timestamptz not null default now()
);

create table if not exists analytics.eco_feedback (
    id uuid primary key default gen_random_uuid(),
    interaction_id uuid references analytics.eco_interactions (id) on delete cascade,
    user_id uuid,
    session_id text,
    vote analytics.eco_feedback_vote not null,
    reason text[],
    source text,
    meta jsonb,
    created_at timestamptz not null default now()
);

create table if not exists analytics.eco_passive_signals (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    interaction_id uuid not null references analytics.eco_interactions (id) on delete cascade,
    signal text not null,
    meta jsonb not null default '{}'::jsonb
);

create table if not exists analytics.eco_bandit_arms (
    arm_key text primary key,
    pulls bigint not null default 0,
    alpha float8 not null default 1,
    beta float8 not null default 1,
    reward_sum float8 not null default 0,
    reward_sq_sum float8 not null default 0,
    last_update timestamptz not null default now()
);

create table if not exists analytics.eco_module_usages (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    interaction_id uuid not null references analytics.eco_interactions (id) on delete cascade,
    module_key text not null,
    tokens int,
    position int
);

create table if not exists analytics.eco_policy_config (
    key text primary key,
    tokens_budget int,
    config jsonb,
    updated_at timestamptz not null default now()
);

create index if not exists eco_feedback_interaction_idx on analytics.eco_feedback (interaction_id);
create index if not exists eco_interactions_created_idx on analytics.eco_interactions (created_at desc);
create index if not exists eco_passive_signals_interaction_idx on analytics.eco_passive_signals (interaction_id);
create index if not exists eco_module_usages_interaction_idx on analytics.eco_module_usages (interaction_id);

create or replace view analytics.vw_interactions as
select
  id,
  created_at,
  user_id,
  session_id,
  message_id,
  tokens_in,
  tokens_out,
  latency_ms,
  coalesce(array_length(module_combo, 1), 0) as modules_count
from analytics.eco_interactions;

create or replace view analytics.vw_module_usages as
select
  u.created_at,
  u.interaction_id,
  u.module_key,
  u.tokens,
  u.position
from analytics.eco_module_usages u;

create or replace view analytics.vw_bandit_rewards as
select
  created_at,
  response_id,
  pilar,
  arm,
  recompensa
from analytics.bandit_rewards;

grant usage on schema analytics to service_role;
grant select, insert, update, delete on all tables in schema analytics to service_role;
