-- Create view for banditRewardsSync to aggregate feedback rewards
-- This view aggregates feedback data from bandit_rewards table
-- and provides metrics needed to update eco_bandit_arms

create or replace view analytics.eco_bandit_feedback_rewards as
select
  arm as arm_key,
  sum(case when recompensa >= 0.5 then 1 else 0 end)::bigint as feedback_count,
  sum(recompensa)::numeric as reward_sum,
  sum(recompensa * recompensa)::numeric as reward_sq_sum
from analytics.bandit_rewards
group by arm;

-- Grant permissions for service_role to query this view
grant select on analytics.eco_bandit_feedback_rewards to service_role;
