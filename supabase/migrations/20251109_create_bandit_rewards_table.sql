-- Create bandit_rewards table for storing feedback reward data
-- Referenced by vw_bandit_rewards view and used by feedback system

create table if not exists analytics.bandit_rewards (
    id uuid primary key default gen_random_uuid(),
    response_id text not null,
    interaction_id uuid references analytics.eco_interactions (id) on delete cascade,
    pilar text not null,
    arm text not null,
    recompensa numeric not null,
    created_at timestamptz not null default now()
);

-- Create indexes for common queries
create index if not exists bandit_rewards_response_id_idx on analytics.bandit_rewards (response_id);
create index if not exists bandit_rewards_arm_idx on analytics.bandit_rewards (arm);
create index if not exists bandit_rewards_created_at_idx on analytics.bandit_rewards (created_at desc);

-- Grant permissions to service role
grant select, insert, update, delete on analytics.bandit_rewards to service_role;
