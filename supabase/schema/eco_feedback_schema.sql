create type if not exists eco_feedback_vote as enum ('up', 'down');

create table if not exists eco_interactions (
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

create table if not exists eco_feedback (
    id uuid primary key default gen_random_uuid(),
    interaction_id uuid references eco_interactions (id) on delete set null,
    user_id uuid,
    session_id text,
    vote eco_feedback_vote not null,
    reason text[],
    source text,
    meta jsonb,
    created_at timestamptz not null default now()
);

create table if not exists eco_passive_signals (
    id uuid primary key default gen_random_uuid(),
    interaction_id uuid references eco_interactions (id) on delete set null,
    signal text,
    value float8,
    created_at timestamptz not null default now()
);

create table if not exists eco_bandit_arms (
    arm_key text primary key,
    pulls bigint not null default 0,
    alpha float8 not null default 1,
    beta float8 not null default 1,
    reward_sum float8 not null default 0,
    reward_sq_sum float8 not null default 0,
    last_update timestamptz not null default now()
);

create table if not exists eco_module_usages (
    id uuid primary key default gen_random_uuid(),
    interaction_id uuid references eco_interactions (id) on delete cascade,
    module_key text,
    tokens int,
    position int,
    created_at timestamptz not null default now()
);

create table if not exists eco_policy_config (
    key text primary key,
    tokens_budget int,
    config jsonb,
    updated_at timestamptz not null default now()
);

create index if not exists eco_feedback_interaction_idx on eco_feedback (interaction_id);
create index if not exists eco_passive_signals_interaction_idx on eco_passive_signals (interaction_id);
create index if not exists eco_module_usages_interaction_idx on eco_module_usages (interaction_id);
