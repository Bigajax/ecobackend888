# Analytics Security Hardening Implementation Guide

## Overview

This migration implements comprehensive security hardening for all analytics tables by:
- ✅ Enabling Row Level Security (RLS) on all analytics tables
- ✅ Creating explicit deny-all policies for `anon` and `authenticated` roles
- ✅ Revoking all direct permissions from `anon` and `authenticated`
- ✅ Securing security definer views
- ✅ Maintaining full `service_role` access (backend continues to work normally)

## Files

1. **`20260211_harden_analytics_security.sql`** - Main migration file
2. **`20260211_verify_analytics_security.sql`** - Verification queries
3. **`20260211_rollback_analytics_security.sql`** - Emergency rollback (if needed)
4. **`test_analytics_backend.js`** - Backend integration test script

## Pre-Migration Checklist

- [ ] **Backup Database**: Verify recent Supabase backup exists (automatic, but check)
- [ ] **Review Migration**: Read through `20260211_harden_analytics_security.sql`
- [ ] **Backend Review**: Confirm all analytics writes use `service_role` client
  - Check: `server/services/supabaseClient.ts::getAnalyticsClient()`
  - Check: `server/lib/supabaseAdmin.ts::getSupabaseAdmin()`
- [ ] **Environment Variables**: Ensure `SUPABASE_SERVICE_ROLE_KEY` is configured

## Implementation Steps

### Step 1: Apply Migration

**Option A: Supabase Dashboard (Recommended for first-time)**

1. Go to Supabase Dashboard → SQL Editor
2. Open `20260211_harden_analytics_security.sql`
3. Copy the entire file content
4. Paste into SQL Editor
5. Click "Run" button
6. Verify output shows no errors

**Option B: Supabase CLI**

```bash
# Navigate to project root
cd C:\Users\Rafael\Desktop\ecofrontend\ecobackend888

# Push migration to remote (if using Supabase CLI)
supabase db push

# Or apply migration directly via psql
# psql -h db.xxx.supabase.co -U postgres -d postgres -f supabase/migrations/20260211_harden_analytics_security.sql
```

### Step 2: Run Verification Queries

1. Open `20260211_verify_analytics_security.sql` in Supabase SQL Editor
2. Run each section sequentially
3. Verify expected results (documented in comments)

**Critical Checks:**

```sql
-- Should return 11 tables, all with rls_enabled = true
SELECT schemaname, tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'analytics';

-- Should return EMPTY (no grants for anon/authenticated)
SELECT * FROM information_schema.table_privileges
WHERE table_schema = 'analytics' AND grantee IN ('anon', 'authenticated');

-- Should return 22 policies (2 per table)
SELECT COUNT(*) FROM pg_policies
WHERE schemaname = 'analytics' AND policyname LIKE 'deny_%';
```

### Step 3: Test Backend Functionality

**Run Backend Integration Test:**

```bash
# Navigate to project root
cd C:\Users\Rafael\Desktop\ecofrontend\ecobackend888

# Install dependencies (if needed)
npm install

# Run backend in development mode
npm run dev

# In another terminal, run test script
node supabase/migrations/test_analytics_backend.js
```

**Manual Test Endpoints:**

```bash
# Test conversation analytics (should succeed)
curl -X POST "http://localhost:3001/api/ask-eco" \
  -H "Content-Type: application/json" \
  -H "X-Eco-Guest-Id: test-guest-$(date +%s)" \
  -d '{"mensagemAtual": "olá", "idMensagem": "test-msg-1"}'

# Expected: Response streams successfully, analytics INSERT succeeds

# Test feedback submission (should succeed)
curl -X POST "http://localhost:3001/api/feedback" \
  -H "Content-Type: application/json" \
  -d '{
    "interaction_id": "UUID_FROM_PREVIOUS_TEST",
    "vote": 1,
    "reason": "helpful"
  }'

# Expected: 200 OK

# Test passive signal (should succeed)
curl -X POST "http://localhost:3001/api/signal" \
  -H "Content-Type: application/json" \
  -H "X-Eco-Guest-Id: test-guest-12345" \
  -d '{
    "interaction_id": "UUID_FROM_PREVIOUS_TEST",
    "signal_name": "scroll_reached_bottom"
  }'

# Expected: 200 OK
```

### Step 4: Test Client Lockdown (PostgREST API)

**Important:** This should FAIL (403/401 or empty array) - that's the expected behavior!

```bash
# Attempt to read analytics.eco_interactions with anon key (should FAIL)
curl -X GET "https://YOUR_PROJECT.supabase.co/rest/v1/eco_interactions?select=*&limit=1" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY"

# Expected: {"code":"42501","message":"permission denied for table eco_interactions"}
# OR: [] (empty array if RLS blocks all rows)

# Attempt with authenticated JWT (should also FAIL)
curl -X GET "https://YOUR_PROJECT.supabase.co/rest/v1/eco_interactions?select=*&limit=1" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer YOUR_VALID_USER_JWT"

# Expected: Same denial
```

### Step 5: Monitor Production (24h)

After deployment to production:

1. **Check Error Logs**: Monitor Supabase logs for permission errors
2. **Check Sentry**: Look for analytics-related errors
3. **Verify Metrics**: Ensure analytics data is still being collected
4. **Check Dashboard**: Verify Metabase/analytics dashboards still work

**Key Metrics to Monitor:**

- `analytics.eco_interactions` row count (should keep growing)
- `analytics.eco_feedback` inserts (should continue normally)
- Backend error rate (should remain stable)

## Expected Impact

### ✅ What WILL Work (No Changes)

- **Backend Analytics**: All analytics writes via `service_role` continue normally
- **Conversation Flow**: `/api/ask-eco` analytics persistence works
- **Feedback API**: `/api/feedback` submission continues
- **Passive Signals**: `/api/signal` tracking continues
- **Bandit Updates**: `banditRewardsSync` cron job works normally
- **Admin Dashboards**: Metabase/internal tools using service_role work

### ❌ What WILL Fail (Intentional Security Lockdown)

- **Direct PostgREST Access**: `anon` key cannot query analytics tables via REST API
- **Frontend Direct Reads**: Any attempt to read analytics tables from frontend fails
- **Authenticated User Queries**: Even logged-in users cannot access analytics tables directly

### 🔒 Security Benefits

- **Zero Client Exposure**: Analytics tables completely inaccessible via PostgREST API
- **No Session ID Leaks**: Sensitive columns (session_id) cannot be queried by clients
- **Defense in Depth**: RLS + explicit deny policies + permission revocation
- **Audit Trail**: Explicit policies document security intent

## Troubleshooting

### Issue: Backend analytics INSERT fails

**Symptoms:**
- Errors in backend logs: `permission denied for table eco_interactions`
- Analytics data not being collected

**Diagnosis:**
```bash
# Check if service_role is being used
grep -r "getAnalyticsClient" server/

# Verify client initialization uses service_role key
cat server/services/supabaseClient.ts | grep -A5 "getAnalyticsClient"
```

**Solution:**
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is set in `.env`
2. Check that `getAnalyticsClient()` uses service_role, not anon key
3. If using wrong client, update code to use `getSupabaseAdmin()` or `getAnalyticsClient()`

### Issue: Views return empty results for service_role

**Symptoms:**
- Bandit sync fails to read `eco_bandit_feedback_rewards`
- Analytics views return no data

**Diagnosis:**
```sql
-- Test view access with service_role
SET ROLE service_role;
SELECT COUNT(*) FROM analytics.eco_bandit_feedback_rewards;
RESET ROLE;
```

**Solution:**
```sql
-- Ensure service_role has SELECT on views
GRANT SELECT ON ALL VIEWS IN SCHEMA analytics TO service_role;
```

### Issue: Migration fails to apply

**Symptoms:**
- Error during migration execution
- `CREATE POLICY` fails with "already exists"

**Solution:**
1. Migration is idempotent (uses `IF NOT EXISTS`)
2. Safe to re-run if it fails partway
3. Check pg_policies table for existing deny policies:
```sql
SELECT * FROM pg_policies WHERE schemaname = 'analytics';
```

## Rollback Procedure

**ONLY use if backend functionality breaks after migration!**

```bash
# Apply rollback migration
psql -h db.xxx.supabase.co -U postgres -d postgres \
  -f supabase/migrations/20260211_rollback_analytics_security.sql

# Or via Supabase Dashboard SQL Editor
# Copy content of 20260211_rollback_analytics_security.sql and run
```

**After Rollback:**
1. Database returns to pre-migration state (RLS disabled, no deny policies)
2. **INSECURE STATE**: Analytics tables are again exposed via PostgREST
3. Investigate root cause before re-applying security hardening
4. Fix issue and re-run main migration

## Verification Queries (Quick Reference)

```sql
-- 1. RLS Status
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'analytics';
-- Expected: All true

-- 2. Deny Policies Count
SELECT COUNT(*) FROM pg_policies
WHERE schemaname = 'analytics' AND policyname LIKE 'deny_%';
-- Expected: 22 (2 per table × 11 tables)

-- 3. anon/authenticated Grants (should be 0)
SELECT COUNT(*) FROM information_schema.table_privileges
WHERE table_schema = 'analytics' AND grantee IN ('anon', 'authenticated');
-- Expected: 0

-- 4. service_role Access (should have full access)
SELECT COUNT(DISTINCT table_name) FROM information_schema.table_privileges
WHERE table_schema = 'analytics' AND grantee = 'service_role';
-- Expected: 11 (all tables)
```

## Success Criteria

Migration is successful if ALL of the following are true:

- [x] ✅ All 11 analytics tables have RLS enabled
- [x] ✅ 22 deny-all policies active (2 per table)
- [x] ✅ Zero grants for anon/authenticated on tables and views
- [x] ✅ service_role retains full access (ALL privileges)
- [x] ✅ Backend integration tests pass (analytics INSERTs succeed)
- [x] ✅ PostgREST API lockdown test fails (anon key denied)
- [x] ✅ No errors in backend logs for 24h post-migration
- [x] ✅ Analytics data collection continues normally

## Support

If issues arise:

1. **Check Logs**: Supabase Dashboard → Logs → Postgres Logs
2. **Run Verification**: Execute `20260211_verify_analytics_security.sql`
3. **Test Backend**: Run `test_analytics_backend.js`
4. **Review Migration**: Check for missed grant statements
5. **Rollback if Critical**: Use `20260211_rollback_analytics_security.sql` (emergency only)

## Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase service_role vs anon](https://supabase.com/docs/guides/api/api-keys)
