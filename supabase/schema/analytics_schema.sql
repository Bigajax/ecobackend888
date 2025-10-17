create schema if not exists analytics;

comment on schema analytics is 'Operational analytics for ECO';

create table if not exists analytics.resposta_q (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    response_id uuid,
    user_id uuid,
    retrieve_mode text check (retrieve_mode in ('FAST','DEEP')),
    q numeric check (q between 0 and 1),
    estruturado_ok boolean,
    memoria_ok boolean,
    bloco_ok boolean,
    tokens_total int,
    tokens_aditivos int,
    ttfb_ms int,
    ttlc_ms int
);

comment on table analytics.resposta_q is 'Quality assessment snapshots for ECO responses';
comment on column analytics.resposta_q.response_id is 'Foreign key to eco responses (nullable for offline tests)';
comment on column analytics.resposta_q.user_id is 'User identifier for aggregation';
comment on column analytics.resposta_q.retrieve_mode is 'Memory retrieval strategy used for the response';
comment on column analytics.resposta_q.q is 'Composite quality score in [0,1]';
comment on column analytics.resposta_q.estruturado_ok is 'True when the final answer respected the required structure';
comment on column analytics.resposta_q.memoria_ok is 'True when cited memories were referenced in the answer';
comment on column analytics.resposta_q.bloco_ok is 'True when a technical block was produced under high intensity';
comment on column analytics.resposta_q.tokens_total is 'Total tokens consumed in the response';
comment on column analytics.resposta_q.tokens_aditivos is 'Tokens allocated to additive modules';
comment on column analytics.resposta_q.ttfb_ms is 'Time to first byte in milliseconds';
comment on column analytics.resposta_q.ttlc_ms is 'Time to last chunk in milliseconds';

create index if not exists resposta_q_created_at_idx on analytics.resposta_q (created_at);
create index if not exists resposta_q_user_id_idx on analytics.resposta_q (user_id);
create index if not exists resposta_q_retrieve_mode_idx on analytics.resposta_q (retrieve_mode);

create table if not exists analytics.module_outcomes (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    response_id uuid,
    module_id text,
    tokens int,
    q numeric,
    vpt numeric
);

comment on table analytics.module_outcomes is 'Per-module contribution metrics for additive building blocks';
comment on column analytics.module_outcomes.response_id is 'Link to the originating response';
comment on column analytics.module_outcomes.module_id is 'Identifier for the module variant executed';
comment on column analytics.module_outcomes.tokens is 'Token cost of the module';
comment on column analytics.module_outcomes.q is 'Quality score observed for the response when this module was active';
comment on column analytics.module_outcomes.vpt is 'Value per token, derived from quality score and usage';

create index if not exists module_outcomes_module_id_created_at_idx
    on analytics.module_outcomes (module_id, created_at desc);

create table if not exists analytics.bandit_rewards (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    response_id uuid,
    pilar text,
    arm text,
    recompensa numeric
);

alter table analytics.bandit_rewards drop constraint if exists bandit_rewards_pilar_check;
alter table analytics.bandit_rewards drop constraint if exists bandit_rewards_arm_check;

comment on table analytics.bandit_rewards is 'Rewards observed for Thompson sampling bandits';
comment on column analytics.bandit_rewards.response_id is 'Link to the originating response';
comment on column analytics.bandit_rewards.pilar is 'Bandit pillar deciding stylistic variants';
comment on column analytics.bandit_rewards.arm is 'Selected arm for the pillar';
comment on column analytics.bandit_rewards.recompensa is 'Reward applied to update the bandit posterior';

create index if not exists bandit_rewards_pilar_arm_created_at_idx
    on analytics.bandit_rewards (pilar, arm, created_at desc);

create unique index if not exists bandit_rewards_response_arm_uidx
    on analytics.bandit_rewards (response_id, arm);

create table if not exists analytics.knapsack_decision (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    response_id uuid,
    budget int,
    adotados jsonb,
    ganho_estimado numeric,
    tokens_aditivos int
);

comment on table analytics.knapsack_decision is 'Decisions taken by the additive module knapsack optimizer';
comment on column analytics.knapsack_decision.response_id is 'Link to the originating response';
comment on column analytics.knapsack_decision.budget is 'Token budget available for additive modules';
comment on column analytics.knapsack_decision.adotados is 'JSON array with adopted module identifiers';
comment on column analytics.knapsack_decision.ganho_estimado is 'Estimated marginal quality gain';
comment on column analytics.knapsack_decision.tokens_aditivos is 'Total tokens allocated to additive modules';

create index if not exists knapsack_decision_created_at_idx
    on analytics.knapsack_decision (created_at desc);

create table if not exists analytics.latency_samples (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    response_id uuid,
    ttfb_ms int,
    ttlc_ms int,
    tokens_total int
);

comment on table analytics.latency_samples is 'Latency traces for ECO responses';
comment on column analytics.latency_samples.response_id is 'Link to the originating response';
comment on column analytics.latency_samples.ttfb_ms is 'Time to first byte in milliseconds';
comment on column analytics.latency_samples.ttlc_ms is 'Time to last chunk in milliseconds';
comment on column analytics.latency_samples.tokens_total is 'Total tokens consumed by the request';
