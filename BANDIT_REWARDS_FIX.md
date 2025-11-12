# Fix Bandit Rewards Schema Issue

## Problem Summary

The `bandit_rewards` table had two conflicting schema definitions:

1. **`analytics_schema.sql`** (legacy): Missing `interaction_id` column
2. **`eco_feedback_schema.sql`** (current): Has `interaction_id` column

This caused the error:
```
feedback.bandit_reward_failed - "Could not find the 'interaction_id' column of 'bandit_rewards' in the schema cache"
```

## Root Cause

The old definition in `analytics_schema.sql` was creating a table without the `interaction_id` column, which conflicted with the new feedback controller trying to insert records with that column.

## Solution

A migration has been created (`20251111_fix_bandit_rewards_schema.sql`) that:

1. ✅ Drops the old conflicting table
2. ✅ Creates the correct table schema with `interaction_id`
3. ✅ Creates proper indexes and unique constraints
4. ✅ Recreates dependent views (`eco_bandit_feedback_rewards`, `vw_bandit_rewards`)
5. ✅ Sets proper permissions

The old definition in `analytics_schema.sql` has been removed to prevent future conflicts.

## How to Apply

### Method 1: Using Supabase CLI (Recommended)

```bash
cd C:\Users\Rafael\Desktop\ecofrontend\ecobackend888
supabase migration up
```

### Method 2: Manual Execution via Supabase Dashboard

1. Go to **Supabase Dashboard** → Your Project → **SQL Editor**
2. Create a new query and paste the contents of:
   ```
   supabase/migrations/20251111_fix_bandit_rewards_schema.sql
   ```
3. Click **Run** to execute

### Method 3: Direct Database Connection

If you have `psql` installed:

```bash
psql "your_supabase_connection_string" -f "supabase/migrations/20251111_fix_bandit_rewards_schema.sql"
```

## Verification

After applying the migration, test the feedback endpoint:

```bash
curl -X POST http://localhost:3001/api/feedback \
  -H "Content-Type: application/json" \
  -H "X-Eco-Guest-Id: test-guest-123" \
  -d '{
    "interaction_id": "3327d3f4-4b1c-48fd-aa53-b754395ca01d",
    "vote": "up",
    "pillar": "geral",
    "arm": "baseline"
  }'
```

Expected response: **204 No Content** ✅

Or check the logs:
```bash
# Should see
[info] feedback.bandit_reward_recorded
```

Instead of:
```bash
# Old error
[error] feedback.bandit_reward_failed - "CHECK constraint violated"
```

## Files Changed

- ✏️ `supabase/migrations/20251111_fix_bandit_rewards_schema.sql` - Created new migration
- ✏️ `supabase/schema/analytics_schema.sql` - Removed conflicting definition
- ✏️ `supabase/schema/eco_feedback_schema.sql` - Kept as source of truth

## Important Notes

⚠️ **This migration DROPS and RECREATES the table**, which will:
- Delete any existing feedback data in `bandit_rewards`
- Reset all bandit arm probabilities
- Not affect `eco_feedback` or `eco_interactions` tables

If you have valuable historical data, backup first:

```sql
-- Backup existing data
CREATE TABLE analytics.bandit_rewards_backup AS
SELECT * FROM analytics.bandit_rewards;
```

## Troubleshooting

### If the migration fails with "table does not exist":
- Run it again, it's idempotent (DROP IF EXISTS handles this)

### If you still see constraint errors:
- Verify the migration was actually applied by checking:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'analytics'
  AND table_name = 'bandit_rewards'
  ORDER BY ordinal_position;
  ```
  Should show: `id, response_id, interaction_id, pilar, arm, recompensa, created_at`

### If feedback endpoint still fails:
- Check Supabase schema cache was refreshed (views were dropped/recreated)
- Restart your backend server: `npm run dev`

## Related Issues

- Issue #1: Schema cache not recognizing `interaction_id` column
- Issue #2: Check constraint `bandit_rewards_pilar_check` rejecting valid values
- Issue #3: Duplicate view definitions causing conflicts

All resolved by this migration! ✅
