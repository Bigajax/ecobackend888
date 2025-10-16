create schema if not exists analytics;

create type if not exists analytics.eco_feedback_vote as enum ('up', 'down');

create table if not exists analytics.eco_interactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid,
    session_id text,
    message_id text unique,
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
    interaction_id uuid references analytics.eco_interactions (id) on delete cascade,
    user_id uuid,
    session_id text,
    signal text,
    value float8,
    meta jsonb,
    created_at timestamptz not null default now()
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
    interaction_id uuid references analytics.eco_interactions (id) on delete cascade,
    module_key text,
    session_id text,
    tokens int,
    position int,
    created_at timestamptz not null default now()
);

alter table if exists analytics.eco_module_usages
  add column if not exists session_id text;

create table if not exists analytics.eco_policy_config (
    key text primary key,
    tokens_budget int,
    config jsonb,
    updated_at timestamptz not null default now()
);

create index if not exists eco_feedback_interaction_idx on analytics.eco_feedback (interaction_id);
create index if not exists eco_passive_signals_interaction_idx on analytics.eco_passive_signals (interaction_id);
create index if not exists eco_module_usages_interaction_idx on analytics.eco_module_usages (interaction_id);

create or replace view analytics.eco_bandit_feedback_rewards as
select
    coalesce(nullif(array_to_string(i.module_combo, '||'), ''), '__empty__') as arm_key,
    i.module_combo,
    array_to_string(i.module_combo, '||') as module_combo_key,
    count(*)::bigint as feedback_count,
    sum(case when f.vote = 'up' then 1 else 0 end)::bigint as reward_sum,
    sum(case when f.vote = 'up' then 1 else 0 end)::bigint as reward_sq_sum
from analytics.eco_feedback f
join analytics.eco_interactions i on i.id = f.interaction_id
where i.module_combo is not null
group by i.module_combo;
