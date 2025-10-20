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

## Shadow smoke validation

Run the shadow smoke helper to simulate guest conversations without touching real providers:

```bash
npm run shadow:smoke
```

This command forces `ECO_BANDIT_SHADOW=1`, mocks Claude responses, and prints structured selector logs for three sample interactions. The script exits with code 1 if any family lacks an eligible arm or if the knapsack ever exceeds the configured budget, making it safe to wire into CI.
