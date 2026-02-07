# TEST A1: Feedback Endpoint + Database Inserts Verification

## 🎯 What This Test Does

Tests the **complete feedback collection pipeline**:
1. ✅ POST to `/api/ask-eco` (generate a response)
2. ✅ Extract `interaction_id` from response
3. ✅ POST to `/api/feedback` (submit vote)
4. ✅ Verify inserts in `eco_feedback` and `bandit_rewards` tables

## 📋 Prerequisites

### Required
- ✅ Server running on `localhost:3001` (or set `API_URL` env var)
- ✅ Supabase database accessible

### Optional (for full verification)
- 🟡 Supabase credentials (to verify database inserts)
  - `SUPABASE_URL`: Your Supabase project URL
  - `SERVICE_ROLE_KEY`: Your Supabase service role key

## 🚀 How to Run

### Option 1: Simple (No Database Verification)

```bash
# Make script executable
chmod +x test-feedback-a1.sh

# Run test
./test-feedback-a1.sh
```

**Output**:
- ✅ Two test interactions created
- ✅ Two feedback votes submitted (UP and DOWN)
- ✅ Shows `interaction_id` values you can use for manual DB queries

### Option 2: Full (With Database Verification)

```bash
# Set your Supabase credentials
export SUPABASE_URL="https://your-project.supabase.co"
export SERVICE_ROLE_KEY="eyJxx..."

# Run test
./test-feedback-a1.sh
```

**Output**:
- ✅ Same as above, plus
- ✅ Automatic database queries showing feedback records
- ✅ Shows which modules were used (via `eco_module_usages`)
- ✅ Shows arm inference results

### Option 3: Manual Testing (curl)

If you prefer to test manually:

```bash
# 1. Generate a response
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Olá, como você está?",
    "client_message_id": "test-'$(date +%s)'"
  }' | tee response.json

# Extract interaction_id from response
# Look for: "interaction_id":"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
INTERACTION_ID="<paste-the-uuid-here>"

# 2. Submit UP vote feedback
curl -X POST http://localhost:3001/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "interaction_id": "'$INTERACTION_ID'",
    "vote": "up",
    "reason": "well_structured",
    "pillar": "clarity"
  }'

# 3. Then run SQL queries (see below)
```

## 📊 Expected Results

### Success Indicators

✅ **Feedback Endpoint Response**
```json
{
  "success": true,
  "message": "Feedback recorded"
}
```

✅ **Database Insert** (check with SQL queries)
- Record appears in `analytics.eco_feedback`
- Record appears in `analytics.bandit_rewards` with reward = ±1
- Module appears in `analytics.eco_module_usages` with position = 1

### What Each Table Shows

| Table | What It Contains | Key Fields |
|-------|------------------|-----------|
| `eco_feedback` | User votes | vote (up/down), reason, pillar, timestamp |
| `bandit_rewards` | Reward signals | arm, reward (±1), interaction_id |
| `eco_module_usages` | Modules used per response | module_key, position, interaction_id |
| `eco_interactions` | Response metadata | message, user_id, guest_id |

## 🔍 Verify Database Inserts

### In Supabase SQL Editor

Copy and run the queries from `test-feedback-queries.sql`:

1. **Most Recent Feedback** (last 10):
```sql
SELECT id, interaction_id, vote, reason, created_at
FROM analytics.eco_feedback
ORDER BY created_at DESC
LIMIT 10;
```

2. **Bandit Rewards** (last 10):
```sql
SELECT id, interaction_id, arm, reward, created_at
FROM analytics.bandit_rewards
ORDER BY created_at DESC
LIMIT 10;
```

3. **Module Usage** (shows which modules were used):
```sql
SELECT interaction_id, module_key, position
FROM analytics.eco_module_usages
WHERE created_at > NOW() - INTERVAL '1 hour'
LIMIT 10;
```

4. **Feedback + Module Join** (see which modules got feedback):
```sql
SELECT
  f.interaction_id,
  f.vote,
  f.created_at,
  STRING_AGG(mu.module_key, ', ') as modules_used
FROM analytics.eco_feedback f
LEFT JOIN analytics.eco_module_usages mu ON f.interaction_id = mu.interaction_id
WHERE f.created_at > NOW() - INTERVAL '1 hour'
GROUP BY f.interaction_id, f.vote, f.created_at
ORDER BY f.created_at DESC;
```

## 🐛 Troubleshooting

### Problem: "Failed to extract interaction_id"
**Cause**: Response format changed or server not responding
**Solution**:
```bash
# Check server is running
curl http://localhost:3001/api/health

# Check response format manually
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}' -v
```

### Problem: Feedback returns 404 "interaction_not_found"
**Cause**: Interaction ID not in database yet
**Solution**:
- Wait a few seconds after response completes
- Check `eco_interactions` table exists and has records
- Verify interaction_id matches exactly (case-sensitive)

### Problem: Feedback returns 400 "missing_vote"
**Cause**: Vote must be "up", "down", "like", or "dislike"
**Solution**:
```bash
# Valid votes
"vote": "up"        # ✅
"vote": "down"      # ✅
"vote": "like"      # ✅ (alias for up)
"vote": "dislike"   # ✅ (alias for down)
```

### Problem: Database shows no records
**Cause**: Analytics table not being populated
**Solutions**:
1. Check Supabase connection (verify RLS policies)
2. Verify service role key has write permissions
3. Check server logs for errors in feedback controller
4. Run: `SELECT * FROM analytics.eco_interactions ORDER BY created_at DESC LIMIT 5;`

## 📝 What Each Feedback Field Does

| Field | Required | Example | Purpose |
|-------|----------|---------|---------|
| `interaction_id` | ✅ Yes | uuid | Links to response |
| `vote` | ✅ Yes | "up" | up/down/like/dislike |
| `reason` | 🟡 Optional | "well_structured" | Why user voted |
| `pillar` | 🟡 Optional | "clarity" | Category of feedback |
| `arm` | 🟡 Optional | "modulos_core/sistema_identidade" | Which module (auto-inferred if missing) |
| `response_id` | 🟡 Optional | uuid | Specific response ID |

## 🔗 Related Files

- `test-feedback-a1.sh` - Main test script
- `test-feedback-queries.sql` - SQL verification queries
- `server/controllers/feedbackController.ts` - Implementation
- `server/routes/feedbackRoutes.ts` - Routes
- `MANIFEST_ARCHITECTURE.md` - System docs

## ✅ Test Checklist

- [ ] Run `./test-feedback-a1.sh` successfully
- [ ] See two `interaction_id` values output
- [ ] See HTTP 200 responses for both feedback submissions
- [ ] Query database and see records in `eco_feedback`
- [ ] See corresponding records in `bandit_rewards` with reward = ±1
- [ ] See modules in `eco_module_usages` table
- [ ] Verify arm inference worked (module_key in position 1)

## 📈 Next Steps After A1

Once A1 is working:
- **A2**: Check if posteriors update in memory (Thompson sampler)
- **A3**: Test if module selection changes after feedback
- **Issues**: Decide if you need to fix reward synchronization issues

## 🆘 Need Help?

Check these files for implementation details:
1. `feedbackController.ts` - How feedback is processed
2. `banditRewardsSync.ts` - How rewards are synced (broken, see Issues)
3. `analyticsStore.ts` - In-memory bandit state
4. `familyBanditPlanner.ts` - Module selection logic

---

**Last Updated**: November 5, 2025
**Status**: Ready to test
