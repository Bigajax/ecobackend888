# Selector + Bandit Rollout

## Overview

The selector pipeline now resolves prompt modules in four explicit stages:

1. **Gates** – legacy rules (`matrizPromptBaseV2`) and contextual flags trim the raw module list.
2. **Family grouping** – the module manifest (`server/assets/modules.manifest.json`) maps every eligible module to a family, including baseline and experiment arms.
3. **Thompson sampling** – per family, the planner draws an arm using the configured Beta priors and cold-start boost before any knapsack budgeting occurs.
4. **Budgeting & stitch** – selected arms flow through the existing VPT knapsack and stitching steps alongside legacy modules.

A simplified data-flow diagram:

```
raw modules -> gates -> manifest families -> TS pick -> knapsack -> stitch -> system prompt
```

The manifest is loaded once at boot (`moduleManifest.ts`), validated with zod, and mirrored in the context builder via `banditPlan` debug snapshots.

## Manifest cheatsheet

* Location: `server/assets/modules.manifest.json`
* Defaults: `window_days`, `alpha_prior`, `beta_prior`, `cold_start_boost`, `max_aux_tokens`
* Families: `linguagem`, `encerramento`, `modulacao`, `estrutura_resposta`, `vulnerabilidade`
* Each module entry exposes `family`, `role`, `size`, `tokens_avg`, optional gates, dependencies and excludes.

To inspect the manifest at runtime:

```bash
npm run modules:dump
```

## Feature flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `ECO_BANDIT_SHADOW` | `1` | Log-only mode (no prompt changes). |
| `ECO_BANDIT_EARLY` | `0` | Enables pilot traffic split. |
| `ECO_BANDIT_PILOT_PERCENT` | `10` | % of conversations sent through Thompson sampling when EARLY=1. |
| `ECO_KNAPSACK_BUDGET_TOKENS` | — | Overrides manifest budget cap when set. |

Shadow mode keeps legacy behaviour while emitting `selector_stage` logs for validation. Disable shadow (`0`) to activate swaps globally, or toggle EARLY for partial rollout.

## Reward formulas

Composite rewards are computed in the finalizer per family:

* `emotional_engagement = 0.5·like + 0.4·intensity_flag + 0.1·reply_within_10m`
* `clarity_engagement = 0.7·like + 0.3·reply_within_10m`
* `memory_efficiency = max(0, 0.5·like + 0.5·memory_saved − penalty)` (penalty kicks in when tokens exceed `max_aux_tokens`)
* `dialogue_continuation = 1.0·reply_within_10m`
* `like_bias = 1.0·like`

Where `intensity_flag` comes from the technical block (`intensidade >= 7`). Cold-start exploration applies a +0.35 draw boost until 20 samples per arm.

Every interaction persists a detailed record (`bandit_rewards`) with the family, arm, reward key, chosen source (`ts` or `baseline`), composite reward, token usage, latency and qualitative flags.

### Reward signals & fallbacks

* Rewards are now clamped to `[0, 1]` and recorded alongside `reward_reason`.
* When any required signal is missing (e.g. no latency → `reply_within_10m` undefined, or no implicit like score), the reward defaults to `0` with `reward_reason="missing_signals"` so dashboards can filter them out.
* Memory-heavy answers incur a fixed `0.15` penalty whenever the selected arm exceeds the active token cap (`ECO_KNAPSACK_BUDGET_TOKENS` or the manifest default).
* Each row also captures `tokens_cap`, `tokens_planned`, `like_source`, user/guest ids and a `meta` JSON payload containing the cold-start flag, TS pick, baseline arm and whether a penalty fired.

## 14-day posterior window

`qualityAnalyticsStore` now hydrates Beta posteriors by querying `analytics.bandit_rewards` for the last 14 days (supporting both the legacy `pilar/arm` columns and the new `family/arm_id` aliases). Updates reuse the same sliding window in-memory, so restarts or cache misses never double-count old samples.

Use `qualityAnalyticsStore.dumpBanditPosteriors()` in a REPL to inspect `{ family, arm_id, alpha, beta, samples, mean_reward }` for each arm and confirm the sliding window behaves as expected.

## Cold-start strategy

Arms with fewer than 20 samples continue to receive the configured cold-start boost (`defaults.cold_start_boost`, 0.35 by default). The planner annotates each decision with `cold_start` in the `meta` blob so operators can correlate elevated rewards with early exploration.

## Logging

`getEcoResponse` now emits structured logs:

* `selector_stage="gates"` – raw vs allowed module counts.
* `selector_stage="family_group"` – per-family eligible arms.
* `selector_stage="ts_pick"` – Thompson sample, alpha/beta, reward key and tokens.
* `selector_stage="knapsack"` – aux token plan vs cap.
* `selector_stage="stitch"` – final module list.
* `selector_stage="rpc"` – memory fetch source (`live`, `cache`, `empty`).

These logs replace ad-hoc debug prints and allow quick verification during shadow rollout.

## QA plan

1. **Shadow validation** – keep `ECO_BANDIT_SHADOW=1`, send traffic, confirm logs show `family_group` + `ts_pick` decisions without prompt changes.
2. **Pilot smoke test** – set `ECO_BANDIT_EARLY=1`, `ECO_BANDIT_PILOT_PERCENT=10`, ensure only ~10% of requests swap arms and the `bandit_rewards` table stores detailed rows.
3. **RPC fallback** – simulate Supabase timeouts; verify logs show `rpc` stage with `cache`/`empty`, and prompts still build via cached memories.
4. **Budget guard** – enforce a small `ECO_KNAPSACK_BUDGET_TOKENS`, confirm knapsack log reports `within_cap: true` and trimmed modules.
5. **CLI sanity** – run `npm run modules:dump` to inspect manifest families and enabled arms.
6. **Posterior dump** – call `qualityAnalyticsStore.dumpBanditPosteriors()` (e.g., in a REPL) to confirm Beta parameters respect the 14-day window.

Rollback remains instant: set `ECO_BANDIT_EARLY=0` to revert to baseline behaviour.

## New Arms (referencing Identity)

| Family | Arm | Size | tokens_avg | reward_key | Gate |
| --- | --- | --- | --- | --- | --- |
| linguagem | LINGUAGEM_NATURAL_guided.txt | M | 320 | clarity_engagement | open ≥1 |
| linguagem | LINGUAGEM_NATURAL_micro.txt | S | 190 | clarity_engagement | open ≥1 |
| linguagem | LINGUAGEM_NATURAL_rules_v2.txt | M | 300 | clarity_engagement | open ≥1 |
| estrutura_resposta | ECO_ESTRUTURA_com_exemplos.txt | M | 310 | clarity_engagement | open ≥1 |
| estrutura_resposta | ECO_ESTRUTURA_ultra_min.txt | S | 180 | clarity_engagement | open ≥1 |
| modulacao | MODULACAO_calma_objetiva.txt | M | 250 | like_bias | open ≥1 |
| modulacao | MODULACAO_direta_brief.txt | S | 190 | like_bias | open ≥1 |
| encerramento | ENCERRAMENTO_mini_acao.txt | S | 170 | dialogue_continuation | open ≥1 |
| encerramento | ENCERRAMENTO_soft_prompt.txt | S | 180 | dialogue_continuation | open ≥1 |
| vulnerabilidade | eco_vulnerabilidade_micro_presenca.txt | S | 180 | emotional_engagement | vulnerability ≥2 |
| vulnerabilidade | eco_vulnerabilidade_micro_reframe.txt | S | 180 | emotional_engagement | vulnerability ≥2 |

These arms respect the fixed IDENTIDADE/guardrails and focus on phrasing, structure, modulation, closure, or vulnerability cues.

## Shadow smoke validation

Run the shadow smoke helper to simulate guest conversations without touching real providers:

```bash
npm run shadow:smoke
```

This command forces `ECO_BANDIT_SHADOW=1`, mocks Claude responses, and prints structured selector logs for three sample interactions. The script exits with code 1 if any family lacks an eligible arm or if the knapsack ever exceeds the configured budget, making it safe to wire into CI.

## Pilot smoke validation

To exercise the 10% early rollout path and inspect composite rewards, run:

```bash
npm run pilot:smoke
```

The pilot script disables shadow mode, flips `ECO_BANDIT_EARLY=1`, and forces one of five guest interactions through Thompson sampling. For each family it logs the chosen arm, reward key, composite reward, and Beta parameters, then summarizes per-family averages. The command fails if fewer than 10% of interactions route through `ts`, if rewards stay below 0.4 on average, or if the knapsack exceeds the configured token cap.

## Pilot health check

Run the 24-hour health audit before increasing rollout beyond the pilot split:

```bash
npm run pilot:health -- --window=24h
```

PASS requires, per family (and globally), within the provided window:

1. **Volume** – at least 50 `bandit_rewards` events.
2. **Reward lift** – Thompson-sampled reward-per-100-tokens ≥ baseline × 1.05 (skip the comparison when the baseline metric is 0, unless ≥100 events with TS reward < 0.5).
3. **Latency guard** – Thompson p95 TTLC ≤ baseline p95 × 1.10.
4. **Budget discipline** – cap violation rate ≤ `--tolerate-cap` (defaults to 0%, pass `--tolerate-cap=2` to allow up to 2%).

Sample output:

```json
{
  "window": "24h",
  "families": [
    {
      "family": "estrutura_resposta",
      "events": 132,
      "reward_100t_ts": 1.94,
      "reward_100t_baseline": 1.78,
      "lift_pct": 8.99,
      "p95_ttlc_ts": 2150.32,
      "p95_ttlc_baseline": 2210.87,
      "cap_violation_rate": 0,
      "pass": true,
      "reasons": []
    }
  ],
  "global": {
    "exploration_rate": 0.12,
    "pass": true,
    "reasons": []
  },
  "duration_ms": 318
}
```

Use the results to guide rollouts: `PASS → 30% → 50% → 100%`, rerunning the health check after each 24-hour observation window. A failure prints the same JSON to stderr, sets exit code `1`, and lists the blocking reasons (e.g., `few_events`, `low_lift`, `latency_regression`, `cap_violations`).

## Operator snippet

```bash
npm run pilot:smoke
# Inspect recent rewards and traffic splits
psql ... -c "select * from analytics.v_reward_48h order by reward_avg desc;"
psql ... -c "select * from analytics.v_split_48h;"
# Inspect posterior cache from a REPL
node -e "require('./server/services/analytics/analyticsStore').qualityAnalyticsStore.dumpBanditPosteriors().forEach(console.log)"
```

## Posterior cache

Run the cache snapshotter whenever you need a historical record of the Thompson parameters exposed to Metabase:

```bash
npm run bandit:cache
```

The script loads the manifest, hydrates 14-day posteriors, and inserts a fresh batch into `analytics.bandit_posteriors_cache`.
Schedule it hourly (Render Cron example: `npm run bandit:cache`). Metabase’s “Posterior Drift” card should use:

```sql
select snapshot_at, family, arm_id, mean_reward, samples
from analytics.bandit_posteriors_cache
where snapshot_at > now() - interval '7 days'
order by snapshot_at asc;
```

To double-check the cron freshness without opening Metabase, run:

```bash
npm run cron:self-test
```

The helper exits with status `1` (and prints `posterior_cache_self_test` with `status:"stale"`) when the most recent snapshot is older than two hours.
